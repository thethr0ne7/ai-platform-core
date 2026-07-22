begin;

create or replace function public.gi_normalize_region(p_value text)
returns text
language sql
immutable
set search_path=public,pg_temp
as $$
  select case
    when lower(coalesce(p_value,'')) ~ '(донецк|днр)' then 'donetsk'
    when lower(coalesce(p_value,'')) ~ '(луганск|лнр)' then 'lugansk'
    when lower(coalesce(p_value,'')) ~ 'запорож' then 'zaporozhye'
    when lower(coalesce(p_value,'')) ~ 'херсон' then 'kherson'
    when lower(coalesce(p_value,'')) ~ '(кабардино[- ]?балкар|кбр)' then 'kabardino-balkaria'
    else regexp_replace(lower(btrim(coalesce(p_value,''))),'\s+',' ','g')
  end;
$$;

create or replace function public.gi_evaluate_project_measures(
  p_project_id uuid,
  p_telegram_user_id bigint,
  p_check_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_project public.gi_projects%rowtype;
  v_legal_form text;
  v_project_region text;
  v_sectors text[] := '{}';
  v_measure public.gi_support_measures%rowtype;
  v_requirement public.gi_measure_requirements%rowtype;
  v_expected text[];
  v_requirement_status text;
  v_actual jsonb;
  v_matrix jsonb;
  v_matched jsonb;
  v_blockers jsonb;
  v_missing jsonb;
  v_matched_count integer;
  v_total_count integer;
  v_has_blocker boolean;
  v_has_unverified boolean;
  v_has_missing boolean;
  v_score numeric;
  v_status text;
  v_results jsonb := '[]'::jsonb;
  v_match_id uuid;
begin
  select * into v_project from public.gi_projects
  where id=p_project_id and telegram_user_id=p_telegram_user_id;
  if not found then raise exception 'project_not_found'; end if;

  v_legal_form:=public.gi_normalize_legal_form(v_project.legal_form);
  v_project_region:=public.gi_normalize_region(v_project.region);

  select coalesce(array_agg(distinct lower(s.value)),'{}'::text[])
  into v_sectors
  from public.gi_project_facts f
  cross join lateral jsonb_array_elements_text(coalesce(f.value->'sectors','[]'::jsonb)) s(value)
  where f.project_id=p_project_id and f.telegram_user_id=p_telegram_user_id
    and f.fact_code='project.activity';

  if cardinality(v_sectors)=0 then
    v_sectors:=array_remove(array[
      case when lower(v_project.activity) ~ '(сельхоз|агро|ферм|сад|ягод|теплиц)' then 'agriculture' end,
      case when lower(v_project.activity) ~ '(агротур|сельск.*тур)' then 'agritourism' end,
      case when lower(v_project.activity) ~ '(туризм|гостиниц|база отдыха)' then 'tourism' end,
      case when lower(v_project.activity) ~ '(переработ)' then 'agroprocessing' end,
      case when lower(v_project.activity) ~ '(оборудован|техник)' then 'equipment' end
    ]::text[],null);
  end if;

  for v_measure in select * from public.gi_support_measures order by title loop
    v_matrix:='[]'::jsonb;
    v_matched:='[]'::jsonb;
    v_blockers:='[]'::jsonb;
    v_missing:='[]'::jsonb;
    v_matched_count:=0;
    v_total_count:=0;
    v_has_blocker:=false;
    v_has_unverified:=false;
    v_has_missing:=false;

    for v_requirement in
      select * from public.gi_measure_requirements
      where measure_id=v_measure.id and active=true
      order by requirement_code
    loop
      v_total_count:=v_total_count+1;
      v_requirement_status:='missing';
      v_actual:='{}'::jsonb;

      if v_requirement.requirement_type='applicant_type' then
        select coalesce(array_agg(public.gi_normalize_legal_form(value)),'{}'::text[])
        into v_expected from jsonb_array_elements_text(v_requirement.expected_value);
        v_actual:=jsonb_build_object('legal_form',v_project.legal_form,'normalized',v_legal_form);
        if v_legal_form='' then
          v_requirement_status:='missing';
        elsif v_legal_form=any(v_expected) then
          v_requirement_status:='matched';
        else
          v_requirement_status:='mismatch';
        end if;
      elsif v_requirement.requirement_type='territory' then
        select coalesce(array_agg(public.gi_normalize_region(value)),'{}'::text[])
        into v_expected from jsonb_array_elements_text(v_requirement.expected_value);
        v_actual:=jsonb_build_object('region',v_project.region,'normalized',v_project_region);
        if v_project_region='' then
          v_requirement_status:='missing';
        elsif v_project_region=any(v_expected) then
          v_requirement_status:='matched';
        else
          v_requirement_status:='mismatch';
        end if;
      elsif v_requirement.requirement_type='sector_overlap' then
        select coalesce(array_agg(lower(value)),'{}'::text[])
        into v_expected from jsonb_array_elements_text(v_requirement.expected_value);
        v_actual:=to_jsonb(v_sectors);
        if cardinality(v_sectors)=0 then
          v_requirement_status:='missing';
        elsif v_sectors && v_expected then
          v_requirement_status:='matched';
        else
          v_requirement_status:='mismatch';
        end if;
      elsif v_requirement.requirement_type='primary_evidence' then
        v_actual:=jsonb_build_object('source_document_id',v_measure.source_document_id);
        if v_measure.source_document_id is null then
          v_requirement_status:='unverified';
        elsif exists(
          select 1 from public.gi_source_versions sv
          join public.gi_evidence_records er on er.source_version_id=sv.id or er.version_id=sv.id
          where sv.document_id=v_measure.source_document_id
            and er.verification_status='verified'
        ) then
          v_requirement_status:='matched';
        else
          v_requirement_status:='unverified';
        end if;
      else
        v_requirement_status:='manual_review';
        v_actual:=jsonb_build_object('status','not_automated');
      end if;

      if v_requirement_status='matched' then
        v_matched_count:=v_matched_count+1;
        v_matched:=v_matched||jsonb_build_array(v_requirement.description);
      elsif v_requirement_status='mismatch' and v_requirement.mandatory then
        v_has_blocker:=true;
        v_blockers:=v_blockers||jsonb_build_array(v_requirement.description);
      elsif v_requirement_status in ('unverified','manual_review') then
        v_has_unverified:=true;
        v_missing:=v_missing||jsonb_build_array(v_requirement.description);
      else
        v_has_missing:=true;
        v_missing:=v_missing||jsonb_build_array(v_requirement.description);
      end if;

      v_matrix:=v_matrix||jsonb_build_array(jsonb_build_object(
        'requirement_key',v_requirement.requirement_code,
        'label',v_requirement.description,
        'type',v_requirement.requirement_type,
        'status',v_requirement_status,
        'blocking',v_requirement.mandatory,
        'expected',v_requirement.expected_value,
        'actual',v_actual,
        'source_locator',v_requirement.source_locator,
        'source_quote',v_requirement.evidence_quote,
        'evidence_status',v_requirement.evidence_status
      ));
    end loop;

    v_score:=case when v_total_count=0 then 0 else round(v_matched_count::numeric*100/v_total_count) end;
    if v_has_unverified then v_score:=least(v_score,49); end if;

    v_status:=case
      when v_has_blocker then 'mismatch'
      when v_has_unverified then 'manual_review'
      when v_has_missing then 'insufficient_data'
      when v_total_count>0 and v_matched_count=v_total_count then 'match'
      else 'insufficient_data'
    end;

    if p_check_id is null then
      insert into public.gi_project_measure_matches(
        project_id,measure_id,check_id,telegram_user_id,eligibility_status,score,
        matched_requirements,blockers,missing_data,rationale
      ) values (
        p_project_id,v_measure.id,null,p_telegram_user_id,v_status,v_score,
        v_matched,v_blockers,v_missing,
        'Детерминированная проверка требований v0.70: территория, форма заявителя, отрасль и первичное доказательство.'
      ) returning id into v_match_id;
    else
      insert into public.gi_project_measure_matches(
        project_id,measure_id,check_id,telegram_user_id,eligibility_status,score,
        matched_requirements,blockers,missing_data,rationale
      ) values (
        p_project_id,v_measure.id,p_check_id,p_telegram_user_id,v_status,v_score,
        v_matched,v_blockers,v_missing,
        'Детерминированная проверка требований v0.70: территория, форма заявителя, отрасль и первичное доказательство.'
      )
      on conflict(project_id,measure_id,check_id) do update set
        telegram_user_id=excluded.telegram_user_id,
        eligibility_status=excluded.eligibility_status,
        score=excluded.score,
        matched_requirements=excluded.matched_requirements,
        blockers=excluded.blockers,
        missing_data=excluded.missing_data,
        rationale=excluded.rationale,
        created_at=now()
      returning id into v_match_id;
    end if;

    v_results:=v_results||jsonb_build_array(jsonb_build_object(
      'id',v_match_id,
      'measure_id',v_measure.id,
      'title',v_measure.title,
      'measure_type',v_measure.measure_type,
      'authority',v_measure.authority,
      'status',v_measure.status,
      'measure_region',v_measure.region,
      'score',v_score,
      'eligibility_status',v_status,
      'requirement_matrix',v_matrix,
      'matched_requirements',v_matched,
      'blockers',v_blockers,
      'missing_data',v_missing,
      'rationale','Детерминированная проверка требований v0.70.',
      'official_url',v_measure.official_url,
      'confidence',v_measure.confidence,
      'application_start',v_measure.application_start,
      'application_end',v_measure.application_end,
      'max_amount',v_measure.max_amount,
      'cofinancing_percent',v_measure.cofinancing_percent
    ));
  end loop;

  return v_results;
end;
$$;

update public.gi_support_measures
set title='Льготное кредитование АПК в отдельных субъектах РФ по приказу № 187',
    region='Донецкая Народная Республика; Луганская Народная Республика; Запорожская область; Херсонская область',
    summary='Приказ Минсельхоза России № 187 определяет направления целевого использования льготных кредитов для заемщиков и проектов на территориях Донецкой Народной Республики, Луганской Народной Республики, Запорожской области и Херсонской области. Эта запись не является универсальной федеральной мерой для проектов в КБР.',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'territorial_scope',jsonb_build_array('Донецкая Народная Республика','Луганская Народная Республика','Запорожская область','Херсонская область'),
      'scope_source','Приказ Минсельхоза России от 25.03.2025 № 187, Порядок пункт 1 и приложение № 3',
      'scope_review_status','manual_review',
      'scope_candidate_from_ocr',true,
      'kbr_applicability','not_applicable',
      'corrected_at',now()
    ),
    updated_at=now()
where code='FED_APK_CONCESSIONAL_CREDIT_2026';

insert into public.gi_measure_requirements(
  measure_id,requirement_code,requirement_type,operator,expected_value,mandatory,
  description,source_locator,evidence_quote,evidence_status,active,metadata,updated_at
)
select m.id,'territory_scope','territory','in',
       jsonb_build_array('Донецкая Народная Республика','Луганская Народная Республика','Запорожская область','Херсонская область'),
       true,
       'Проект реализуется в одном из отдельных субъектов РФ, указанных в приказе № 187',
       'Приказ Минсельхоза России от 25.03.2025 № 187: Порядок, пункт 1; приложение № 3, пункт 1; PDF страницы 2 и 13',
       'Организациям и индивидуальным предпринимателям, осуществляющим производство и (или) переработку сельскохозяйственной продукции на территориях Донецкой Народной Республики, Луганской Народной Республики, Запорожской области и Херсонской области.',
       'manual_review',true,
       jsonb_build_object('generated','territorial_scope_v070','quote_origin','ocr_candidate_not_human_verified','verification_state','ai_candidate'),
       now()
from public.gi_support_measures m
where m.code='FED_APK_CONCESSIONAL_CREDIT_2026'
on conflict(measure_id,requirement_code) do update set
  requirement_type=excluded.requirement_type,
  operator=excluded.operator,
  expected_value=excluded.expected_value,
  mandatory=excluded.mandatory,
  description=excluded.description,
  source_locator=excluded.source_locator,
  evidence_quote=excluded.evidence_quote,
  evidence_status='manual_review',
  active=true,
  metadata=excluded.metadata,
  updated_at=now();

insert into public.gi_evidence_verification_queue(
  measure_id,requirement_id,source_document_id,task_code,task_type,title,target_url,
  expected_document,status,priority,result,notes,updated_at
)
select m.id,r.id,d.id,'apk_territory_scope_quote','quote_locator',
       'Подтвердить территориальную область действия приказа № 187',
       d.canonical_url,'Приказ Минсельхоза России от 25.03.2025 № 187, пункт 1 и приложение № 3',
       'pending',18,
       jsonb_build_object(
         'candidate_locator','Порядок, пункт 1; приложение № 3, пункт 1; PDF страницы 2 и 13',
         'candidate_quote','Организациям и индивидуальным предпринимателям, осуществляющим производство и (или) переработку сельскохозяйственной продукции на территориях ДНР, ЛНР, Запорожской области и Херсонской области.',
         'candidate_only',true,
         'human_verification_required',true
       ),
       'OCR выявил явное территориальное ограничение. Требуется сверить точную цитату и редакцию по официальному PDF; до этого доказательство не является verified.',
       now()
from public.gi_support_measures m
join public.gi_measure_requirements r on r.measure_id=m.id and r.requirement_code='territory_scope'
join public.gi_source_documents d on d.id=m.source_document_id
where m.code='FED_APK_CONCESSIONAL_CREDIT_2026'
on conflict(measure_id,task_code) do update set
  requirement_id=excluded.requirement_id,
  source_document_id=excluded.source_document_id,
  target_url=excluded.target_url,
  expected_document=excluded.expected_document,
  status='pending',
  priority=excluded.priority,
  result=excluded.result,
  notes=excluded.notes,
  updated_at=now();

update public.gi_evidence_verification_queue q
set status='in_progress',
    result=coalesce(q.result,'{}'::jsonb)||case q.task_code
      when 'apk_applicant_type_quote' then jsonb_build_object(
        'candidate_locator','Порядок, пункт 1; приложение № 3, пункт 1; PDF страницы 2 и 13',
        'candidate_quote','Организациям и индивидуальным предпринимателям, осуществляющим производство и (или) переработку сельскохозяйственной продукции на указанных территориях.',
        'candidate_only',true,'human_verification_required',true)
      when 'apk_sector_overlap_quote' then jsonb_build_object(
        'candidate_locator','Приложение № 3, пункт 1; PDF страницы 13–19; изменение приказом № 592, PDF страницы 3–4',
        'candidate_quote','Цели развития подотраслей растениеводства, животноводства, рыболовства и рыбоводства, переработки продукции растениеводства и животноводства.',
        'candidate_only',true,'human_verification_required',true)
      when 'apk_primary_evidence_quote' then jsonb_build_object(
        'candidate_locator','Официальное опубликование № 0001202504300025; OCR-версия сохранена для ручной проверки',
        'candidate_only',true,'human_verification_required',true)
      else '{}'::jsonb end,
    notes='OCR-кандидат подготовлен. Точная цитата, локатор и действующая редакция должны быть подтверждены человеком; статус verified не установлен.',
    updated_at=now()
where q.task_code in ('apk_applicant_type_quote','apk_sector_overlap_quote','apk_primary_evidence_quote');

revoke all on function public.gi_normalize_region(text) from public,anon,authenticated;
revoke all on function public.gi_evaluate_project_measures(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.gi_normalize_region(text) to service_role,postgres;
grant execute on function public.gi_evaluate_project_measures(uuid,bigint,uuid) to service_role,postgres;

commit;
