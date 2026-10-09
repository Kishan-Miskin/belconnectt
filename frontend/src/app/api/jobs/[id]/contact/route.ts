import { NextResponse } from "next/server";
import { after } from "next/server";
import { query, isDatabaseUnavailableError } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/jwt";
import { parseAndValidate, contactEmployerSchema } from "@/lib/validations";
import { checkRateLimit } from "@/lib/rateLimit";
import { sendJobContactEmail } from "@/lib/email";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authentication token" },
        { status: 401 }
      );
    }

    const rateCheck = await checkRateLimit(request, 5, 60 * 60 * 1000);
    if (!rateCheck.isAllowed && rateCheck.response) {
      return rateCheck.response;
    }

    const resolvedParams = await params;
    const jobId = resolvedParams.id;

    const validation = await parseAndValidate(request, contactEmployerSchema);
    if (validation.response) return validation.response;
    const { subject, body } = validation.data;

    // Fetch job & job provider details
    const jobSql = `
      SELECT 
        j.id,
        j.title,
        j.job_provider_id,
        j.contact_email,
        bp.contact_email AS bp_email,
        jp.email AS jp_email
      FROM jobs j
      LEFT JOIN business_profiles bp ON j.job_provider_id = bp.job_provider_id
      LEFT JOIN job_providers jp ON j.job_provider_id = jp.id
      WHERE j.id = $1
      LIMIT 1;
    `;

    const jobRes = await query(jobSql, [jobId]);
    if (jobRes.rows.length === 0) {
      return NextResponse.json({ error: "Job listing not found" }, { status: 404 });
    }

    const job = jobRes.rows[0];
    const targetEmail = job.contact_email || job.bp_email || job.jp_email;

    if (!targetEmail) {
      return NextResponse.json(
        { error: "Employer contact email is not available for this job" },
        { status: 400 }
      );
    }

    // Fetch candidate info (name, email)
    const candidateRes = await query(
      `SELECT name, email FROM customers WHERE id = $1 LIMIT 1`,
      [authUser.userId]
    );

    const candidateName = candidateRes.rows[0]?.name || authUser.email || "BelConnect Candidate";
    const candidateEmail = candidateRes.rows[0]?.email || authUser.email;

    // Insert job_messages row
    const messageSql = `
      INSERT INTO job_messages (
        job_id,
        from_user_id,
        to_job_provider_id,
        from_email,
        subject,
        body,
        email_status,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 'queued', NOW()
      )
      RETURNING id;
    `;

    const messageRes = await query(messageSql, [
      jobId,
      authUser.userId,
      job.job_provider_id,
      candidateEmail,
      subject,
      body,
    ]);

    const messageId = messageRes.rows[0]?.id;

    // Asynchronously send email in background using Next.js after()
    after(async () => {
      try {
        const result = await sendJobContactEmail({
          to: targetEmail,
          replyTo: candidateEmail,
          candidateName,
          jobTitle: job.title,
          subject,
          body,
        });

        const newStatus = result.success ? "sent" : "failed";
        await query(
          `UPDATE job_messages SET email_status = $1 WHERE id = $2`,
          [newStatus, messageId]
        );
      } catch (err) {
        console.error("Background email relay error:", err);
        await query(
          `UPDATE job_messages SET email_status = 'failed' WHERE id = $1`,
          [messageId]
        );
      }
    });

    return NextResponse.json({
      success: true,
      message: "Message sent to employer successfully",
      messageId,
    }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/jobs/[id]/contact error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to send message to employer" }, { status: 500 });
  }
}
