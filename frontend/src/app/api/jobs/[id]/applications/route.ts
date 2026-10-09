import { NextResponse } from "next/server";
import { query, getClient, isDatabaseUnavailableError } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/jwt";
import { checkRateLimit } from "@/lib/rateLimit";
import crypto from "crypto";

// ── POST /api/jobs/[id]/applications — Apply to Job (Candidate / User) ───
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Please log in to apply for this job" },
        { status: 401 }
      );
    }

    const rateCheck = await checkRateLimit(request, 10, 60 * 60 * 1000);
    if (!rateCheck.isAllowed && rateCheck.response) {
      return rateCheck.response;
    }

    const { id: jobId } = await params;
    if (!jobId) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    const body = await request.json();
    const {
      candidateName,
      candidateEmail,
      candidatePhone = "",
      experience = "",
      location = "Belagavi",
      resumePath = "",
      resumeFilename = "",
      resumeMime = "",
      resumeSize = null,
      resumeUrl = "",
      coverNote = "",
    } = body;

    const name = candidateName?.trim() || authUser.name || "Candidate";
    const email = candidateEmail?.trim() || authUser.email;

    if (!name) {
      return NextResponse.json({ error: "Candidate name is required" }, { status: 400 });
    }
    if (!email) {
      return NextResponse.json({ error: "Candidate email is required" }, { status: 400 });
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Verify job exists and is active
      const jobRes = await client.query(
        `SELECT id, title, status, deadline, job_provider_id FROM jobs WHERE id = $1 LIMIT 1 FOR SHARE`,
        [jobId]
      );
      if (jobRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Job listing not found" }, { status: 404 });
      }

      const job = jobRes.rows[0];
      if (job.status !== "active") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "This job opening is no longer accepting applications" },
          { status: 400 }
        );
      }

      if (job.deadline && new Date(job.deadline) < new Date()) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "The deadline for this job listing has passed" },
          { status: 400 }
        );
      }

      if (job.job_provider_id === authUser.userId) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "You cannot apply to your own job listing" },
          { status: 400 }
        );
      }

      // Check duplicate application
      const existing = await client.query(
        `SELECT id FROM job_applications WHERE job_id = $1 AND candidate_id = $2 LIMIT 1`,
        [jobId, authUser.userId]
      );
      if (existing.rows.length > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "You have already applied for this position" },
          { status: 409 }
        );
      }

      const appId = `app_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
      const finalResumePath = resumePath || resumeUrl;

      const insertSql = `
        INSERT INTO job_applications (
          id,
          job_id,
          candidate_id,
          candidate_name,
          candidate_email,
          candidate_phone,
          experience,
          location,
          resume_url,
          resume_path,
          resume_filename,
          resume_mime,
          resume_size,
          cover_note,
          status,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'new', NOW(), NOW()
        )
        RETURNING *;
      `;

      const res = await client.query(insertSql, [
        appId,
        jobId,
        authUser.userId,
        name,
        email,
        candidatePhone?.trim() || null,
        experience?.trim() || null,
        location?.trim() || null,
        finalResumePath,
        finalResumePath,
        resumeFilename || "resume.pdf",
        resumeMime || "application/pdf",
        resumeSize ? Number(resumeSize) : null,
        coverNote?.trim() || null,
      ]);

      // Audit event
      await client.query(
        `INSERT INTO job_application_events (
          application_id, actor_id, actor_role, event_type, from_status, to_status, meta, created_at
        ) VALUES ($1, $2, $3, 'application_submitted', null, 'new', $4, NOW())`,
        [appId, authUser.userId, "candidate", JSON.stringify({ candidateName: name, candidateEmail: email })]
      );

      await client.query("COMMIT");

      return NextResponse.json(
        { success: true, application: res.rows[0], message: "Application submitted successfully" },
        { status: 201 }
      );
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      if (err.code === "23505") {
        return NextResponse.json(
          { error: "You have already applied for this position" },
          { status: 409 }
        );
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("POST /api/jobs/[id]/applications error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to submit job application" },
      { status: 500 }
    );
  }
}

// ── GET /api/jobs/[id]/applications — List Applications for Job (Employer) ─
export async function GET(
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

    const { id: jobId } = await params;
    if (!jobId) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    // Verify ownership
    const jobRes = await query(
      `SELECT job_provider_id FROM jobs WHERE id = $1 LIMIT 1`,
      [jobId]
    );
    if (jobRes.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (jobRes.rows[0].job_provider_id !== authUser.userId && authUser.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to view these applicants" },
        { status: 403 }
      );
    }

    const appsSql = `
      SELECT 
        ja.id,
        ja.job_id,
        ja.candidate_id,
        ja.candidate_name,
        ja.candidate_email,
        ja.candidate_phone,
        ja.experience,
        ja.location,
        ja.resume_url,
        ja.resume_path,
        ja.resume_filename,
        ja.resume_mime,
        ja.resume_size,
        ja.assessment_url,
        ja.assessment_instructions,
        ja.assessment_due_at,
        ja.assessment_sent_at,
        ja.cover_note,
        ja.status,
        ja.created_at,
        ja.updated_at,
        c.avatar AS candidate_avatar
      FROM job_applications ja
      LEFT JOIN customers c ON ja.candidate_id = c.id
      WHERE ja.job_id = $1
      ORDER BY ja.created_at DESC;
    `;

    const appsRes = await query(appsSql, [jobId]);

    return NextResponse.json({ applications: appsRes.rows });
  } catch (error: any) {
    console.error("GET /api/jobs/[id]/applications error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to fetch applications" },
      { status: 500 }
    );
  }
}
