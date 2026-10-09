import { NextResponse } from "next/server";
import { query, isDatabaseUnavailableError } from "@/lib/db";

export const revalidate = 60; // 60 seconds ISR cache

export async function GET() {
  try {
    const sql = `
      SELECT 
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
        j.published_at,
        j.created_at,
        j.is_boosted,
        COALESCE(NULLIF(TRIM(bp.company_name), ''), NULLIF(TRIM(jp.name), ''), 'Company Profile Pending') AS company_name,
        bp.logo_url AS company_logo
      FROM jobs j
      LEFT JOIN business_profiles bp ON j.job_provider_id = bp.job_provider_id
      LEFT JOIN job_providers jp ON j.job_provider_id = jp.id
      WHERE j.status = 'active'
      ORDER BY j.is_boosted DESC, COALESCE(j.published_at, j.created_at) DESC
      LIMIT 8;
    `;

    const res = await query(sql);

    return NextResponse.json(
      { jobs: res.rows },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error: any) {
    console.error("GET /api/jobs/featured error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { error: "Database temporarily unavailable" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch featured jobs" },
      { status: 500 }
    );
  }
}
