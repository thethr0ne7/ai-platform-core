begin;

create or replace function public.gi_claim_crawl_jobs(
  p_worker_id text,
  p_limit integer default 5
)
returns table (
  job_id uuid,
  source_id uuid,
  source_key text,
  source_name text,
  authority text,
  level text,
  region text,
  category_code text,
  trust_tier integer,
  endpoint_id uuid,
  endpoint_type text,
  endpoint_url text,
  parser_hint text,
  attempts integer,
  max_attempts integer,
  payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select j.id
    from public.gi_crawl_jobs j
    where j.status in ('pending', 'retry')
      and j.scheduled_at <= now()
      and j.attempts < j.max_attempts
      and (j.locked_at is null or j.locked_at < now() - interval '20 minutes')
    order by j.priority asc, j.scheduled_at asc, j.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  ), claimed as (
    update public.gi_crawl_jobs j
    set status = 'running',
        locked_at = now(),
        locked_by = p_worker_id,
        started_at = coalesce(j.started_at, now()),
        attempts = j.attempts + 1,
        updated_at = now()
    from picked
    where j.id = picked.id
    returning j.*
  )
  select
    c.id,
    c.source_id,
    s.source_key,
    s.name,
    s.authority,
    s.level,
    s.region,
    s.category_code,
    s.trust_tier,
    c.endpoint_id,
    e.endpoint_type,
    e.url,
    e.parser_hint,
    c.attempts,
    c.max_attempts,
    c.payload
  from claimed c
  join public.gi_official_sources s on s.id = c.source_id
  left join public.gi_source_endpoints e on e.id = c.endpoint_id;
end;
$$;

revoke all on function public.gi_claim_crawl_jobs(text, integer) from public, anon, authenticated;
grant execute on function public.gi_claim_crawl_jobs(text, integer) to service_role;

create or replace function public.gi_finish_crawl_job(
  p_job_id uuid,
  p_status text,
  p_result jsonb default '{}'::jsonb,
  p_error text default null,
  p_retry_after_minutes integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  v_status := case
    when p_status in ('succeeded', 'failed', 'retry', 'dead_letter') then p_status
    else 'failed'
  end;

  update public.gi_crawl_jobs
  set status = v_status,
      result = coalesce(p_result, '{}'::jsonb),
      last_error = left(p_error, 4000),
      finished_at = case when v_status in ('succeeded', 'failed', 'dead_letter') then now() else null end,
      scheduled_at = case
        when v_status = 'retry' then now() + make_interval(mins => greatest(1, least(coalesce(p_retry_after_minutes, 15), 1440)))
        else scheduled_at
      end,
      locked_at = null,
      locked_by = null,
      updated_at = now()
  where id = p_job_id;
end;
$$;

revoke all on function public.gi_finish_crawl_job(uuid, text, jsonb, text, integer) from public, anon, authenticated;
grant execute on function public.gi_finish_crawl_job(uuid, text, jsonb, text, integer) to service_role;

create index if not exists gi_crawl_jobs_claim_v041_idx
  on public.gi_crawl_jobs (status, scheduled_at, priority, created_at)
  where status in ('pending', 'retry');

commit;
