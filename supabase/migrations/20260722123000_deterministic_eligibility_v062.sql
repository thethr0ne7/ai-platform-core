begin;

alter table public.gi_measure_requirements
  add column if not exists evidence_status text not null default 'unverified',
  add column if not exists active boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists(select 1 from pg_constraint where conname='gi_measure_requirements_evidence_status_check') then
    alter table public.gi_measure_requirements
      add constraint gi_measure_requirements_evidence_status_check
      check(evidence_status in ('verified','unverified','manual_review'));
  end if;
end $$;

create index if not exists gi_measure_requirements_measure_v062_idx
  on public.gi_measure_requirements(measure_id,active,requirement_code);
alter table public.gi_measure_requirements enable row level security;
revoke all on table public.gi_measure_requirements from anon,authenticated;

create or replace function public.gi_normalize_legal_form(p_value text)
returns text
language sql
immutable
set search_path=public,pg_temp
as $$
  select case
    when lower(coalesce(p_value,'')) ~ '(^|[^а-я])(ип|индивидуальн)' then 'ип'
    when lower(coalesce(p_value,'')) ~ '(кфх|фермерск)' then 'кфх'
    when lower(coalesce(p_value,'')) ~ '(^|[^а-я])(ооо|общество с ограниченной)' then 'ооо'
    when lower(coalesce(p_value,'')) ~ '(сельскохозяйственн.*товаропроизвод)' then 'сельскохозяйственный товаропроизводитель'
    when lower(coalesce(p_value,'')) ~ '(муниципал)' then 'муниципалитет'
    when lower(coalesce(p_value,'')) ~ '(регион|субъект российской)' then 'регион'
    when lower(coalesce(p_value,'')) ~ '(работодатель)' then 'работодатель на сельской территории'
    when lower(coalesce(p_value,'')) ~ '(инициатор)' then 'инициатор проекта'
    when lower(coalesce(p_value,'')) ~ '(физическ)' then 'физическое лицо'
    else lower(btrim(coalesce(p_value,'')))
  end;
$$;

create or replace function public.gi_sync_measure_core_requirements()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.gi_measure_requirements(
    measure_id,requirement_code,requirement_type,operator,expected_value,mandatory,
    description,source_locator,evidence_quote,evidence_status,active,metadata,updated_at
  ) values (
    new.id,'applicant_type','applicant_type','in',to_jsonb(new.applicant_types),true,
    'Допустимая форма заявителя',new.source_locator,new.evidence_quote,
    case when new.source_document_id is null then 'unverified' else 'manual_review' end,
    true,jsonb_build_object('generated','core_v062'),now()
  )
  on conflict(measure_id,requirement_code) do update set
    expected_value=excluded.expected_value,description=excluded.description,
    source_locator=excluded.source_locator,evidence_quote=excluded.evidence_quote,
    evidence_status=excluded.evidence_status,active=true,metadata=excluded.metadata,updated_at=now();

  insert into public.gi_measure_requirements(
    measure_id,requirement_code,requirement_type,operator,expected_value,mandatory,
    description,source_locator,evidence_quote,evidence_status,active,metadata,updated_at
  ) values (
    new.id,'sector_overlap','sector_overlap','overlap',to_jsonb(new.sectors),true,
    'Соответствие отрасли',new.source_locator,new.evidence_quote,
    case when new.source_document_id is null then 'unverified' else 'manual_review' end,
    true,jsonb_build_object('generated','core_v062'),now()
  )
  on conflict(measure_id,requirement_code) do update set
    expected_value=excluded.expected_value,description=excluded.description,
    source_locator=excluded.source_locator,evidence_quote=excluded.evidence_quote,
    evidence_status=excluded.evidence_status,active=true,metadata=excluded.metadata,updated_at=now();

  insert into public.gi_measure_requirements(
    measure_id,requirement_code,requirement_type,operator,expected_value,mandatory,
    description,source_locator,evidence_quote,evidence_status,active,metadata,updated_at
  ) values (
    new.id,'primary_evidence','primary_evidence','verified',jsonb_build_object('required',true),true,
    'Подтверждение первичным официальным документом',new.source_locator,new.evidence_quote,
    case when new.source_document_id is null then 'unverified' else 'manual_review' end,
    true,jsonb_build_object('generated','core_v062'),now()
  )
  on conflict(measure_id,requirement_code) do update set
    source_locator=excluded.source_locator,evidence_quote=excluded.evidence_quote,
    evidence_status=excluded.evidence_status,active=true,metadata=excluded.metadata,updated_at=now();

  return new;
end;
$$;

drop trigger if exists gi_support_measure_requirements_sync on public.gi_support_measures;
create trigger gi_support_measure_requirements_sync
after insert or update of applicant_types,sectors,source_document_id,source_locator,evidence_quote
on public.gi_support_measures
for each row execute function public.gi_sync_measure_core_requirements();

insert into public.gi_measure_requirements(
  measure_id,requirement_code,requirement_type,operator,expected_value,mandatory,
  description,source_locator,evidence_quote,evidence_status,active,metadata
)
select id,'applicant_type','applicant_type','in',to_jsonb(applicant_types),true,
       'Допустимая форма заявителя',source_locator,evidence_quote,
       case when source_document_id is null then 'unverified' else 'manual_review' end,
       true,jsonb_build_object('generated','core_v062')
from public.gi_support_measures
on conflict(measure_id,requirement_code) do update set
expected_value=excluded.expected_value,description=excluded.description,source_locator=excluded.source_locator,
evidence_quote=excluded.evidence_quote,evidence_status=excluded.evidence_status,active=true,metadata=excluded.metadata,updated_at=now();

insert into public.gi_measure_requirements(
  measure_id,requirement_code,requirement_type,operator,expected_value,mandatory,
  description,source_locator,evidence_quote,evidence_status,active,metadata
)
select id,'sector_overlap','sector_overlap','overlap',to_jsonb(sectors),true,
       'Соответствие отрасли',source_locator,evidence_quote,
       case when source_document_id is null then 'unverified' else 'manual_review' end,
       true,jsonb_build_object('generated','core_v062')
from public.gi_support_measures
on conflict(measure_id,requirement_code) do update set
expected_value=excluded.expected_value,description=excluded.description,source_locator=excluded.source_locator,
evidence_quote=excluded.evidence_quote,evidence_status=excluded.evidence_status,active=true,metadata=excluded.metadata,updated_at=now();

insert into public.gi_measure_requirements(
  measure_id,requirement_code,requirement_type,operator,expected_value,mandatory,
  description,source_locator,evidence_quote,evidence_status,active,metadata
)
select id,'primary_evidence','primary_evidence','verified',jsonb_build_object('required',true),true,
       'Подтверждение первичным официальным документом',source_locator,evidence_quote,
       case when source_document_id is null then 'unverified' else 'manual_review' end,
       true,jsonb_build_object('generated','core_v062')
from public.gi_support_measures
on conflict(measure_id,requirement_code) do update set
source_locator=excluded.source_locator,evidence_quote=excluded.evidence_quote,
evidence_status=excluded.evidence_status,active=true,metadata=excluded.metadata,updated_at=now();

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
        'Детерминированная проверка требований v0.62: форма заявителя, отрасль и подтверждение первичным источником.'
      ) returning id into v_match_id;
    else
      insert into public.gi_project_measure_matches(
        project_id,measure_id,check_id,telegram_user_id,eligibility_status,score,
        matched_requirements,blockers,missing_data,rationale
      ) values (
        p_project_id,v_measure.id,p_check_id,p_telegram_user_id,v_status,v_score,
        v_matched,v_blockers,v_missing,
        'Детерминированная проверка требований v0.62: форма заявителя, отрасль и подтверждение первичным источником.'
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
      'score',v_score,
      'eligibility_status',v_status,
      'requirement_matrix',v_matrix,
      'matched_requirements',v_matched,
      'blockers',v_blockers,
      'missing_data',v_missing,
      'rationale','Детерминированная проверка требований v0.62.',
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

revoke all on function public.gi_normalize_legal_form(text) from public,anon,authenticated;
revoke all on function public.gi_sync_measure_core_requirements() from public,anon,authenticated;
revoke all on function public.gi_evaluate_project_measures(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.gi_normalize_legal_form(text) to service_role,postgres;
grant execute on function public.gi_sync_measure_core_requirements() to service_role,postgres;
grant execute on function public.gi_evaluate_project_measures(uuid,bigint,uuid) to service_role,postgres;

commit;
