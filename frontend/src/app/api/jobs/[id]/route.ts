import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { query, isDatabaseUnavailableError } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/jwt";


// ── GET /api/jobs/[id] — Public Job Detail View ──────────────────────────
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    // Increment views_count asynchronously
    query(`UPDATE jobs SET views_count = views_count + 1 WHERE id = $1`, [id]).catch(() => {});

    const jobSql = `
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
        j.description,
        j.responsibilities,
        j.requirements,
        j.perks_benefits,
        j.deadline,
        j.status,
        j.views_count,
        j.is_boosted,
        j.created_at,
        j.updated_at,
        COALESCE(NULLIF(TRIM(bp.company_name), ''), NULLIF(TRIM(jp.name), ''), 'Company Profile Pending') AS company_name,
        bp.industry AS company_industry,
        bp.company_size,
        bp.city AS company_city,
        bp.office_address AS company_address,
        bp.website AS company_website,
        bp.about_company,
        bp.logo_url AS company_logo,
        (SELECT COUNT(*)::int FROM job_applications ja WHERE ja.job_id = j.id) AS applicants_count
      FROM jobs j
      LEFT JOIN business_profiles bp ON j.job_provider_id = bp.job_provider_id
      LEFT JOIN job_providers jp ON j.job_provider_id = jp.id
      WHERE j.id = $1
      LIMIT 1;
    `;

    const res = await query(jobSql, [id]);
    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const job = res.rows[0];

    // Check application & save status for authenticated user
    let hasApplied = false;
    let applicationStatus: string | null = null;
    let isSaved = false;

    const authUser = getAuthenticatedUser(request);
    if (authUser) {
      const appCheck = await query(
        `SELECT id, status FROM job_applications WHERE job_id = $1 AND candidate_id = $2 LIMIT 1`,
        [id, authUser.userId]
      );
      if (appCheck.rows.length > 0) {
        hasApplied = true;
        applicationStatus = appCheck.rows[0].status;
      }

      const saveCheck = await query(
        `SELECT id FROM job_saved_jobs WHERE job_id = $1 AND user_id = $2 LIMIT 1`,
        [id, authUser.userId]
      );
      if (saveCheck.rows.length > 0) {
        isSaved = true;
      }
    }

    return NextResponse.json({
      job,
      userContext: {
        hasApplied,
        applicationStatus,
        isSaved,
      },
    });
  } catch (error: any) {
    console.error("GET /api/jobs/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch job details" },
      { status: 500 }
    );
  }
}

// ── PATCH /api/jobs/[id] — Update Job or Status (Employer Only) ───────────
export async function PATCH(
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

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    // Verify ownership
    const ownerRes = await query(
      `SELECT job_provider_id FROM jobs WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (ownerRes.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const job = ownerRes.rows[0];
    if (job.job_provider_id !== authUser.userId && authUser.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: You do not own this job listing" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      title,
      category,
      jobType,
      workMode,
      location,
      salaryType,
      salaryMin,
      salaryMax,
      salaryCurrency,
      salaryText,
      openings,
      experienceRequired,
      educationRequired,
      description,
      responsibilities,
      requirements,
      perksBenefits,
      deadline,
      status,
    } = body;

    const updates: string[] = ["updated_at = NOW()"];
    const values: any[] = [id];

    if (status !== undefined) {
      values.push(status);
      updates.push(`status = $${values.length}`);
    }
    if (title !== undefined) {
      values.push(title.trim());
      updates.push(`title = $${values.length}`);
    }
    if (category !== undefined) {
      values.push(category.trim());
      updates.push(`category = $${values.length}`);
    }
    if (jobType !== undefined) {
      values.push(jobType.trim());
      updates.push(`job_type = $${values.length}`);
    }
    if (workMode !== undefined) {
      values.push(workMode.trim());
      updates.push(`work_mode = $${values.length}`);
    }
    if (location !== undefined) {
      values.push(location.trim());
      updates.push(`location = $${values.length}`);
    }
    if (salaryType !== undefined) {
      values.push(salaryType.trim());
      updates.push(`salary_type = $${values.length}`);
    }
    if (salaryMin !== undefined) {
      values.push(salaryMin ? parseFloat(salaryMin) : null);
      updates.push(`salary_min = $${values.length}`);
    }
    if (salaryMax !== undefined) {
      values.push(salaryMax ? parseFloat(salaryMax) : null);
      updates.push(`salary_max = $${values.length}`);
    }
    if (salaryCurrency !== undefined) {
      values.push(salaryCurrency.trim());
      updates.push(`salary_currency = $${values.length}`);
    }
    if (salaryText !== undefined) {
      values.push(salaryText?.trim() || null);
      updates.push(`salary_text = $${values.length}`);
    }
    if (openings !== undefined) {
      values.push(parseInt(openings, 10) || 1);
      updates.push(`openings = $${values.length}`);
    }
    if (experienceRequired !== undefined) {
      values.push(experienceRequired?.trim() || null);
      updates.push(`experience_required = $${values.length}`);
    }
    if (educationRequired !== undefined) {
      values.push(educationRequired?.trim() || null);
      updates.push(`education_required = $${values.length}`);
    }
    if (description !== undefined) {
      values.push(description.trim());
      updates.push(`description = $${values.length}`);
    }
    if (responsibilities !== undefined) {
      values.push(responsibilities?.trim() || null);
      updates.push(`responsibilities = $${values.length}`);
    }
    if (requirements !== undefined) {
      values.push(requirements?.trim() || null);
      updates.push(`requirements = $${values.length}`);
    }
    if (perksBenefits !== undefined) {
      values.push(perksBenefits?.trim() || null);
      updates.push(`perks_benefits = $${values.length}`);
    }
    if (deadline !== undefined) {
      values.push(deadline ? deadline : null);
      updates.push(`deadline = $${values.length}`);
    }

    const updateSql = `
      UPDATE jobs
      SET ${updates.join(", ")}
      WHERE id = $1
      RETURNING *;
    `;

    const updateRes = await query(updateSql, values);
    try {
      revalidateTag("jobs-feed", "max");
    } catch {
      // Ignore cache error
    }
    return NextResponse.json({ success: true, job: updateRes.rows[0] });
  } catch (error: any) {
    console.error("PATCH /api/jobs/[id] error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to update job" },
      { status: 500 }
    );
  }
}

// ── DELETE /api/jobs/[id] — Delete Job (Employer Only) ────────────────────
export async function DELETE(
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

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    // Verify ownership
    const ownerRes = await query(
      `SELECT job_provider_id FROM jobs WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (ownerRes.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const job = ownerRes.rows[0];
    if (job.job_provider_id !== authUser.userId && authUser.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: You do not own this job listing" },
        { status: 403 }
      );
    }

    await query(`DELETE FROM jobs WHERE id = $1`, [id]);
    try {
      revalidateTag("jobs-feed", "max");
    } catch {
      // Ignore cache error
    }

    return NextResponse.json({ success: true, message: "Job deleted successfully" });
  } catch (error: any) {
    console.error("DELETE /api/jobs/[id] error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to delete job" },
      { status: 500 }
    );
  }
}

