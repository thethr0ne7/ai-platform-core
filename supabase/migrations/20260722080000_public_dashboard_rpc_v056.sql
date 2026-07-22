create or replace function public.get_platform_overview()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'institutions_total', (select count(*) from public.institutions where published is true),
    'programs_total', (select count(*) from public.programs where published is true),
    'sources_total', (select count(*) from public.sources),
    'ingestion_jobs_total', (select count(*) from public.ingestion_jobs),
    'factory_runs_total', (select count(*) from public.factory_runs),
    'recent_runs', coalesce((
      select jsonb_agg(to_jsonb(r))
      from (
        select id, run_label, mode, status, started_at, finished_at
        from public.factory_runs
        order by started_at desc
        limit 5
      ) r
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_platform_overview() from public;
grant execute on function public.get_platform_overview() to anon, authenticated;

create or replace function public.get_coverage_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select jsonb_build_object(
      'admission_year', admission_year,
      'institutions_total', institutions_total,
      'institutions_catalog', institutions_catalog,
      'institutions_searchable', institutions_searchable,
      'institutions_route_ready', institutions_route_ready,
      'programs_total', programs_total,
      'programs_verified', programs_verified,
      'exam_sets_verified', exam_sets_verified,
      'offers_verified', offers_verified,
      'cutoffs_verified', cutoffs_verified,
      'source_registry_total', source_registry_total,
      'jobs_total', jobs_total,
      'jobs_done', jobs_done,
      'jobs_failed', jobs_failed,
      'created_at', created_at
    )
    from public.coverage_snapshots
    order by created_at desc
    limit 1
  ), '{}'::jsonb);
$$;

revoke all on function public.get_coverage_snapshot() from public;
grant execute on function public.get_coverage_snapshot() to anon, authenticated;

create or replace function public.get_analytic_signals(p_limit integer default 20)
returns table (
  id uuid,
  title text,
  summary text,
  signal_type text,
  level text,
  region text,
  sectors text[],
  horizon_months integer,
  confidence numeric,
  status text,
  first_detected_at timestamptz,
  last_confirmed_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.id,
    s.title,
    s.summary,
    s.signal_type,
    s.level,
    s.region,
    s.sectors,
    s.horizon_months,
    s.confidence,
    s.status,
    s.first_detected_at,
    s.last_confirmed_at
  from public.gi_analytic_signals s
  where s.status = 'active'
  order by s.confidence desc, s.last_confirmed_at desc nulls last, s.first_detected_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.get_analytic_signals(integer) from public;
grant execute on function public.get_analytic_signals(integer) to anon, authenticated;

create or replace function public.get_factory_health()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'factory', coalesce((
      select jsonb_agg(to_jsonb(f))
      from (
        select id, run_label, mode, status, started_at, finished_at
        from public.factory_runs
        order by started_at desc
        limit 5
      ) f
    ), '[]'::jsonb),
    'ingestion', coalesce((
      select jsonb_agg(to_jsonb(i))
      from (
        select id, trigger_type, status, started_at, finished_at, duration_ms,
               sources_processed, discovered_count, persisted_count, skipped_count, failed_count
        from public.gi_ingestion_runs
        order by started_at desc
        limit 5
      ) i
    ), '[]'::jsonb),
    'snapshot', coalesce((
      select jsonb_build_object(
        'status', status,
        'checks', checks,
        'source', source,
        'created_at', created_at
      )
      from public.factory_health_snapshots
      where project_key = 'ai-platform-core'
      order by created_at desc
      limit 1
    ), '{}'::jsonb)
  );
$$;

revoke all on function public.get_factory_health() from public;
grant execute on function public.get_factory_health() to anon, authenticated;
