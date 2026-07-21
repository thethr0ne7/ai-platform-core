-- Run this file with autocommit enabled after the v0.43 migrations.
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- The statements are idempotent and safe to retry.

create index concurrently if not exists gi_crawl_jobs_retry_due_v043_idx
  on public.gi_crawl_jobs (retry_after, priority, scheduled_at, created_at)
  where status = 'retry';

create index concurrently if not exists gi_crawl_jobs_pending_due_v043_idx
  on public.gi_crawl_jobs (priority, scheduled_at, created_at)
  where status = 'pending';

create index concurrently if not exists gi_crawl_jobs_running_lease_v043_idx
  on public.gi_crawl_jobs (coalesce(last_heartbeat_at, locked_at))
  where status = 'running';

analyze public.gi_crawl_jobs;
