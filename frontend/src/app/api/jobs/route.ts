import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { query, isDatabaseUnavailableError } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/jwt";
import { parseAndValidate, createJobSchema } from "@/lib/validations";
import { checkRateLimit } from "@/lib/rateLimit";
import crypto from "crypto";

// ── GET /api/jobs — Public Keyset Paginated Search & Feed ────────────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const category = searchParams.get("category")?.trim() || "";
    const jobType = searchParams.get("job_type")?.trim() || "";
    const workMode = searchParams.get("work_mode")?.trim() || "";
    const location = searchParams.get("location")?.trim() || "";
    const cursor = searchParams.get("cursor"); // created_at ISO string
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10), 1), 50);

    const conditions: string[] = ["j.status = 'active'"];
    const params: any[] = [];

    if (q) {
      params.push(q);
      const pIdx = params.length;
      conditions.push(
        `(j.search_tsv @@ websearch_to_tsquery('english', $${pIdx}) OR j.title % $${pIdx} OR j.location % $${pIdx} OR bp.company_name ILIKE ('%' || $${pIdx} || '%'))`
      );
    }

    if (category && category !== "all") {
      params.push(category);
      conditions.push(`j.category = $${params.length}`);
    }

    if (jobType && jobType !== "all") {
      params.push(jobType);
      conditions.push(`j.job_type = $${params.length}`);
    }

    if (workMode && workMode !== "all") {
      params.push(workMode);
      conditions.push(`j.work_mode = $${params.length}`);
    }

    if (location && location !== "all") {
      params.push(`%${location}%`);
      conditions.push(`j.location ILIKE $${params.length}`);
    }

    if (cursor) {
      params.push(cursor);
      conditions.push(`COALESCE(j.published_at, j.created_at) < $${params.length}`);
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
        j.published_at,
        j.created_at,
        j.updated_at,
        j.applicants_count,
        COALESCE(NULLIF(TRIM(bp.company_name), ''), NULLIF(TRIM(jp.name), ''), 'Company Profile Pending') AS company_name,
        bp.logo_url AS company_logo,
        bp.city AS company_city
      FROM jobs j
      LEFT JOIN business_profiles bp ON j.job_provider_id = bp.job_provider_id
      LEFT JOIN job_providers jp ON j.job_provider_id = jp.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY j.is_boosted DESC, COALESCE(j.published_at, j.created_at) DESC, j.id DESC
      LIMIT $${limitIdx};
    `;

    const dataRes = await query(sql, params);
    const hasMore = dataRes.rows.length > limit;
    const jobs = hasMore ? dataRes.rows.slice(0, limit) : dataRes.rows;
    const nextCursor = jobs.length > 0 ? (jobs[jobs.length - 1].published_at || jobs[jobs.length - 1].created_at) : null;

    return NextResponse.json(
      {
        jobs,
        hasMore,
        nextCursor,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error: any) {
    console.error("GET /api/jobs error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to fetch job listings" },
      { status: 500 }
    );
  }
}

// ── POST /api/jobs — Create New Job Listing (Employer / Job Provider) ─────
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
        { error: "Forbidden: Only job providers can post job listings" },
        { status: 403 }
      );
    }

    const rateCheck = await checkRateLimit(request, 20, 60 * 60 * 1000);
    if (!rateCheck.isAllowed && rateCheck.response) {
      return rateCheck.response;
    }

    const validation = await parseAndValidate(request, createJobSchema);
    if (validation.response) return validation.response;

    const data = validation.data;

    // Fetch default contact email from business profile if not specified
    let contactEmail = data.contactEmail?.trim() || "";
    if (!contactEmail) {
      const bpRes = await query(
        `SELECT contact_email FROM business_profiles WHERE job_provider_id = $1 LIMIT 1`,
        [authUser.userId]
      );
      contactEmail = bpRes.rows[0]?.contact_email || authUser.email;
    }

    const jobId = `job_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const status = data.status || "active";
    const publishedAt = status === "active" ? new Date() : null;

    const insertSql = `
      INSERT INTO jobs (
        id,
        job_provider_id,
        title,
        category,
        job_type,
        work_mode,
        location,
        salary_type,
        salary_min,
        salary_max,
        salary_currency,
        salary_text,
        openings,
        experience_required,
        education_required,
        description,
        responsibilities,
        requirements,
        perks_benefits,
        deadline,
        status,
        contact_email,
        published_at,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW(), NOW()
      )
      RETURNING *;
    `;

    const res = await query(insertSql, [
      jobId,
      authUser.userId,
      data.title,
      data.category,
      data.jobType,
      data.workMode,
      data.location,
      data.salaryType,
      data.salaryMin ? Number(data.salaryMin) : null,
      data.salaryMax ? Number(data.salaryMax) : null,
      data.salaryCurrency,
      data.salaryText || null,
      Number(data.openings) || 1,
      data.experienceRequired || null,
      data.educationRequired || null,
      data.description,
      data.responsibilities || null,
      data.requirements || null,
      data.perksBenefits || null,
      data.deadline ? data.deadline : null,
      status,
      contactEmail,
      publishedAt,
    ]);

    try {
      revalidateTag("jobs-feed", "max");
    } catch {
      // Ignore cache revalidation errors if outside Next ISR context
    }

    return NextResponse.json({ success: true, job: res.rows[0] }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/jobs error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to create job post" },
      { status: 500 }
    );
  }
}
