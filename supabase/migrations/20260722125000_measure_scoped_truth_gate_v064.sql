begin;

create or replace function public.gi_apply_measure_scoped_truth_gate(p_report jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_facts_total numeric := coalesce(nullif(p_report #>> '{readiness,facts_total}','')::numeric,0);
  v_facts_verified numeric := coalesce(nullif(p_report #>> '{readiness,facts_verified}','')::numeric,0);
  v_documents_total numeric := coalesce(nullif(p_report #>> '{readiness,documents_total}','')::numeric,0);
  v_documents_parsed numeric := coalesce(nullif(p_report #>> '{readiness,documents_parsed}','')::numeric,0);
  v_financial_facts integer := 0;
  v_rules_checked integer := 0;
  v_required_rules integer := 0;
  v_verified_rules integer := 0;
  v_verified_matches integer := 0;
  v_best_verified_match numeric := 0;
  v_data_index integer := 0;
  v_document_index integer := 0;
  v_legal_index integer := 0;
  v_financial_index integer := 0;
  v_eligibility_index integer := 0;
  v_evidence_index integer := 0;
  v_submission_index integer := 0;
  v_score integer := 0;
  v_status text;
  v_level text;
  v_matches jsonb := '[]'::jsonb;
begin
  with match_scope as (
    select
      m.value as match,
      coalesce((
        select count(*)
        from jsonb_array_elements(coalesce(m.value->'requirement_matrix','[]'::jsonb)) r
      ),0)::integer as checked_rules,
      coalesce((
        select count(*)
        from jsonb_array_elements(coalesce(m.value->'requirement_matrix','[]'::jsonb)) r
        where coalesce((r->>'blocking')::boolean,true)
      ),0)::integer as required_rules,
      coalesce((
        select count(*)
        from jsonb_array_elements(coalesce(m.value->'requirement_matrix','[]'::jsonb)) r
        where coalesce((r->>'blocking')::boolean,true)
          and r->>'status'='matched'
          and (
            r->>'type'='primary_evidence'
            or r->>'evidence_status'='verified'
          )
      ),0)::integer as verified_rules
    from jsonb_array_elements(coalesce(p_report->'measure_matches','[]'::jsonb)) m(value)
  )
  select
    coalesce(sum(checked_rules),0)::integer,
    coalesce(sum(required_rules),0)::integer,
    coalesce(sum(verified_rules),0)::integer,
    count(*) filter (
      where match->>'eligibility_status'='match'
        and required_rules>0
        and verified_rules=required_rules
    )::integer,
    coalesce(max((match->>'score')::numeric) filter (
      where match->>'eligibility_status'='match'
        and required_rules>0
        and verified_rules=required_rules
    ),0)
  into v_rules_checked,v_required_rules,v_verified_rules,v_verified_matches,v_best_verified_match
  from match_scope;

  with match_scope as (
    select
      m.value as match,
      coalesce((
        select count(*)
        from jsonb_array_elements(coalesce(m.value->'requirement_matrix','[]'::jsonb)) r
        where coalesce((r->>'blocking')::boolean,true)
      ),0)::integer as required_rules,
      coalesce((
        select count(*)
        from jsonb_array_elements(coalesce(m.value->'requirement_matrix','[]'::jsonb)) r
        where coalesce((r->>'blocking')::boolean,true)
          and r->>'status'='matched'
          and (
            r->>'type'='primary_evidence'
            or r->>'evidence_status'='verified'
          )
      ),0)::integer as verified_rules
    from jsonb_array_elements(coalesce(p_report->'measure_matches','[]'::jsonb)) m(value)
  )
  select coalesce(jsonb_agg(
    match || jsonb_build_object(
      'eligibility_status',case
        when match->>'eligibility_status'='match'
          and not(required_rules>0 and verified_rules=required_rules)
          then 'manual_review'
        else match->>'eligibility_status'
      end,
      'verdict_level',case
        when match->>'eligibility_status'='match'
          and required_rules>0 and verified_rules=required_rules
          then 'verified_match'
        else 'candidate'
      end,
      'evidence_scope',jsonb_build_object(
        'required_rules',required_rules,
        'verified_rules',verified_rules,
        'fully_verified',required_rules>0 and verified_rules=required_rules
      )
    ) order by coalesce((match->>'score')::numeric,0) desc
  ),'[]'::jsonb)
  into v_matches
  from match_scope;

  select count(*) into v_financial_facts
  from jsonb_array_elements(coalesce(p_report->'project_facts','[]'::jsonb)) f
  where f->>'code' in ('project.budget','project.cofinancing','project.financial_model','project.commercial_offers')
    and f->>'status'='verified';

  v_data_index := case when v_facts_total=0 then 0 else least(100,round(v_facts_verified*100/v_facts_total))::integer end;
  v_document_index := case when v_documents_total=0 then 0 else least(100,round(v_documents_parsed*100/v_documents_total))::integer end;
  v_legal_index := (case when coalesce((p_report #>> '{readiness,legal_form_ready}')::boolean,false) then 50 else 0 end)
                 + (case when coalesce((p_report #>> '{readiness,land_ready}')::boolean,false) then 50 else 0 end);
  v_financial_index := least(100,v_financial_facts*25);
  v_evidence_index := case when v_required_rules=0 then 0 else least(100,round(v_verified_rules::numeric*100/v_required_rules))::integer end;
  v_eligibility_index := case when v_verified_matches>0 then least(100,round(v_best_verified_match))::integer else 0 end;
  v_submission_index := case when v_document_index=100 and v_eligibility_index>=70 and v_evidence_index=100 then 100 else 0 end;

  v_score := round(
      v_data_index*0.20
    + v_document_index*0.20
    + v_legal_index*0.15
    + v_financial_index*0.10
    + v_eligibility_index*0.20
    + v_evidence_index*0.10
    + v_submission_index*0.05
  )::integer;

  if v_verified_rules=0 then v_score:=least(v_score,29); end if;
  if v_documents_total>0 and v_documents_parsed=0 then v_score:=least(v_score,39); end if;
  if v_rules_checked=0 then v_score:=least(v_score,39); end if;
  if v_verified_matches=0 then v_score:=least(v_score,49); end if;

  if v_verified_rules=0 then
    v_status:='Предварительная оценка: требования мер не подтверждены первичными источниками'; v_level:='preliminary';
  elsif v_documents_total>0 and v_documents_parsed=0 then
    v_status:='Предварительная оценка: документы не разобраны'; v_level:='preliminary';
  elsif v_rules_checked=0 then
    v_status:='Предварительная оценка: критерии не проверены'; v_level:='preliminary';
  elsif v_verified_matches=0 then
    v_status:='Предварительная оценка: нет полностью подтверждённой подходящей меры'; v_level:='preliminary';
  elsif v_score>=80 then
    v_status:='Готов к подаче по подтверждённым критериям'; v_level:='verified';
  elsif v_score>=55 then
    v_status:='Есть подтверждённая основа, нужно закрыть пробелы'; v_level:='verified';
  else
    v_status:='Нужно дополнить подтверждённые данные'; v_level:='verified';
  end if;

  return jsonb_set(
    jsonb_set(
      jsonb_set(
        p_report,
        '{measure_matches}',v_matches,true
      ),
      '{readiness}',
      coalesce(p_report->'readiness','{}'::jsonb) || jsonb_build_object(
        'score',v_score,
        'status',v_status,
        'assessment_level',v_level,
        'eligibility_rules_checked',v_rules_checked,
        'verified_measure_requirements',v_verified_rules,
        'verified_matches',v_verified_matches,
        'indices',jsonb_build_object(
          'project_data',v_data_index,
          'documents',v_document_index,
          'legal',v_legal_index,
          'financial',v_financial_index,
          'eligibility',v_eligibility_index,
          'evidence',v_evidence_index,
          'submission',v_submission_index
        )
      ),true
    ),
    '{truth_gate}',jsonb_build_object(
      'version','v0.64',
      'assessment_level',v_level,
      'evidence_scope','measure_requirements',
      'required_rules',v_required_rules,
      'verified_rules',v_verified_rules,
      'verified_matches',v_verified_matches,
      'documents_parsed',v_documents_parsed,
      'eligibility_rules_checked',v_rules_checked,
      'can_claim_match',v_verified_matches>0,
      'can_claim_document_readiness',v_documents_total>0 and v_documents_parsed=v_documents_total
    ),true
  ) || jsonb_build_object(
    'metadata',coalesce(p_report->'metadata','{}'::jsonb) || jsonb_build_object('truth_gate','v0.64')
  );
end;
$$;

revoke all on function public.gi_apply_measure_scoped_truth_gate(jsonb) from public,anon,authenticated;
grant execute on function public.gi_apply_measure_scoped_truth_gate(jsonb) to service_role,postgres;

commit;
