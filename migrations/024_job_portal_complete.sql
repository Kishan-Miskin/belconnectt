-- Rollback instructions:
-- DROP TABLE IF EXISTS job_messages CASCADE;
-- DROP TABLE IF EXISTS job_application_events CASCADE;
-- ALTER TABLE job_applications DROP COLUMN IF EXISTS resume_path, DROP COLUMN IF EXISTS resume_filename, DROP COLUMN IF EXISTS resume_mime, DROP COLUMN IF EXISTS resume_size, DROP COLUMN IF EXISTS assessment_url, DROP COLUMN IF EXISTS assessment_instructions, DROP COLUMN IF EXISTS assessment_due_at, DROP COLUMN IF EXISTS assessment_sent_at, DROP COLUMN IF EXISTS status_updated_at, DROP COLUMN IF EXISTS reviewed_by;
-- ALTER TABLE jobs DROP COLUMN IF EXISTS contact_email, DROP COLUMN IF EXISTS published_at, DROP COLUMN IF EXISTS applicants_count, DROP COLUMN IF EXISTS search_tsv;

-- Ensure extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Base job portal tables if they do not exist
CREATE TABLE IF NOT EXISTS public.job_providers (
    id CHARACTER VARYING NOT NULL PRIMARY KEY,
    email CHARACTER VARYING NOT NULL UNIQUE,
    name CHARACTER VARYING NOT NULL,
    phone CHARACTER VARYING,
    avatar TEXT,
    password_hash CHARACTER VARYING,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    google_id CHARACTER VARYING UNIQUE
);

CREATE TABLE IF NOT EXISTS public.business_profiles (
    id CHARACTER VARYING NOT NULL PRIMARY KEY,
    job_provider_id CHARACTER VARYING NOT NULL UNIQUE,
    company_name CHARACTER VARYING NOT NULL,
    industry CHARACTER VARYING,
    company_size CHARACTER VARYING,
    city CHARACTER VARYING DEFAULT 'Belagavi'::character varying,
    office_address TEXT,
    website CHARACTER VARYING,
    contact_email CHARACTER VARYING,
    contact_phone CHARACTER VARYING,
    about_company TEXT,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.jobs (
    id CHARACTER VARYING NOT NULL PRIMARY KEY,
    job_provider_id CHARACTER VARYING NOT NULL,
    title CHARACTER VARYING NOT NULL,
    category CHARACTER VARYING NOT NULL,
    job_type CHARACTER VARYING NOT NULL,
    work_mode CHARACTER VARYING DEFAULT 'On-site'::character varying,
    location CHARACTER VARYING NOT NULL,
    salary_type CHARACTER VARYING DEFAULT 'Competitive'::character varying,
    salary_min NUMERIC,
    salary_max NUMERIC,
    salary_currency CHARACTER VARYING DEFAULT 'INR'::character varying,
    salary_text CHARACTER VARYING,
    openings INTEGER DEFAULT 1,
    experience_required CHARACTER VARYING,
    education_required CHARACTER VARYING,
    description TEXT NOT NULL,
    responsibilities TEXT,
    requirements TEXT,
    perks_benefits TEXT,
    deadline DATE,
    status CHARACTER VARYING DEFAULT 'active'::character varying,
    views_count INTEGER DEFAULT 0,
    is_boosted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.job_applications (
    id CHARACTER VARYING NOT NULL PRIMARY KEY,
    job_id CHARACTER VARYING NOT NULL,
    candidate_id CHARACTER VARYING NOT NULL,
    candidate_name CHARACTER VARYING NOT NULL,
    candidate_email CHARACTER VARYING NOT NULL,
    candidate_phone CHARACTER VARYING,
    experience CHARACTER VARYING,
    location CHARACTER VARYING,
    resume_url TEXT,
    cover_note TEXT,
    status CHARACTER VARYING DEFAULT 'new'::character varying,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_job_candidate UNIQUE (job_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS public.job_interviews (
    id CHARACTER VARYING NOT NULL PRIMARY KEY,
    job_id CHARACTER VARYING NOT NULL,
    application_id CHARACTER VARYING NOT NULL,
    job_provider_id CHARACTER VARYING NOT NULL,
    candidate_id CHARACTER VARYING NOT NULL,
    candidate_name CHARACTER VARYING NOT NULL,
    job_title CHARACTER VARYING NOT NULL,
    interview_date DATE NOT NULL,
    interview_time CHARACTER VARYING NOT NULL,
    interview_mode CHARACTER VARYING DEFAULT 'Video'::character varying,
    meeting_link TEXT,
    location_details TEXT,
    status CHARACTER VARYING DEFAULT 'scheduled'::character varying,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.job_saved_jobs (
    id CHARACTER VARYING NOT NULL PRIMARY KEY,
    user_id CHARACTER VARYING NOT NULL,
    job_id CHARACTER VARYING NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_saved_job UNIQUE (user_id, job_id)
);

-- Additions to jobs table
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS contact_email CHARACTER VARYING(254);
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS applicants_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS search_tsv tsvector;

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_status_check') THEN 
        ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('draft','active','closed','expired')); 
    END IF; 
END $$;

-- Additions to job_applications table
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS resume_path TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS resume_filename CHARACTER VARYING(255);
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS resume_mime CHARACTER VARYING(100);
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS resume_size INTEGER;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS assessment_url TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS assessment_instructions TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS assessment_due_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS assessment_sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS reviewed_by CHARACTER VARYING;

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_status_check') THEN 
        ALTER TABLE public.job_applications ADD CONSTRAINT job_applications_status_check CHECK (status IN ('new','reviewed','shortlisted','assessment_sent','interview_scheduled','rejected','hired','withdrawn')); 
    END IF; 
END $$;

-- New table: job_application_events (Audit Trail + Candidate Timeline)
CREATE TABLE IF NOT EXISTS public.job_application_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id CHARACTER VARYING NOT NULL,
    actor_id CHARACTER VARYING,
    actor_role CHARACTER VARYING,
    event_type CHARACTER VARYING NOT NULL,
    from_status CHARACTER VARYING,
    to_status CHARACTER VARYING,
    meta JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_app_events_app_created ON public.job_application_events (application_id, created_at);

-- New table: job_messages (Candidate -> Employer Queries)
CREATE TABLE IF NOT EXISTS public.job_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id CHARACTER VARYING NOT NULL,
    application_id CHARACTER VARYING,
    from_user_id CHARACTER VARYING NOT NULL,
    to_job_provider_id CHARACTER VARYING NOT NULL,
    from_email CHARACTER VARYING(254) NOT NULL,
    subject CHARACTER VARYING(200) NOT NULL,
    body TEXT NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    email_status CHARACTER VARYING(20) DEFAULT 'queued' CHECK (email_status IN ('queued','sent','failed'))
);

CREATE INDEX IF NOT EXISTS idx_job_messages_provider_created ON public.job_messages (to_job_provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_messages_unread ON public.job_messages (to_job_provider_id) WHERE read_at IS NULL;

-- Integrity: Add FKs as NOT VALID then VALIDATE CONSTRAINT
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_job_applications_job') THEN
        ALTER TABLE public.job_applications 
            ADD CONSTRAINT fk_job_applications_job 
            FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE public.job_applications VALIDATE CONSTRAINT fk_job_applications_job;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_job_interviews_application') THEN
        ALTER TABLE public.job_interviews 
            ADD CONSTRAINT fk_job_interviews_application 
            FOREIGN KEY (application_id) REFERENCES public.job_applications(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE public.job_interviews VALIDATE CONSTRAINT fk_job_interviews_application;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jobs_job_provider') THEN
        ALTER TABLE public.jobs 
            ADD CONSTRAINT fk_jobs_job_provider 
            FOREIGN KEY (job_provider_id) REFERENCES public.job_providers(id) NOT VALID;
        ALTER TABLE public.jobs VALIDATE CONSTRAINT fk_jobs_job_provider;
    END IF;
END $$;

-- Trigger to keep search_tsv updated
CREATE OR REPLACE FUNCTION jobs_search_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv := setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
                    setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'B') ||
                    setweight(to_tsvector('english', COALESCE(NEW.location, '')), 'B') ||
                    setweight(to_tsvector('english', COALESCE(NEW.job_type, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_jobs_search_tsv ON public.jobs;
CREATE TRIGGER trg_jobs_search_tsv BEFORE INSERT OR UPDATE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION jobs_search_tsv_trigger();

-- Backfill search_tsv for existing rows
UPDATE public.jobs 
SET search_tsv = setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
                 setweight(to_tsvector('english', COALESCE(category, '')), 'B') ||
                 setweight(to_tsvector('english', COALESCE(location, '')), 'B') ||
                 setweight(to_tsvector('english', COALESCE(job_type, '')), 'C')
WHERE search_tsv IS NULL;
