begin;

alter table public.gi_source_health enable row level security;
revoke all on table public.gi_source_health from anon, authenticated;

alter table public.gi_official_sources
  add column if not exists authority_tier text not null default 'B',
  add column if not exists allowed_uses text[] not null default array['discovery','program_description']::text[];

alter table public.gi_source_endpoints
  add column if not exists evidence_tier text not null default 'B',
  add column if not exists owner_verified boolean not null default false,
  add column if not exists allowed_uses text[] not null default array['discovery','program_description']::text[];

alter table public.gi_source_documents
  add column if not exists normalized_url text,
  add column if not exists evidence_tier text not null default 'B',
  add column if not exists owner_validation_status text not null default 'pending',
  add column if not exists duplicate_of uuid references public.gi_source_documents(id) on delete set null;

alter table public.gi_analytic_signals
  add column if not exists signal_stage text not null default 'mention',
  add column if not exists actionability_status text not null default 'not_actionable',
  add column if not exists evidence_count integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='gi_official_sources_authority_tier_check') then
    alter table public.gi_official_sources add constraint gi_official_sources_authority_tier_check check (authority_tier in ('A','B','C','D','E'));
  end if;
  if not exists (select 1 from pg_constraint where conname='gi_source_endpoints_evidence_tier_check') then
    alter table public.gi_source_endpoints add constraint gi_source_endpoints_evidence_tier_check check (evidence_tier in ('A','B','C','D','E'));
  end if;
  if not exists (select 1 from pg_constraint where conname='gi_source_documents_evidence_tier_check') then
    alter table public.gi_source_documents add constraint gi_source_documents_evidence_tier_check check (evidence_tier in ('A','B','C','D','E'));
  end if;
  if not exists (select 1 from pg_constraint where conname='gi_source_documents_owner_validation_check') then
    alter table public.gi_source_documents add constraint gi_source_documents_owner_validation_check check (owner_validation_status in ('pending','verified','needs_review','rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname='gi_analytic_signals_stage_check') then
    alter table public.gi_analytic_signals add constraint gi_analytic_signals_stage_check check (signal_stage in ('mention','opportunity_candidate','verified_measure','project_match','actionable_opportunity'));
  end if;
  if not exists (select 1 from pg_constraint where conname='gi_analytic_signals_actionability_check') then
    alter table public.gi_analytic_signals add constraint gi_analytic_signals_actionability_check check (actionability_status in ('not_actionable','needs_verification','actionable','expired','rejected'));
  end if;
end $$;

create or replace function public.gi_url_host(p_url text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select lower(split_part(regexp_replace(p_url, '^https?://', '', 'i'), '/', 1));
$$;

create or replace function public.gi_normalize_source_url(p_url text)
returns text
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  v_url text := btrim(p_url);
  v_channel text;
  v_post text;
begin
  v_url := regexp_replace(v_url, '#.*$', '');

  if v_url ~* '^https://(www\.)?t\.me/' then
    v_channel := substring(v_url from '(?i)^https://(?:www\.)?t\.me/(?:s/)?([^/?#]+)');
    v_post := substring(v_url from '(?i)^https://(?:www\.)?t\.me/(?:s/)?[^/?#]+/([0-9]+)');
    if v_channel is not null then
      if v_post is not null then
        return 'https://t.me/s/' || lower(v_channel) || '/' || v_post;
      end if;
      return 'https://t.me/s/' || lower(v_channel);
    end if;
  end if;

  v_url := regexp_replace(v_url, '([?&])(utm_[^=&]+|yclid|gclid|_openstat)=[^&]*', '\1', 'gi');
  v_url := regexp_replace(v_url, '[?&]+$', '');
  return v_url;
end;
$$;

update public.gi_official_sources
set authority_tier = case
      when public.gi_url_host(base_url) in ('publication.pravo.gov.ru','regulation.gov.ru','promote.budget.gov.ru') then 'A'
      else 'B'
    end,
    allowed_uses = case
      when public.gi_url_host(base_url) in ('publication.pravo.gov.ru','regulation.gov.ru','promote.budget.gov.ru')
        then array['eligibility','deadline','amount','legal_conclusion','verification','discovery']::text[]
      else array['program_description','official_link','discovery','early_signal']::text[]
    end;

update public.gi_source_endpoints
set evidence_tier = case
      when public.gi_url_host(url) in ('publication.pravo.gov.ru','regulation.gov.ru','promote.budget.gov.ru') then 'A'
      when public.gi_url_host(url) in ('t.me','telegram.me') then 'C'
      else 'B'
    end,
    allowed_uses = case
      when public.gi_url_host(url) in ('publication.pravo.gov.ru','regulation.gov.ru','promote.budget.gov.ru')
        then array['eligibility','deadline','amount','legal_conclusion','verification','discovery']::text[]
      when public.gi_url_host(url) in ('t.me','telegram.me')
        then array['early_signal','notification','discovery']::text[]
      else array['program_description','official_link','discovery','early_signal']::text[]
    end,
    owner_verified = true;

update public.gi_source_documents d
set source_id = s.id,
    source_key = s.source_key,
    authority = s.authority,
    owner_validation_status = 'verified'
from public.gi_official_sources s
where s.source_key = 'rec-russia'
  and d.source_key = 'mybusiness-kbr'
  and public.gi_url_host(d.canonical_url) in ('t.me','telegram.me')
  and lower(d.canonical_url) like '%rusexportnews%';

update public.gi_source_documents
set normalized_url = public.gi_normalize_source_url(canonical_url),
    evidence_tier = case
      when public.gi_url_host(canonical_url) in ('publication.pravo.gov.ru','regulation.gov.ru','promote.budget.gov.ru') then 'A'
      when public.gi_url_host(canonical_url) in ('t.me','telegram.me') then 'C'
      else 'B'
    end;

update public.gi_source_documents d
set owner_validation_status = case
  when exists (
    select 1 from public.gi_official_sources s
    where s.id = d.source_id
      and public.gi_url_host(s.base_url) = public.gi_url_host(d.canonical_url)
  ) then 'verified'
  when exists (
    select 1 from public.gi_source_endpoints e
    where e.source_id = d.source_id
      and e.active = true
      and public.gi_url_host(e.url) = public.gi_url_host(d.canonical_url)
  ) then 'verified'
  else 'needs_review'
end;

with ranked as (
  select id,
         first_value(id) over (partition by source_id, normalized_url order by first_seen_at, id) as primary_id,
         row_number() over (partition by source_id, normalized_url order by first_seen_at, id) as rn
  from public.gi_source_documents
  where normalized_url is not null
)
update public.gi_source_documents d
set duplicate_of = r.primary_id
from ranked r
where d.id = r.id and r.rn > 1;

create index if not exists gi_source_documents_normalized_url_v060_idx
  on public.gi_source_documents(source_id, normalized_url)
  where duplicate_of is null;
create index if not exists gi_source_documents_owner_review_v060_idx
  on public.gi_source_documents(owner_validation_status)
  where owner_validation_status <> 'verified';

update public.gi_analytic_signals s
set evidence_count = coalesce((select count(*) from public.gi_signal_evidence se where se.signal_id=s.id),0),
    signal_stage = case
      when exists (select 1 from public.gi_signal_evidence se join public.gi_evidence_records er on er.id=se.evidence_id where se.signal_id=s.id and er.verification_status='verified')
        then 'opportunity_candidate'
      else 'mention'
    end,
    actionability_status = case
      when exists (select 1 from public.gi_signal_evidence se join public.gi_evidence_records er on er.id=se.evidence_id where se.signal_id=s.id and er.verification_status='verified')
        then 'needs_verification'
      else 'not_actionable'
    end;

create or replace function public.gi_apply_truth_gate(p_report jsonb)
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
  v_evidence_total numeric := coalesce(nullif(p_report #>> '{evidence_summary,evidence_records}','')::numeric,0);
  v_evidence_verified numeric := coalesce(nullif(p_report #>> '{evidence_summary,verified_records}','')::numeric,0);
  v_best_match numeric := coalesce(nullif(p_report #>> '{readiness,best_match_score}','')::numeric,0);
  v_rules_checked integer := 0;
  v_financial_facts integer := 0;
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
  select count(*) into v_rules_checked
  from jsonb_array_elements(coalesce(p_report->'measure_matches','[]'::jsonb)) m
  where jsonb_array_length(coalesce(m->'matched_requirements','[]'::jsonb))
      + jsonb_array_length(coalesce(m->'blockers','[]'::jsonb)) > 0;

  select count(*) into v_financial_facts
  from jsonb_array_elements(coalesce(p_report->'project_facts','[]'::jsonb)) f
  where f->>'code' in ('project.budget','project.cofinancing','project.financial_model','project.commercial_offers')
    and f->>'status'='verified';

  v_data_index := case when v_facts_total=0 then 0 else least(100,round(v_facts_verified*100/v_facts_total))::integer end;
  v_document_index := case when v_documents_total=0 then 0 else least(100,round(v_documents_parsed*100/v_documents_total))::integer end;
  v_legal_index := (case when coalesce((p_report #>> '{readiness,legal_form_ready}')::boolean,false) then 50 else 0 end)
                 + (case when coalesce((p_report #>> '{readiness,land_ready}')::boolean,false) then 50 else 0 end);
  v_financial_index := least(100,v_financial_facts*25);
  v_evidence_index := case when v_evidence_total=0 then 0 else least(100,round(v_evidence_verified*100/v_evidence_total))::integer end;
  v_eligibility_index := case when v_rules_checked>0 and v_evidence_verified>0 then least(100,round(v_best_match))::integer else 0 end;
  v_submission_index := case when v_document_index=100 and v_eligibility_index>=70 and v_evidence_index>=70 then 100 else 0 end;

  v_score := round(
      v_data_index*0.20
    + v_document_index*0.20
    + v_legal_index*0.15
    + v_financial_index*0.10
    + v_eligibility_index*0.20
    + v_evidence_index*0.10
    + v_submission_index*0.05
  )::integer;

  if v_evidence_verified=0 then v_score:=least(v_score,29); end if;
  if v_documents_total>0 and v_documents_parsed=0 then v_score:=least(v_score,39); end if;
  if v_rules_checked=0 then v_score:=least(v_score,49); end if;

  if v_evidence_verified=0 then
    v_status:='Предварительная оценка: доказательства не подтверждены'; v_level:='preliminary';
  elsif v_documents_total>0 and v_documents_parsed=0 then
    v_status:='Предварительная оценка: документы не разобраны'; v_level:='preliminary';
  elsif v_rules_checked=0 then
    v_status:='Предварительная оценка: критерии не проверены'; v_level:='preliminary';
  elsif v_score>=80 then
    v_status:='Готов к подаче по подтверждённым критериям'; v_level:='verified';
  elsif v_score>=55 then
    v_status:='Есть подтверждённая основа, нужно закрыть пробелы'; v_level:='verified';
  else
    v_status:='Нужно дополнить подтверждённые данные'; v_level:='verified';
  end if;

  select coalesce(jsonb_agg(
    case
      when m->>'eligibility_status'='match' and (v_rules_checked=0 or v_evidence_verified=0)
        then (m || jsonb_build_object('eligibility_status','manual_review','verdict_level','candidate'))
      else (m || jsonb_build_object('verdict_level',case when m->>'eligibility_status'='match' then 'verified_match' else 'candidate' end))
    end
  ),'[]'::jsonb)
  into v_matches
  from jsonb_array_elements(coalesce(p_report->'measure_matches','[]'::jsonb)) m;

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
      'version','v0.60',
      'assessment_level',v_level,
      'verified_evidence_required',true,
      'verified_evidence',v_evidence_verified,
      'documents_parsed',v_documents_parsed,
      'eligibility_rules_checked',v_rules_checked,
      'can_claim_match',v_evidence_verified>0 and v_rules_checked>0,
      'can_claim_document_readiness',v_documents_total>0 and v_documents_parsed=v_documents_total
    ),true
  ) || jsonb_build_object('metadata',coalesce(p_report->'metadata','{}'::jsonb) || jsonb_build_object('truth_gate','v0.60'));
end;
$$;

revoke all on function public.gi_url_host(text) from public, anon, authenticated;
revoke all on function public.gi_normalize_source_url(text) from public, anon, authenticated;
revoke all on function public.gi_apply_truth_gate(jsonb) from public, anon, authenticated;
grant execute on function public.gi_url_host(text) to service_role, postgres;
grant execute on function public.gi_normalize_source_url(text) to service_role, postgres;
grant execute on function public.gi_apply_truth_gate(jsonb) to service_role, postgres;

commit;
