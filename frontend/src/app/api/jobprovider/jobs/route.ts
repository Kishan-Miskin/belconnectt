import { NextResponse } from "next/server";
import { query, isDatabaseUnavailableError } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/jwt";

// ── GET /api/jobprovider/jobs — List Employer's Posted Jobs ───────────────
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
        { error: "Forbidden: Only job providers can access employer jobs" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const cursor = searchParams.get("cursor");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10), 1), 50);

    const conditions: string[] = ["j.job_provider_id = $1"];
    const params: any[] = [authUser.userId];

    if (status && status !== "all") {
      params.push(status);
      conditions.push(`j.status = $${params.length}`);
    }

    if (cursor) {
      params.push(cursor);
      conditions.push(`j.created_at < $${params.length}`);
    }

    params.push(limit + 1);
    const limitIdx = params.length;

    const sql = `
      SELECT 
        j.id,
        j.job_provider_id,
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
        j.openings,
        j.experience_required,
        j.education_required,
        j.deadline,
        j.status,
        j.views_count,
        j.is_boosted,
        j.contact_email,
        j.published_at,
        j.applicants_count,
        j.created_at,
        j.updated_at
      FROM jobs j
      WHERE ${conditions.join(" AND ")}
      ORDER BY j.created_at DESC
      LIMIT $${limitIdx};
    `;

    const res = await query(sql, params);
    const hasMore = res.rows.length > limit;
    const jobs = hasMore ? res.rows.slice(0, limit) : res.rows;
    const nextCursor = jobs.length > 0 ? jobs[jobs.length - 1].created_at : null;

    return NextResponse.json({
      jobs,
      hasMore,
      nextCursor,
    });
  } catch (error: any) {
    console.error("GET /api/jobprovider/jobs error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to fetch employer jobs" },
      { status: 500 }
    );
  }
}
