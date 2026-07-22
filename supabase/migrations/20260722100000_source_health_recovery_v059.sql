alter table public.gi_source_health
  add column if not exists metadata jsonb not null default '{}'::jsonb;

with ranked as (
  select id, row_number() over (partition by source_id order by updated_at desc, created_at desc, id desc) as rn
  from public.gi_source_health
  where source_id is not null
)
delete from public.gi_source_health h
using ranked r
where h.id = r.id and r.rn > 1;

create unique index if not exists gi_source_health_source_id_unique
  on public.gi_source_health(source_id)
  where source_id is not null;

create or replace function public.gi_record_source_health(
  p_source_key text,
  p_status text,
  p_error_type text default null,
  p_last_error text default null,
  p_adapter_used text default null,
  p_checked_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_id uuid;
  v_success boolean := p_status = 'healthy';
  v_success_count integer;
  v_failure_count integer;
  v_success_rate numeric;
  v_trust_score numeric;
  v_source_status text;
begin
  select id into v_source_id
  from public.gi_official_sources
  where source_key = p_source_key;

  if v_source_id is null then
    raise exception 'Источник не найден: %', p_source_key;
  end if;

  insert into public.gi_source_health(
    source_id, status, error_type, last_error, adapter_used,
    success_count, failure_count, success_rate, trust_score,
    last_success_at, last_failure_at, next_retry_at, metadata, updated_at
  )
  values (
    v_source_id,
    p_status,
    nullif(p_error_type, ''),
    nullif(left(coalesce(p_last_error, ''), 2000), ''),
    p_adapter_used,
    case when v_success then 1 else 0 end,
    case when v_success then 0 else 1 end,
    case when v_success then 1 else 0 end,
    case when v_success then 100 else 35 end,
    case when v_success then p_checked_at else null end,
    case when v_success then null else p_checked_at end,
    case
      when p_status = 'blocked' then p_checked_at + interval '12 hours'
      when p_status = 'degraded' then p_checked_at + interval '30 minutes'
      else null
    end,
    coalesce(p_metadata, '{}'::jsonb),
    p_checked_at
  )
  on conflict (source_id) where source_id is not null do update set
    status = excluded.status,
    error_type = excluded.error_type,
    last_error = excluded.last_error,
    adapter_used = excluded.adapter_used,
    success_count = public.gi_source_health.success_count + case when v_success then 1 else 0 end,
    failure_count = public.gi_source_health.failure_count + case when v_success then 0 else 1 end,
    last_success_at = case when v_success then p_checked_at else public.gi_source_health.last_success_at end,
    last_failure_at = case when v_success then public.gi_source_health.last_failure_at else p_checked_at end,
    next_retry_at = excluded.next_retry_at,
    metadata = coalesce(public.gi_source_health.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = p_checked_at;

  select success_count, failure_count
  into v_success_count, v_failure_count
  from public.gi_source_health
  where source_id = v_source_id;

  v_success_rate := case
    when v_success_count + v_failure_count = 0 then 0
    else round(v_success_count::numeric / (v_success_count + v_failure_count), 4)
  end;
  v_trust_score := round(greatest(0, least(100, 25 + v_success_rate * 75)), 2);

  update public.gi_source_health
  set success_rate = v_success_rate,
      trust_score = v_trust_score,
      updated_at = p_checked_at
  where source_id = v_source_id;

  v_source_status := case
    when p_status = 'healthy' then 'active'
    when p_status = 'blocked' then 'blocked'
    else 'degraded'
  end;

  update public.gi_official_sources
  set status = v_source_status,
      last_checked_at = p_checked_at,
      last_success_at = case when v_success then p_checked_at else last_success_at end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'health_status', p_status,
        'health_checked_at', p_checked_at,
        'health_error_type', p_error_type,
        'health_adapter', p_adapter_used
      ) || coalesce(p_metadata, '{}'::jsonb),
      updated_at = p_checked_at
  where id = v_source_id;

  return jsonb_build_object(
    'source_id', v_source_id,
    'source_key', p_source_key,
    'status', p_status,
    'source_status', v_source_status,
    'success_count', v_success_count,
    'failure_count', v_failure_count,
    'success_rate', v_success_rate,
    'trust_score', v_trust_score
  );
end;
$$;

revoke all on function public.gi_record_source_health(text,text,text,text,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.gi_record_source_health(text,text,text,text,text,timestamptz,jsonb) to service_role, postgres;

update public.gi_official_sources
set active = false,
    status = 'blocked',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('disabled_reason','duplicate_of:kbr-government'),
    updated_at = now()
where source_key = 'government-kbr';

update public.gi_source_endpoints
set active = false,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('disabled_reason','duplicate_source'),
    updated_at = now()
where source_id = (select id from public.gi_official_sources where source_key = 'government-kbr');

update public.gi_official_sources
set status = 'pending', updated_at = now()
where active = true and status in ('degraded','blocked');

do $$
declare r record;
begin
  for r in
    select jobid from cron.job
    where command ilike '%gi_dispatch_crawl_jobs%'
       or command ilike '%gi_collect_crawl_results%'
       or command ilike '%gi_recover_stale_crawl_jobs%'
       or command ilike '%gi_reschedule_due_crawl_jobs%'
       or command ilike '%official-source-ingestion%'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$$;

select cron.schedule(
  'gi-edge-source-ingestion-v059',
  '17 * * * *',
  $cron$
  select net.http_post(
    url := 'https://hgivyjjethjwswjrvroy.supabase.co/functions/v1/official-source-ingestion',
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='gi_scheduler_token')
    ),
    body := jsonb_build_object('trigger','scheduled','max_sources',50,'max_items_per_source',4),
    timeout_milliseconds := 150000
  );
  $cron$
);