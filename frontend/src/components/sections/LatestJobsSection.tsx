import Link from "next/link";
import { unstable_cache } from "next/cache";
import { query } from "@/lib/db";
import { MapPin, DollarSign, ArrowRight, Building2 } from "lucide-react";

interface FeaturedJob {
  id: string;
  title: string;
  category: string;
  job_type: string;
  work_mode: string;
  location: string;
  salary_type: string;
  salary_text?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  published_at?: string;
  created_at?: string;
  is_boosted?: boolean;
  company_name?: string;
  company_logo?: string;
}

const getFeaturedJobs = unstable_cache(
  async (): Promise<FeaturedJob[]> => {
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
          j.salary_text,
          j.salary_min,
          j.salary_max,
          j.salary_currency,
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
      return res.rows || [];
    } catch (e) {
      console.error("LatestJobsSection fetch error:", e);
      return [];
    }
  },
  ["featured-jobs-list"],
  { revalidate: 60, tags: ["jobs-feed"] }
);

export async function LatestJobsSection() {
  const jobs = await getFeaturedJobs();

  if (!jobs || jobs.length === 0) {
    return null;
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12 sm:mb-16">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Featured Opportunities
          </span>
          <h2 className="text-2xl sm:text-3xl font-heading font-extrabold text-foreground tracking-tight mt-1">
            Latest Job Openings
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Verified hiring positions from local employers in Belagavi & surroundings.
          </p>
        </div>
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border bg-card text-foreground hover:bg-muted font-semibold text-sm transition-colors shrink-0"
        >
          View All Jobs <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {jobs.map((job: FeaturedJob) => (
          <Link
            key={job.id}
            href={`/jobs/${job.id}`}
            className="group rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md hover:border-blue-600/40 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-600/20">
                  {job.company_name ? job.company_name.charAt(0).toUpperCase() : <Building2 className="w-5 h-5" />}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
                  {job.job_type || "Full-time"}
                </span>
              </div>

              <h3 className="font-bold text-base text-foreground group-hover:text-blue-600 transition-colors line-clamp-1 mb-1">
                {job.title}
              </h3>
              <p className="text-xs text-muted-foreground font-medium line-clamp-1 mb-3">
                {job.company_name}
              </p>

              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{job.location}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{job.salary_text || "Competitive"}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400">
              <span>Apply Now</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
