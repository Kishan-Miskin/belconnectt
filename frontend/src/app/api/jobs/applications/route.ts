import { NextResponse } from "next/server";
import { query, isDatabaseUnavailableError } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/jwt";

// ── GET /api/jobs/applications — Candidate's Own Applications (Job Seeker) ─
export async function GET(request: Request) {
  try {
    const authUser = getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authentication session" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10), 1), 50);
    const cursor = searchParams.get("cursor"); // created_at

    const conditions: string[] = ["ja.candidate_id = $1"];
    const params: any[] = [authUser.userId];

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
        ja.status_updated_at,
        ja.created_at,
        ja.updated_at,
        j.title AS job_title,
        j.category AS job_category,
        j.job_type,
        j.work_mode,
        j.location AS job_location,
        j.status AS job_status,
        COALESCE(j.contact_email, bp.contact_email, jp.email) AS contact_email,
        COALESCE(NULLIF(TRIM(bp.company_name), ''), NULLIF(TRIM(jp.name), ''), 'Company Profile Pending') AS company_name,
        bp.logo_url AS company_logo
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      LEFT JOIN business_profiles bp ON j.job_provider_id = bp.job_provider_id
      LEFT JOIN job_providers jp ON j.job_provider_id = jp.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY ja.created_at DESC
      LIMIT $${limitIdx};
    `;

    const res = await query(sql, params);
    const hasMore = res.rows.length > limit;
    const apps = hasMore ? res.rows.slice(0, limit) : res.rows;
    const nextCursor = apps.length > 0 ? apps[apps.length - 1].created_at : null;

    if (apps.length === 0) {
      return NextResponse.json({ applications: [], hasMore: false });
    }

    const appIds = apps.map((a) => a.id);

    // Fetch timeline events for these applications
    const eventsRes = await query(
      `SELECT id, application_id, actor_role, event_type, from_status, to_status, meta, created_at
       FROM job_application_events
       WHERE application_id = ANY($1)
       ORDER BY created_at ASC`,
      [appIds]
    );

    // Fetch scheduled interviews for these applications
    const interviewsRes = await query(
      `SELECT id, application_id, interview_date, interview_time, interview_mode, meeting_link, location_details, status, notes
       FROM job_interviews
       WHERE application_id = ANY($1)
       ORDER BY interview_date ASC`,
      [appIds]
    );

    const eventsMap = new Map<string, any[]>();
    eventsRes.rows.forEach((e) => {
      const list = eventsMap.get(e.application_id) || [];
      list.push(e);
      eventsMap.set(e.application_id, list);
    });

    const interviewsMap = new Map<string, any>();
    interviewsRes.rows.forEach((i) => {
      interviewsMap.set(i.application_id, i);
    });

    const enrichedApplications = apps.map((app) => ({
      ...app,
      events: eventsMap.get(app.id) || [],
      interview: interviewsMap.get(app.id) || null,
    }));

    return NextResponse.json({
      applications: enrichedApplications,
      hasMore,
      nextCursor,
    });
  } catch (error: any) {
    console.error("GET /api/jobs/applications error:", error?.message || error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to fetch candidate applications" },
      { status: 500 }
    );
  }
}
