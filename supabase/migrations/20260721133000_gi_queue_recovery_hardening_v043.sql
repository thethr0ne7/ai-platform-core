begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.gi_crawl_jobs
  add column if not exists claim_token uuid,
  add column if not exists retry_after timestamptz,
  add column if not exists error_class text,
  add column if not exists last_heartbeat_at timestamptz;

-- Drop only CHECK constraints that actually reference the status column.
do $$
declare
  r record;
  v_status_attnum smallint;
begin
  select a.attnum
  into v_status_attnum
  from pg_attribute a
  join pg_class t on t.oid = a.attrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'gi_crawl_jobs'
    and a.attname = 'status'
    and not a.attisdropped;

  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'gi_crawl_jobs'
      and c.contype = 'c'
      and v_status_attnum = any(c.conkey)
  loop
    execute format('alter table public.gi_crawl_jobs drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.gi_crawl_jobs
  add constraint gi_crawl_jobs_status_check
  check (status in ('pending','running','retry','succeeded','failed','dead_letter','blocked'))
  not valid;

alter table public.gi_crawl_jobs
  drop constraint if exists gi_crawl_jobs_error_class_check;

alter table public.gi_crawl_jobs
  add constraint gi_crawl_jobs_error_class_check
  check (
    error_class is null or error_class in (
      'dns_error','tls_error','timeout','http_403','http_404','http_429',
      'http_5xx','redirect_blocked','robots_blocked','parse_error',
      'content_empty','content_unsupported','persistence_error',
      'stale_worker_lock','unknown'
    )
  ) not valid;

create or replace function public.gi_is_valid_crawl_error_class(p_error_class text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_error_class is null or p_error_class in (
    'dns_error','tls_error','timeout','http_403','http_404','http_429',
    'http_5xx','redirect_blocked','robots_blocked','parse_error',
    'content_empty','content_unsupported','persistence_error',
    'stale_worker_lock','unknown'
  );
$$;

revoke all on function public.gi_is_valid_crawl_error_class(text) from public, anon, authenticated;
grant execute on function public.gi_is_valid_crawl_error_class(text) to service_role, postgres;

-- Bounded backoff with 20% jitter to prevent synchronized retry storms.
create or replace function public.gi_retry_delay_minutes(
  p_attempts integer,
  p_error_class text default null
)
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  v_base integer;
  v_jittered integer;
begin
  v_base := case
    when p_error_class = 'http_429' then 30
    when p_error_class = 'http_403' then 180
    when p_error_class = 'http_404' then 720
    when p_error_class in ('tls_error','dns_error') then 60
    else power(2, least(greatest(coalesce(p_attempts, 1), 1), 10))::integer
  end;

  v_base := least(1440, greatest(1, v_base));
  v_jittered := ceil(v_base * (0.8 + random() * 0.4))::integer;

  return least(1440, greatest(1, v_jittered));
end;
$$;

revoke all on function public.gi_retry_delay_minutes(integer, text) from public, anon, authenticated;
grant execute on function public.gi_retry_delay_minutes(integer, text) to service_role, postgres;

create or replace function public.gi_claim_crawl_jobs_v2(
  p_worker_id text,
  p_limit integer default 5
)
returns table (
  job_id uuid,
  claim_token uuid,
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
set search_path = public, extensions
as $$
begin
  return query
  with picked as (
    select j.id
    from public.gi_crawl_jobs j
    where (
      j.status = 'pending'
      or (j.status = 'retry' and coalesce(j.retry_after, j.scheduled_at) <= now())
    )
      and j.scheduled_at <= now()
      and j.attempts < j.max_attempts
    order by j.priority asc, coalesce(j.retry_after, j.scheduled_at) asc, j.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  ), claimed as (
    update public.gi_crawl_jobs j
    set status = 'running',
        claim_token = gen_random_uuid(),
        locked_at = now(),
        locked_by = left(coalesce(nullif(p_worker_id, ''), 'unknown-worker'), 200),
        last_heartbeat_at = now(),
        started_at = coalesce(j.started_at, now()),
        attempts = j.attempts + 1,
        retry_after = null,
        error_class = null,
        updated_at = now()
    from picked
    where j.id = picked.id
    returning j.*
  )
  select
    c.id,
    c.claim_token,
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

revoke all on function public.gi_claim_crawl_jobs_v2(text, integer) from public, anon, authenticated;
grant execute on function public.gi_claim_crawl_jobs_v2(text, integer) to service_role;

create or replace function public.gi_heartbeat_crawl_job(
  p_job_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.gi_crawl_jobs
  set last_heartbeat_at = now(),
      locked_at = now(),
      updated_at = now()
  where id = p_job_id
    and status = 'running'
    and claim_token = p_claim_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.gi_heartbeat_crawl_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.gi_heartbeat_crawl_job(uuid, uuid) to service_role;

create or replace function public.gi_finish_crawl_job_v2(
  p_job_id uuid,
  p_claim_token uuid,
  p_status text,
  p_result jsonb default '{}'::jsonb,
  p_error text default null,
  p_error_class text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_attempts integer;
  v_max_attempts integer;
  v_updated integer;
  v_retry_minutes integer;
begin
  if p_status not in ('succeeded','failed','retry','dead_letter') then
    raise exception 'invalid crawl job terminal status: %', p_status
      using errcode = '22023';
  end if;

  if not public.gi_is_valid_crawl_error_class(p_error_class) then
    raise exception 'invalid crawl job error class: %', p_error_class
      using errcode = '22023';
  end if;

  select attempts, max_attempts
  into v_attempts, v_max_attempts
  from public.gi_crawl_jobs
  where id = p_job_id
    and status = 'running'
    and claim_token = p_claim_token
  for update;

  if not found then
    return false;
  end if;

  v_status := p_status;

  if v_status = 'retry' and v_attempts >= v_max_attempts then
    v_status := 'dead_letter';
  end if;

  if v_status = 'retry' then
    v_retry_minutes := public.gi_retry_delay_minutes(v_attempts, p_error_class);
  end if;

  update public.gi_crawl_jobs
  set status = v_status,
      result = coalesce(p_result, '{}'::jsonb),
      last_error = left(p_error, 4000),
      error_class = case
        when p_error_class is not null then p_error_class
        when p_error is not null then 'unknown'
        else null
      end,
      finished_at = case when v_status in ('succeeded','failed','dead_letter') then now() else null end,
      retry_after = case when v_status = 'retry' then now() + make_interval(mins => v_retry_minutes) else null end,
      scheduled_at = case when v_status = 'retry' then now() + make_interval(mins => v_retry_minutes) else scheduled_at end,
      claim_token = null,
      locked_at = null,
      locked_by = null,
      last_heartbeat_at = null,
      updated_at = now()
  where id = p_job_id
    and status = 'running'
    and claim_token = p_claim_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.gi_finish_crawl_job_v2(uuid, uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.gi_finish_crawl_job_v2(uuid, uuid, text, jsonb, text, text) to service_role;

create or replace function public.gi_recover_stale_crawl_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with stale as (
    select
      j.id,
      j.attempts,
      j.max_attempts,
      case
        when j.attempts >= j.max_attempts then null
        else public.gi_retry_delay_minutes(j.attempts, 'stale_worker_lock')
      end as retry_minutes
    from public.gi_crawl_jobs j
    where j.status = 'running'
      and coalesce(j.last_heartbeat_at, j.locked_at) < now() - interval '30 minutes'
    for update skip locked
  )
  update public.gi_crawl_jobs j
  set status = case when stale.attempts >= stale.max_attempts then 'dead_letter' else 'retry' end,
      error_class = 'stale_worker_lock',
      last_error = coalesce(j.last_error, 'stale_worker_lock'),
      retry_after = case
        when stale.retry_minutes is null then null
        else now() + make_interval(mins => stale.retry_minutes)
      end,
      scheduled_at = case
        when stale.retry_minutes is null then j.scheduled_at
        else now() + make_interval(mins => stale.retry_minutes)
      end,
      finished_at = case when stale.attempts >= stale.max_attempts then now() else null end,
      claim_token = null,
      locked_at = null,
      locked_by = null,
      last_heartbeat_at = null,
      updated_at = now()
  from stale
  where j.id = stale.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.gi_recover_stale_crawl_jobs() from public, anon, authenticated;
grant execute on function public.gi_recover_stale_crawl_jobs() to service_role, postgres;

-- Schedule recovery when pg_cron is available. Reusing the same job name updates it.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'gi-recover-stale-crawl-jobs',
      '*/5 * * * *',
      'select public.gi_recover_stale_crawl_jobs();'
    );
  end if;
end;
$$;

commit;
