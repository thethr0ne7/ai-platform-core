create or replace function public.gi_enrich_project_report(
  p_project_id uuid,
  p_telegram_user_id bigint,
  p_base_report jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_project public.gi_projects%rowtype;
  v_report_id uuid;
  v_check_id uuid;
  v_sectors text[] := '{}';
  v_documents jsonb := '{}'::jsonb;
  v_facts jsonb := '[]'::jsonb;
  v_matches jsonb := '[]'::jsonb;
  v_signals jsonb := '[]'::jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_evidence jsonb := '{}'::jsonb;
  v_ingestion jsonb := '{}'::jsonb;
  v_readiness jsonb := '{}'::jsonb;
  v_capabilities jsonb := '[]'::jsonb;
  v_enriched jsonb;
  v_documents_total integer := 0;
  v_documents_parsed integer := 0;
  v_documents_failed integer := 0;
  v_facts_total integer := 0;
  v_facts_verified integer := 0;
  v_matches_total integer := 0;
  v_best_match numeric := 0;
  v_signals_total integer := 0;
  v_changes_total integer := 0;
  v_source_documents integer := 0;
  v_source_versions integer := 0;
  v_evidence_total integer := 0;
  v_evidence_verified integer := 0;
  v_open_tasks integer := 0;
  v_readiness_score integer := 0;
  v_readiness_status text := 'Нужно дополнить';
  v_report_version integer := 1;
begin
  select * into v_project
  from public.gi_projects
  where id = p_project_id
    and telegram_user_id = p_telegram_user_id;

  if not found then
    raise exception 'Проект не найден';
  end if;

  v_report_id := nullif(p_base_report->>'report_id', '')::uuid;
  v_check_id := nullif(p_base_report->>'check_id', '')::uuid;

  select coalesce(array_agg(value), '{}') into v_sectors
  from jsonb_array_elements_text(coalesce(p_base_report #> '{executive_summary,inferred_sectors}', '[]'::jsonb));
  if cardinality(v_sectors) = 0 then
    v_sectors := array['small_business'];
  end if;

  select
    count(*),
    count(*) filter (where analysis_status = 'parsed'),
    count(*) filter (where analysis_status = 'failed'),
    jsonb_build_object(
      'total', count(*),
      'uploaded', count(*) filter (where analysis_status = 'uploaded'),
      'queued', count(*) filter (where analysis_status = 'queued'),
      'processing', count(*) filter (where analysis_status = 'processing'),
      'parsed', count(*) filter (where analysis_status = 'parsed'),
      'failed', count(*) filter (where analysis_status = 'failed'),
      'categories', coalesce((
        select jsonb_agg(jsonb_build_object('name', c.category, 'count', c.cnt) order by c.cnt desc, c.category)
        from (
          select category, count(*) cnt
          from public.gi_project_documents
          where project_id = p_project_id and telegram_user_id = p_telegram_user_id
          group by category
        ) c
      ), '[]'::jsonb)
    )
  into v_documents_total, v_documents_parsed, v_documents_failed, v_documents
  from public.gi_project_documents
  where project_id = p_project_id and telegram_user_id = p_telegram_user_id;

  select
    count(*),
    count(*) filter (where verification_status = 'verified'),
    coalesce(jsonb_agg(jsonb_build_object(
      'code', fact_code,
      'type', fact_type,
      'value', value,
      'source', source_type,
      'confidence', confidence,
      'status', verification_status,
      'updated_at', updated_at
    ) order by updated_at desc), '[]'::jsonb)
  into v_facts_total, v_facts_verified, v_facts
  from public.gi_project_facts
  where project_id = p_project_id and telegram_user_id = p_telegram_user_id;

  select
    count(*),
    coalesce(max(m.score), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id,
      'measure_id', m.measure_id,
      'title', s.title,
      'measure_type', s.measure_type,
      'authority', s.authority,
      'status', s.status,
      'score', m.score,
      'eligibility_status', m.eligibility_status,
      'matched_requirements', m.matched_requirements,
      'blockers', m.blockers,
      'missing_data', m.missing_data,
      'rationale', m.rationale,
      'official_url', s.official_url,
      'confidence', s.confidence
    ) order by m.score desc), '[]'::jsonb)
  into v_matches_total, v_best_match, v_matches
  from public.gi_project_measure_matches m
  join public.gi_support_measures s on s.id = m.measure_id
  where m.project_id = p_project_id
    and m.telegram_user_id = p_telegram_user_id
    and (v_check_id is null or m.check_id = v_check_id);

  select
    count(*),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'type', s.signal_type,
      'title', s.title,
      'summary', s.summary,
      'level', s.level,
      'region', s.region,
      'sectors', s.sectors,
      'horizon_months', s.horizon_months,
      'confidence', s.confidence,
      'last_confirmed_at', s.last_confirmed_at,
      'first_detected_at', s.first_detected_at
    ) order by s.confidence desc, s.last_confirmed_at desc nulls last), '[]'::jsonb)
  into v_signals_total, v_signals
  from public.gi_analytic_signals s
  where s.status = 'active'
    and (s.region is null or lower(s.region) = lower(v_project.region))
    and (s.sectors = '{}' or s.sectors && v_sectors);

  select
    count(*),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'change_type', c.change_type,
      'severity', c.severity,
      'summary', c.summary,
      'detected_at', c.detected_at,
      'document_title', d.title,
      'document_url', d.canonical_url,
      'authority', d.authority,
      'source_name', os.name
    ) order by c.detected_at desc), '[]'::jsonb)
  into v_changes_total, v_changes
  from public.gi_change_events c
  join public.gi_source_documents d on d.id = c.document_id
  join public.gi_official_sources os on os.id = d.source_id
  where os.active = true;

  select count(*) into v_source_documents from public.gi_source_documents;
  select count(*) into v_source_versions from public.gi_source_versions;
  select count(*), count(*) filter (where verification_status = 'verified')
  into v_evidence_total, v_evidence_verified
  from public.gi_evidence_records;

  v_evidence := jsonb_build_object(
    'official_sources', (select count(*) from public.gi_official_sources where active = true),
    'source_documents', v_source_documents,
    'source_versions', v_source_versions,
    'evidence_records', v_evidence_total,
    'verified_records', v_evidence_verified,
    'verification_rate', case when v_evidence_total = 0 then 0 else round(v_evidence_verified::numeric * 100 / v_evidence_total) end,
    'policy', 'Только официальные источники'
  );

  v_ingestion := jsonb_build_object(
    'latest_run', coalesce((
      select jsonb_build_object(
        'status', status,
        'trigger_type', trigger_type,
        'started_at', started_at,
        'finished_at', finished_at,
        'duration_ms', duration_ms,
        'sources_processed', sources_processed,
        'discovered_count', discovered_count,
        'persisted_count', persisted_count,
        'skipped_count', skipped_count,
        'failed_count', failed_count
      )
      from public.gi_ingestion_runs
      order by started_at desc
      limit 1
    ), '{}'::jsonb),
    'recent_failures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_key', source_key,
        'error', error_message,
        'checked_at', checked_at
      ) order by checked_at desc)
      from (
        select source_key, error_message, checked_at
        from public.gi_ingestion_failures
        order by checked_at desc
        limit 10
      ) f
    ), '[]'::jsonb),
    'queued_sources', (select count(*) from public.gi_crawl_jobs where status in ('pending','queued')),
    'active_endpoints', (select count(*) from public.gi_source_endpoints where active = true)
  );

  select count(*) into v_open_tasks
  from public.gi_project_tasks
  where project_id = p_project_id
    and telegram_user_id = p_telegram_user_id
    and (v_report_id is null or report_id = v_report_id)
    and status in ('pending', 'in_progress', 'blocked');

  v_readiness_score :=
    (case when coalesce(v_project.legal_form, '') <> '' then 15 else 0 end) +
    (case when coalesce(v_project.land_status, '') <> '' and lower(v_project.land_status) not like '%нет%' then 20 else 0 end) +
    (case when v_documents_total > 0 then 15 else 0 end) +
    (case when v_documents_parsed > 0 then 10 else 0 end) +
    (case when v_facts_total > 0 then least(15, round(v_facts_verified::numeric * 15 / v_facts_total)::integer) else 0 end) +
    least(15, round(v_best_match * 0.15)::integer) +
    (case when v_source_documents > 0 and v_evidence_total > 0 then 10 else 0 end);

  v_readiness_status := case
    when v_readiness_score >= 80 then 'Готов к выбору программы'
    when v_readiness_score >= 55 then 'Есть основа, нужно закрыть пробелы'
    when v_readiness_score >= 30 then 'Проект сформирован частично'
    else 'Нужно начать с исходных данных'
  end;

  v_readiness := jsonb_build_object(
    'score', v_readiness_score,
    'status', v_readiness_status,
    'legal_form_ready', coalesce(v_project.legal_form, '') <> '',
    'land_ready', coalesce(v_project.land_status, '') <> '' and lower(v_project.land_status) not like '%нет%',
    'documents_total', v_documents_total,
    'documents_parsed', v_documents_parsed,
    'documents_failed', v_documents_failed,
    'facts_total', v_facts_total,
    'facts_verified', v_facts_verified,
    'matches_total', v_matches_total,
    'best_match_score', v_best_match,
    'open_tasks', v_open_tasks
  );

  v_capabilities := jsonb_build_array(
    jsonb_build_object('name', 'Профиль проекта', 'status', 'active', 'detail', v_facts_total || ' фактов собрано'),
    jsonb_build_object('name', 'Разбор документов', 'status', case when v_documents_parsed > 0 then 'active' when v_documents_total > 0 then 'waiting' else 'needs_data' end, 'detail', v_documents_parsed || ' из ' || v_documents_total || ' разобрано'),
    jsonb_build_object('name', 'Подбор мер поддержки', 'status', case when v_matches_total > 0 then 'active' else 'needs_data' end, 'detail', v_matches_total || ' вариантов сопоставлено'),
    jsonb_build_object('name', 'Сценарии реализации', 'status', 'active', 'detail', jsonb_array_length(coalesce(p_base_report->'project_scenarios', '[]'::jsonb)) || ' сценариев'),
    jsonb_build_object('name', 'Мониторинг официальных источников', 'status', case when v_source_documents > 0 then 'active' else 'waiting' end, 'detail', v_source_documents || ' документов в наблюдении'),
    jsonb_build_object('name', 'Поиск изменений', 'status', case when v_changes_total > 0 then 'active' else 'waiting' end, 'detail', v_changes_total || ' изменений обнаружено'),
    jsonb_build_object('name', 'Доказательная база', 'status', case when v_evidence_total > 0 then 'active' else 'waiting' end, 'detail', v_evidence_verified || ' подтверждённых записей'),
    jsonb_build_object('name', 'Пошаговый маршрут', 'status', case when v_open_tasks > 0 then 'active' else 'ready' end, 'detail', v_open_tasks || ' действий в работе'),
    jsonb_build_object('name', 'Ранние сигналы', 'status', case when v_signals_total > 0 then 'active' else 'waiting' end, 'detail', v_signals_total || ' актуальных сигналов')
  );

  v_enriched := p_base_report || jsonb_build_object(
    'readiness', v_readiness,
    'documents', v_documents,
    'project_facts', v_facts,
    'measure_matches', v_matches,
    'intelligence_signals', v_signals,
    'source_changes', v_changes,
    'evidence_summary', v_evidence,
    'ingestion_health', v_ingestion,
    'capabilities', v_capabilities,
    'metadata', coalesce(p_base_report->'metadata', '{}'::jsonb) || jsonb_build_object(
      'engine', 'government-opportunity-engine-v0.57',
      'report_schema', 'project-intelligence-2',
      'generated_at', now(),
      'visible_contours', jsonb_build_array('readiness','documents','facts','matching','scenarios','signals','changes','evidence','ingestion','roadmap')
    )
  );

  if v_report_id is not null then
    select coalesce(max(report_version), 0) + 1 into v_report_version
    from public.gi_project_reports
    where project_id = p_project_id and id <> v_report_id;

    update public.gi_project_reports
    set report_version = greatest(v_report_version, 1),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'engine', 'government-opportunity-engine-v0.57',
          'report_schema', 'project-intelligence-2',
          'intelligence_contours', jsonb_build_object(
            'readiness', v_readiness,
            'documents', v_documents,
            'project_facts', v_facts,
            'measure_matches', v_matches,
            'intelligence_signals', v_signals,
            'source_changes', v_changes,
            'evidence_summary', v_evidence,
            'ingestion_health', v_ingestion,
            'capabilities', v_capabilities
          )
        )
    where id = v_report_id;

    update public.gi_project_tasks
    set status = 'skipped', updated_at = now()
    where project_id = p_project_id
      and telegram_user_id = p_telegram_user_id
      and report_id <> v_report_id
      and status = 'pending';
  end if;

  if v_check_id is not null then
    update public.gi_project_checks
    set result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
      'readiness', v_readiness,
      'documents', v_documents,
      'measure_matches', v_matches,
      'intelligence_signals', v_signals,
      'source_changes', v_changes,
      'evidence_summary', v_evidence,
      'ingestion_health', v_ingestion,
      'capabilities', v_capabilities
    )
    where id = v_check_id;
  end if;

  return v_enriched;
end;
$function$;

revoke all on function public.gi_enrich_project_report(uuid, bigint, jsonb) from public;
grant execute on function public.gi_enrich_project_report(uuid, bigint, jsonb) to service_role;
