import { NextResponse } from "next/server";
import { query, getClient, isDatabaseUnavailableError } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/jwt";
import { parseAndValidate, updateCandidateStatusSchema } from "@/lib/validations";
import crypto from "crypto";

// ── GET /api/jobprovider/candidates — Applications Across Employer Jobs ─
export async function GET(request: Request) {
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
        { error: "Forbidden: Only job providers can view candidates" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const jobId = searchParams.get("job_id") || searchParams.get("jobId");
    const q = searchParams.get("q")?.trim() || "";
    const cursor = searchParams.get("cursor");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10), 1), 50);

    const conditions: string[] = ["j.job_provider_id = $1"];
    const params: any[] = [authUser.userId];

    if (status && status !== "all") {
      params.push(status);
      conditions.push(`ja.status = $${params.length}`);
    }

    if (jobId && jobId !== "all") {
      params.push(jobId);
      conditions.push(`ja.job_id = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      const pIdx = params.length;
      conditions.push(
        `(ja.candidate_name ILIKE $${pIdx} OR ja.candidate_email ILIKE $${pIdx} OR j.title ILIKE $${pIdx} OR ja.location ILIKE $${pIdx})`
      );
    }

    if (cursor) {
      params.push(cursor);
      conditions.push(`ja.created_at < $${params.length}`);
    }

    params.push(limit + 1);
    const limitIdx = params.length;

    const sql = `
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
        j.title AS job_title,
        j.category AS job_category,
        j.job_type,
        c.avatar AS candidate_avatar
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      LEFT JOIN customers c ON ja.candidate_id = c.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY ja.created_at DESC
      LIMIT $${limitIdx};
    `;

    const res = await query(sql, params);
    const hasMore = res.rows.length > limit;
    const candidates = hasMore ? res.rows.slice(0, limit) : res.rows;
    const nextCursor = candidates.length > 0 ? candidates[candidates.length - 1].created_at : null;

    return NextResponse.json({
      candidates,
      hasMore,
      nextCursor,
    });
  } catch (error: any) {
    console.error("GET /api/jobprovider/candidates error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to fetch candidates" },
      { status: 500 }
    );
  }
}

// Allowed status transitions map
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  new: ["reviewed", "shortlisted", "rejected", "withdrawn"],
  reviewed: ["shortlisted", "assessment_sent", "interview_scheduled", "rejected", "hired", "withdrawn"],
  shortlisted: ["assessment_sent", "interview_scheduled", "rejected", "hired", "withdrawn"],
  assessment_sent: ["interview_scheduled", "rejected", "hired", "shortlisted", "withdrawn"],
  interview_scheduled: ["rejected", "hired", "shortlisted", "withdrawn"],
  rejected: ["shortlisted", "reviewed"],
  hired: ["closed"],
  withdrawn: [],
};

// ── PATCH /api/jobprovider/candidates — Update Candidate Status ───────────
export async function PATCH(request: Request) {
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
        { error: "Forbidden: Only job providers can update candidate status" },
        { status: 403 }
      );
    }

    const validation = await parseAndValidate(request, updateCandidateStatusSchema);
    if (validation.response) return validation.response;
    const { applicationId, status: newStatus } = validation.data;

    // Verify application & job ownership
    const checkSql = `
      SELECT 
        ja.id,
        ja.candidate_id,
        ja.candidate_name,
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
        { error: "Forbidden: You do not own the job for this application" },
        { status: 403 }
      );
    }

    const currentStatus = app.current_status || "new";
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || Object.keys(ALLOWED_TRANSITIONS);

    if (!allowed.includes(newStatus) && authUser.role !== "admin") {
      return NextResponse.json(
        { error: `Invalid status transition from '${currentStatus}' to '${newStatus}'` },
        { status: 400 }
      );
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const updateSql = `
        UPDATE job_applications
        SET status = $1, status_updated_at = NOW(), reviewed_by = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING *;
      `;
      const updateRes = await client.query(updateSql, [newStatus, authUser.userId, applicationId]);

      // Insert audit event
      await client.query(
        `INSERT INTO job_application_events (
          application_id, actor_id, actor_role, event_type, from_status, to_status, created_at
        ) VALUES ($1, $2, $3, 'status_changed', $4, $5, NOW())`,
        [applicationId, authUser.userId, "job_provider", currentStatus, newStatus]
      );

      // Insert candidate notification
      const notifId = `notif_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
      const readableStatus = newStatus.replace("_", " ").toUpperCase();
      await client.query(
        `INSERT INTO notifications (id, user_id, type, title, body, created_at)
         VALUES ($1, $2, 'job_status_update', $3, $4, NOW())`,
        [
          notifId,
          app.candidate_id,
          `Application Status Updated: ${app.job_title}`,
          `Your application status for "${app.job_title}" has been updated to: ${readableStatus}.`,
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        application: updateRes.rows[0],
        message: `Candidate status updated to ${newStatus}`,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("PATCH /api/jobprovider/candidates error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to update candidate status" },
      { status: 500 }
    );
  }
}
