import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/jwt";

// ── GET /api/jobs/saved — Candidate's Saved / Bookmarked Jobs ─────────────
export async function GET(request: Request) {
  try {
    const authUser = getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authentication session" },
        { status: 401 }
      );
    }

    const sql = `
      SELECT 
        sj.id AS save_id,
        sj.created_at AS saved_at,
        j.id,
        j.title,
        j.category,
        j.job_type,
        j.work_mode,
        j.location,
        j.salary_type,
        j.salary_min,
        j.salary_max,
        j.salary_currency,
        j.salary_text,
        j.status,
        j.deadline,
        COALESCE(NULLIF(TRIM(bp.company_name), ''), NULLIF(TRIM(jp.name), ''), 'Company Profile Pending') AS company_name,
        bp.logo_url AS company_logo
      FROM job_saved_jobs sj
      JOIN jobs j ON sj.job_id = j.id
      LEFT JOIN business_profiles bp ON j.job_provider_id = bp.job_provider_id
      LEFT JOIN job_providers jp ON j.job_provider_id = jp.id
      WHERE sj.user_id = $1
      ORDER BY sj.created_at DESC;
    `;

    const res = await query(sql, [authUser.userId]);
    return NextResponse.json({ savedJobs: res.rows });
  } catch (error: any) {
    console.error("GET /api/jobs/saved error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to fetch saved jobs" },
      { status: 500 }
    );
  }
}
