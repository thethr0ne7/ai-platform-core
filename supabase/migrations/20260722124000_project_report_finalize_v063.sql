begin;

create or replace function public.gi_finalize_project_report(
  p_project_id uuid,
  p_telegram_user_id bigint,
  p_report jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_documents jsonb;
  v_facts jsonb;
  v_signals jsonb;
  v_total integer:=0;
  v_parsed integer:=0;
  v_failed integer:=0;
  v_pending_candidates integer:=0;
  v_facts_total integer:=0;
  v_facts_verified integer:=0;
  v_report jsonb:=coalesce(p_report,'{}'::jsonb);
begin
  if not exists(
    select 1 from public.gi_projects
    where id=p_project_id and telegram_user_id=p_telegram_user_id
  ) then raise exception 'project_not_found'; end if;

  select count(*)::integer,
         count(*) filter(where analysis_status='parsed')::integer,
         count(*) filter(where analysis_status='failed')::integer,
         jsonb_build_object(
           'total',count(*),
           'uploaded',count(*) filter(where analysis_status='uploaded'),
           'queued',count(*) filter(where analysis_status='queued'),
           'processing',count(*) filter(where analysis_status='processing'),
           'parsed',count(*) filter(where analysis_status='parsed'),
           'needs_ocr',count(*) filter(where analysis_status='needs_ocr'),
           'unsupported',count(*) filter(where analysis_status='unsupported'),
           'failed',count(*) filter(where analysis_status='failed'),
           'duplicates',count(*) filter(where duplicate_of is not null),
           'characters',coalesce(sum(char_count),0),
           'chunks',coalesce(sum(chunk_count),0),
           'fact_candidates',coalesce(sum(fact_candidates_count),0),
           'categories',coalesce((
             select jsonb_agg(jsonb_build_object('name',c.category,'count',c.count) order by c.category)
             from (
               select category,count(*)::integer as count
               from public.gi_project_documents
               where project_id=p_project_id and telegram_user_id=p_telegram_user_id
               group by category
             ) c
           ),'[]'::jsonb)
         )
  into v_total,v_parsed,v_failed,v_documents
  from public.gi_project_documents
  where project_id=p_project_id and telegram_user_id=p_telegram_user_id;

  select count(*)::integer into v_pending_candidates
  from public.gi_project_fact_candidates
  where project_id=p_project_id and telegram_user_id=p_telegram_user_id
    and status='pending_confirmation';

  select count(*)::integer,
         count(*) filter(where verification_status='verified')::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'id',id,
           'code',fact_code,
           'type',fact_type,
           'value',value,
           'source',source_type,
           'status',verification_status,
           'confidence',confidence,
           'quote',source_quote,
           'locator',source_locator,
           'reviewed_at',reviewed_at,
           'review_method',review_method,
           'updated_at',updated_at
         ) order by updated_at desc),'[]'::jsonb)
  into v_facts_total,v_facts_verified,v_facts
  from public.gi_project_facts
  where project_id=p_project_id and telegram_user_id=p_telegram_user_id;

  select coalesce(jsonb_agg(
    signal.value || jsonb_build_object(
      'signal_stage',coalesce(s.signal_stage,'mention'),
      'actionability_status',coalesce(s.actionability_status,'not_actionable'),
      'evidence_count',coalesce(s.evidence_count,0)
    ) order by signal.ordinality
  ),'[]'::jsonb)
  into v_signals
  from jsonb_array_elements(coalesce(v_report->'intelligence_signals','[]'::jsonb)) with ordinality signal(value,ordinality)
  left join public.gi_analytic_signals s on s.id::text=signal.value->>'id';

  v_report:=jsonb_set(v_report,'{documents}',v_documents,true);
  v_report:=jsonb_set(v_report,'{project_facts}',v_facts,true);
  v_report:=jsonb_set(v_report,'{intelligence_signals}',v_signals,true);
  v_report:=jsonb_set(
    v_report,
    '{readiness}',
    coalesce(v_report->'readiness','{}'::jsonb)||jsonb_build_object(
      'documents_total',v_total,
      'documents_parsed',v_parsed,
      'documents_failed',v_failed,
      'facts_total',v_facts_total,
      'facts_verified',v_facts_verified,
      'fact_candidates_pending',v_pending_candidates
    ),true
  );
  v_report:=jsonb_set(
    v_report,
    '{metadata}',
    coalesce(v_report->'metadata','{}'::jsonb)||jsonb_build_object(
      'report_finalizer','v0.63',
      'fact_candidates_pending',v_pending_candidates
    ),true
  );

  return v_report;
end;
$$;

revoke all on function public.gi_finalize_project_report(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.gi_finalize_project_report(uuid,bigint,jsonb) to service_role,postgres;

commit;
