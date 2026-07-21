begin;

-- Validation is intentionally separated from the schema-change migration so the
-- short ACCESS EXCLUSIVE lock used by ADD CONSTRAINT NOT VALID is released first.
set local lock_timeout = '5s';
set local statement_timeout = '15min';

alter table public.gi_crawl_jobs
  validate constraint gi_crawl_jobs_status_check;

alter table public.gi_crawl_jobs
  validate constraint gi_crawl_jobs_error_class_check;

-- Backfill is isolated from the DDL transaction that adds columns/functions.
-- Existing retry rows become claimable unless an explicit retry timestamp exists.
update public.gi_crawl_jobs
set retry_after = coalesce(retry_after, scheduled_at),
    updated_at = now()
where status = 'retry'
  and retry_after is null;

commit;
