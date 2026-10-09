import { NextResponse } from "next/server";
import { query, isDatabaseUnavailableError } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/jwt";

// ── GET /api/jobprovider/stats — Real Live Employer Dashboard Metrics ──────
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
        { error: "Forbidden: Only job providers can access employer stats" },
        { status: 403 }
      );
    }

    const providerId = authUser.userId;

    // 1. Grouped Counts for Jobs & Applications in fast combined queries
    const jobsMetricsSql = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_jobs,
        COALESCE(SUM(applicants_count), 0)::int AS total_applicants
      FROM jobs
      WHERE job_provider_id = $1;
    `;

    const appMetricsSql = `
      SELECT
        COUNT(*) FILTER (WHERE ja.status = 'new')::int AS new_applicants,
        COUNT(*) FILTER (WHERE ja.status = 'hired')::int AS candidates_hired
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      WHERE j.job_provider_id = $1;
    `;

    const interviewMetricsSql = `
      SELECT COUNT(*)::int AS scheduled_interviews
      FROM job_interviews
      WHERE job_provider_id = $1 AND status = 'scheduled';
    `;

    const [jobsRes, appRes, intRes] = await Promise.all([
      query(jobsMetricsSql, [providerId]),
      query(appMetricsSql, [providerId]),
      query(interviewMetricsSql, [providerId]),
    ]);

    const activeJobs = jobsRes.rows[0]?.active_jobs || 0;
    const totalApplicants = jobsRes.rows[0]?.total_applicants || 0;
    const newApplicants = appRes.rows[0]?.new_applicants || 0;
    const candidatesHired = appRes.rows[0]?.candidates_hired || 0;
    const scheduledInterviews = intRes.rows[0]?.scheduled_interviews || 0;

    // 2. Recent Applications (Top 5)
    const recentAppsSql = `
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
        ja.status,
        ja.created_at,
        j.title AS job_title,
        c.avatar AS candidate_avatar
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      LEFT JOIN customers c ON ja.candidate_id = c.id
      WHERE j.job_provider_id = $1
      ORDER BY ja.created_at DESC
      LIMIT 5;
    `;

    // 3. Upcoming Interviews (Top 5)
    const upcomingInterviewsSql = `
      SELECT 
        ji.id,
        ji.job_id,
        ji.application_id,
        ji.candidate_name,
        ji.job_title,
        ji.interview_date,
        ji.interview_time,
        ji.interview_mode,
        ji.meeting_link,
        ji.location_details,
        ji.status
      FROM job_interviews ji
      WHERE ji.job_provider_id = $1 AND ji.status = 'scheduled'
      ORDER BY ji.interview_date ASC, ji.interview_time ASC
      LIMIT 5;
    `;

    // 4. Active Job Listings (Top 5) using stored applicants_count
    const activeJobsSql = `
      SELECT 
        j.id,
        j.title,
        j.location,
        j.job_type,
        j.work_mode,
        j.salary_type,
        j.salary_text,
        j.salary_min,
        j.salary_max,
        j.salary_currency,
        j.status,
        j.created_at,
        j.deadline,
        j.applicants_count
      FROM jobs j
      WHERE j.job_provider_id = $1
      ORDER BY j.created_at DESC
      LIMIT 5;
    `;

    const [recentAppsRes, interviewsRes, activeJobsRes] = await Promise.all([
      query(recentAppsSql, [providerId]),
      query(upcomingInterviewsSql, [providerId]),
      query(activeJobsSql, [providerId]),
    ]);

    return NextResponse.json({
      metrics: {
        activeJobs,
        totalApplicants,
        newApplicants,
        interviewsScheduled: scheduledInterviews,
        candidatesHired,
      },
      recentApplications: recentAppsRes.rows,
      upcomingInterviews: interviewsRes.rows,
      activeJobListings: activeJobsRes.rows,
    });
  } catch (error: any) {
    console.error("GET /api/jobprovider/stats error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to fetch dashboard statistics" },
      { status: 500 }
    );
  }
}
