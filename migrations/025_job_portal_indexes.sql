-- Rollback instructions:
-- DROP INDEX IF EXISTS idx_jobs_active_feed;
-- DROP INDEX IF EXISTS idx_jobs_search_tsv;
-- DROP INDEX IF EXISTS idx_jobs_title_trgm;
-- DROP INDEX IF EXISTS idx_jobs_location_trgm;
-- DROP INDEX IF EXISTS idx_job_apps_job_status_created;
-- DROP INDEX IF EXISTS idx_job_apps_candidate_created;
-- DROP INDEX IF EXISTS idx_job_interviews_cand_date;
-- DROP TRIGGER IF EXISTS trg_update_job_applicants_count ON job_applications;
-- DROP FUNCTION IF EXISTS update_job_applicants_count();

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Partial index for active jobs public feed
CREATE INDEX IF NOT EXISTS idx_jobs_active_feed ON public.jobs (is_boosted DESC, published_at DESC) WHERE status = 'active';

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_jobs_search_tsv ON public.jobs USING gin (search_tsv);

-- Trigram GIN indexes for fuzzy search on title and location
CREATE INDEX IF NOT EXISTS idx_jobs_title_trgm ON public.jobs USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_location_trgm ON public.jobs USING gin (location gin_trgm_ops);

-- Candidate applications compound indexes
CREATE INDEX IF NOT EXISTS idx_job_apps_job_status_created ON public.job_applications (job_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_apps_candidate_created ON public.job_applications (candidate_id, created_at DESC);

-- Job interviews candidate index
CREATE INDEX IF NOT EXISTS idx_job_interviews_cand_date ON public.job_interviews (candidate_id, interview_date);

-- Trigger to maintain applicants_count in jobs table automatically
CREATE OR REPLACE FUNCTION update_job_applicants_count() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.jobs SET applicants_count = applicants_count + 1 WHERE id = NEW.job_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.jobs SET applicants_count = GREATEST(0, applicants_count - 1) WHERE id = OLD.job_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_job_applicants_count ON public.job_applications;
CREATE TRIGGER trg_update_job_applicants_count AFTER INSERT OR DELETE ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION update_job_applicants_count();

-- One-off backfill statement for applicants_count
UPDATE public.jobs j 
SET applicants_count = (
  SELECT COUNT(*)::int 
  FROM public.job_applications ja 
  WHERE ja.job_id = j.id
);
