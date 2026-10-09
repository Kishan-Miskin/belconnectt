import { NextResponse } from "next/server";
import { query, getClient, isDatabaseUnavailableError } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/jwt";
import { parseAndValidate, scheduleInterviewSchema } from "@/lib/validations";
import crypto from "crypto";

// ── GET /api/jobprovider/interviews — List Employer Interviews ───────────
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
        { error: "Forbidden: Only job providers can access interviews" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const conditions: string[] = ["ji.job_provider_id = $1"];
    const params: any[] = [authUser.userId];

    if (status && status !== "all") {
      params.push(status);
      conditions.push(`ji.status = $${params.length}`);
    }

    const sql = `
      SELECT 
        ji.id,
        ji.job_id,
        ji.application_id,
        ji.candidate_id,
        ji.candidate_name,
        ji.job_title,
        ji.interview_date,
        ji.interview_time,
        ji.interview_mode,
        ji.meeting_link,
        ji.location_details,
        ji.status,
        ji.notes,
        ji.created_at,
        c.email AS candidate_email,
        c.phone AS candidate_phone,
        c.avatar AS candidate_avatar
      FROM job_interviews ji
      LEFT JOIN customers c ON ji.candidate_id = c.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY ji.interview_date ASC, ji.interview_time ASC;
    `;

    const res = await query(sql, params);
    return NextResponse.json({ interviews: res.rows });
  } catch (error: any) {
    console.error("GET /api/jobprovider/interviews error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to fetch interviews" },
      { status: 500 }
    );
  }
}

// ── POST /api/jobprovider/interviews — Schedule an Interview ──────────────
export async function POST(request: Request) {
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
        { error: "Forbidden: Only job providers can schedule interviews" },
        { status: 403 }
      );
    }

    const validation = await parseAndValidate(request, scheduleInterviewSchema);
    if (validation.response) return validation.response;

    const {
      applicationId,
      interviewDate,
      interviewTime,
      interviewMode = "In-person",
      meetingLink = "",
      locationDetails = "",
      notes = "",
    } = validation.data;

    // Verify application and job ownership
    const appSql = `
      SELECT ja.id, ja.job_id, ja.candidate_id, ja.candidate_name, ja.status AS current_status, j.title, j.job_provider_id
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      WHERE ja.id = $1
      LIMIT 1;
    `;
    const appRes = await query(appSql, [applicationId]);
    if (appRes.rows.length === 0) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const app = appRes.rows[0];
    if (app.job_provider_id !== authUser.userId && authUser.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: You do not own the job for this candidate" },
        { status: 403 }
      );
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const interviewId = `int_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

      const insertSql = `
        INSERT INTO job_interviews (
          id,
          job_id,
          application_id,
          job_provider_id,
          candidate_id,
          candidate_name,
          job_title,
          interview_date,
          interview_time,
          interview_mode,
          meeting_link,
          location_details,
          status,
          notes,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'scheduled', $13, NOW(), NOW()
        )
        RETURNING *;
      `;

      const interviewRes = await client.query(insertSql, [
        interviewId,
        app.job_id,
        applicationId,
        authUser.userId,
        app.candidate_id,
        app.candidate_name,
        app.title,
        interviewDate,
        interviewTime,
        interviewMode,
        meetingLink?.trim() || null,
        locationDetails?.trim() || null,
        notes?.trim() || null,
      ]);

      // Automatically update candidate status to interview_scheduled
      await client.query(
        `UPDATE job_applications SET status = 'interview_scheduled', status_updated_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [applicationId]
      );

      // Audit event
      await client.query(
        `INSERT INTO job_application_events (
          application_id, actor_id, actor_role, event_type, from_status, to_status, meta, created_at
        ) VALUES ($1, $2, $3, 'interview_scheduled', $4, 'interview_scheduled', $5, NOW())`,
        [
          applicationId,
          authUser.userId,
          "job_provider",
          app.current_status,
          JSON.stringify({ interviewDate, interviewTime, interviewMode, meetingLink, locationDetails }),
        ]
      );

      // In-app Notification for Candidate
      const notifId = `notif_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
      await client.query(
        `INSERT INTO notifications (id, user_id, type, title, body, created_at)
         VALUES ($1, $2, 'job_interview', $3, $4, NOW())`,
        [
          notifId,
          app.candidate_id,
          `Interview Scheduled: ${app.title}`,
          `An interview has been scheduled for your application to "${app.title}" on ${interviewDate} at ${interviewTime} (${interviewMode}).`,
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        interview: interviewRes.rows[0],
        message: "Interview scheduled successfully",
      }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("POST /api/jobprovider/interviews error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to schedule interview" },
      { status: 500 }
    );
  }
}

// ── PATCH /api/jobprovider/interviews — Update Interview Status ───────────
export async function PATCH(request: Request) {
  try {
    const authUser = getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authentication token" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { interviewId, status, meetingLink, locationDetails, notes } = body;

    if (!interviewId || !status) {
      return NextResponse.json(
        { error: "Interview ID and status are required" },
        { status: 400 }
      );
    }

    const checkRes = await query(
      `SELECT id, job_provider_id FROM job_interviews WHERE id = $1 LIMIT 1`,
      [interviewId]
    );
    if (checkRes.rows.length === 0) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    if (checkRes.rows[0].job_provider_id !== authUser.userId && authUser.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: You do not own this interview record" },
        { status: 403 }
      );
    }

    const updates: string[] = ["status = $2", "updated_at = NOW()"];
    const values: any[] = [interviewId, status];

    if (meetingLink !== undefined) {
      values.push(meetingLink);
      updates.push(`meeting_link = $${values.length}`);
    }
    if (locationDetails !== undefined) {
      values.push(locationDetails);
      updates.push(`location_details = $${values.length}`);
    }
    if (notes !== undefined) {
      values.push(notes);
      updates.push(`notes = $${values.length}`);
    }

    const updateSql = `
      UPDATE job_interviews
      SET ${updates.join(", ")}
      WHERE id = $1
      RETURNING *;
    `;
    const updateRes = await query(updateSql, values);

    return NextResponse.json({
      success: true,
      interview: updateRes.rows[0],
      message: `Interview status updated to ${status}`,
    });
  } catch (error: any) {
    console.error("PATCH /api/jobprovider/interviews error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to update interview" },
      { status: 500 }
    );
  }
}
