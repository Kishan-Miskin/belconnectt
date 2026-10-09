import { NextResponse } from "next/server";
import { after } from "next/server";
import { query, getClient, isDatabaseUnavailableError } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/jwt";
import { parseAndValidate, sendAssessmentSchema } from "@/lib/validations";
import { sendCandidateNotificationEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  try {
    const authUser = getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authentication token" },
        { status: 401 }
      );
    }

    if (authUser.role !== "job_provider" && authUser.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Only job providers can send assessments" },
        { status: 403 }
      );
    }

    const resolvedParams = await params;
    const applicationId = resolvedParams.applicationId;

    const validation = await parseAndValidate(request, sendAssessmentSchema);
    if (validation.response) return validation.response;
    const { assessmentUrl, dueAt, instructions } = validation.data;

    // Verify application & ownership
    const checkSql = `
      SELECT 
        ja.id,
        ja.candidate_id,
        ja.candidate_name,
        ja.candidate_email,
        ja.status AS current_status,
        j.id AS job_id,
        j.title AS job_title,
        j.job_provider_id
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      WHERE ja.id = $1
      LIMIT 1;
    `;

    const checkRes = await query(checkSql, [applicationId]);
    if (checkRes.rows.length === 0) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const app = checkRes.rows[0];
    if (app.job_provider_id !== authUser.userId && authUser.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: You do not own the job for this candidate" },
        { status: 403 }
      );
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Update application
      const updateSql = `
        UPDATE job_applications
        SET 
          assessment_url = $1,
          assessment_instructions = $2,
          assessment_due_at = $3,
          assessment_sent_at = NOW(),
          status = 'assessment_sent',
          status_updated_at = NOW(),
          updated_at = NOW()
        WHERE id = $4
        RETURNING *;
      `;
      const updatedRes = await client.query(updateSql, [
        assessmentUrl,
        instructions || null,
        dueAt || null,
        applicationId,
      ]);

      // Audit event
      await client.query(
        `INSERT INTO job_application_events (
          application_id, actor_id, actor_role, event_type, from_status, to_status, meta, created_at
        ) VALUES ($1, $2, $3, 'assessment_sent', $4, 'assessment_sent', $5, NOW())`,
        [
          applicationId,
          authUser.userId,
          "job_provider",
          app.current_status,
          JSON.stringify({ assessmentUrl, dueAt, instructions }),
        ]
      );

      // In-app Notification for Candidate
      const notifId = `notif_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
      await client.query(
        `INSERT INTO notifications (id, user_id, type, title, body, created_at)
         VALUES ($1, $2, 'job_assessment', $3, $4, NOW())`,
        [
          notifId,
          app.candidate_id,
          `Assessment Link Received: ${app.job_title}`,
          `You have received an assessment for your application to "${app.job_title}". Please complete it by ${dueAt ? new Date(dueAt).toLocaleDateString() : "the specified deadline"}.`,
        ]
      );

      await client.query("COMMIT");

      // Optional background email to candidate
      after(async () => {
        try {
          await sendCandidateNotificationEmail({
            to: app.candidate_email,
            candidateName: app.candidate_name,
            jobTitle: app.job_title,
            subject: `Assessment for ${app.job_title}`,
            message: `The employer has sent an assessment link for your application to "${app.job_title}".\n\nLink: ${assessmentUrl}\n\n${instructions ? `Instructions: ${instructions}\n` : ""}${dueAt ? `Due Date: ${new Date(dueAt).toLocaleString()}` : ""}`,
          });
        } catch (e) {
          console.error("Background assessment email error:", e);
        }
      });

      return NextResponse.json({
        success: true,
        application: updatedRes.rows[0],
        message: "Assessment link sent successfully",
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("POST /api/jobprovider/candidates/[applicationId]/assessment error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to send assessment" }, { status: 500 });
  }
}
