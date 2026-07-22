begin;

create table if not exists public.gi_signal_registry (
  signal_type text primary key,
  title_ru text not null,
  description_ru text not null,
  default_epistemic_status text not null default 'inferred'
    check (default_epistemic_status in ('observed','inferred','hypothesis')),
  allowed_source_tiers text[] not null default array['A','B','C']::text[],
  can_support_eligibility boolean not null default false
    check (can_support_eligibility = false),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.gi_signal_registry(signal_type,title_ru,description_ru,default_epistemic_status,allowed_source_tiers)
values
  ('funding_increase','Увеличение финансирования','Подтверждённое или предполагаемое увеличение бюджетного или программного финансирования.','inferred',array['A','B']),
  ('funding_reduction','Сокращение финансирования','Сокращение лимитов, ассигнований или доступного финансирования.','inferred',array['A','B']),
  ('new_support_measure','Новая мера поддержки','Появление новой программы, конкурса, субсидии, гранта или льготного финансирования.','inferred',array['A','B','C']),
  ('eligibility_change','Изменение условий участия','Изменение получателей, критериев, документов или иных условий участия.','inferred',array['A','B']),
  ('territorial_priority','Территориальный приоритет','Усиление или ограничение поддержки для отдельных территорий.','inferred',array['A','B','C']),
  ('sector_priority','Отраслевой приоритет','Усиление государственной поддержки конкретной отрасли или направления.','inferred',array['A','B','C']),
  ('application_window','Окно подачи заявок','Открытие, изменение или закрытие периода подачи заявок.','observed',array['A','B']),
  ('legal_constraint','Правовое ограничение','Новое обязательное ограничение, запрет или условие.','inferred',array['A']),
  ('budget_commitment','Бюджетное обязательство','Фиксация лимитов, ассигнований или бюджетного обязательства.','inferred',array['A','B']),
  ('procurement_activity','Закупочная активность','Появление государственного спроса, закупки, тендера или контракта.','observed',array['A','B']),
  ('institutional_narrative','Институциональный нарратив','Повторяющаяся формулировка или тема в официальной коммуникации.','inferred',array['A','B','C']),
  ('early_policy_signal','Ранний государственный сигнал','Предварительный сигнал, который ещё не стал правовой или бюджетной нормой.','hypothesis',array['B','C']),
  ('programme_termination','Завершение программы','Прекращение, отмена или утрата силы программы или нормативного основания.','inferred',array['A','B'])
on conflict(signal_type) do update set
  title_ru=excluded.title_ru,
  description_ru=excluded.description_ru,
  default_epistemic_status=excluded.default_epistemic_status,
  allowed_source_tiers=excluded.allowed_source_tiers,
  active=true,
  updated_at=now();

create table if not exists public.gi_intelligence_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gi_projects(id) on delete cascade,
  project_check_id uuid references public.gi_project_checks(id) on delete set null,
  telegram_user_id bigint,
  source_id uuid references public.gi_official_sources(id) on delete set null,
  source_snapshot_id uuid references public.gi_source_versions(id) on delete set null,
  evidence_id uuid references public.gi_evidence_records(id) on delete set null,
  input_kind text not null default 'project_report'
    check (input_kind in ('project_report','official_source','project_document','mixed')),
  status text not null default 'running'
    check (status in ('running','completed','failed','manual_review')),
  epistemic_policy text not null default 'signal_not_fact;trend_not_requirement;forecast_not_eligibility;narrative_not_legal_basis',
  engine_version text not null,
  metrics jsonb not null default '{}'::jsonb,
  error jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.gi_entities (
  id uuid primary key default gen_random_uuid(),
  intelligence_run_id uuid not null references public.gi_intelligence_runs(id) on delete cascade,
  project_id uuid not null references public.gi_projects(id) on delete cascade,
  source_id uuid references public.gi_official_sources(id) on delete set null,
  source_snapshot_id uuid references public.gi_source_versions(id) on delete set null,
  evidence_id uuid references public.gi_evidence_records(id) on delete set null,
  entity_type text not null
    check (entity_type in ('organization','authority','person','official','programme','support_measure','territory','date','money','indicator','legal_document','project','other')),
  canonical_name text not null,
  normalized_key text not null,
  aliases text[] not null default '{}'::text[],
  attributes jsonb not null default '{}'::jsonb,
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  epistemic_status text not null check (epistemic_status in ('observed','inferred','hypothesis')),
  truth_status text not null default 'unverified' check (truth_status in ('unverified','manual_review','verified','rejected')),
  engine_version text not null,
  created_at timestamptz not null default now(),
  unique(intelligence_run_id,normalized_key)
);

create table if not exists public.gi_claims (
  id uuid primary key default gen_random_uuid(),
  intelligence_run_id uuid not null references public.gi_intelligence_runs(id) on delete cascade,
  project_id uuid not null references public.gi_projects(id) on delete cascade,
  source_id uuid references public.gi_official_sources(id) on delete set null,
  source_snapshot_id uuid references public.gi_source_versions(id) on delete set null,
  evidence_id uuid references public.gi_evidence_records(id) on delete set null,
  claim_type text not null,
  actor_entity_ids uuid[] not null default '{}'::uuid[],
  intent text[] not null default '{}'::text[],
  mechanism text[] not null default '{}'::text[],
  resource jsonb not null default '[]'::jsonb,
  control text[] not null default '{}'::text[],
  expected_outcome text[] not null default '{}'::text[],
  territory_entity_ids uuid[] not null default '{}'::uuid[],
  effective_dates jsonb not null default '[]'::jsonb,
  canonical_payload jsonb not null default '{}'::jsonb,
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  epistemic_status text not null check (epistemic_status in ('observed','inferred','hypothesis')),
  truth_status text not null default 'unverified' check (truth_status in ('unverified','manual_review','verified','rejected')),
  can_support_eligibility boolean not null default false,
  engine_version text not null,
  created_at timestamptz not null default now(),
  check (
    can_support_eligibility = false
    or (
      evidence_id is not null
      and epistemic_status = 'observed'
      and truth_status = 'verified'
    )
  )
);

create table if not exists public.gi_events (
  id uuid primary key default gen_random_uuid(),
  intelligence_run_id uuid not null references public.gi_intelligence_runs(id) on delete cascade,
  project_id uuid not null references public.gi_projects(id) on delete cascade,
  source_id uuid references public.gi_official_sources(id) on delete set null,
  source_snapshot_id uuid references public.gi_source_versions(id) on delete set null,
  evidence_id uuid references public.gi_evidence_records(id) on delete set null,
  event_type text not null,
  occurred_at timestamptz,
  effective_dates jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  epistemic_status text not null check (epistemic_status in ('observed','inferred','hypothesis')),
  truth_status text not null default 'unverified' check (truth_status in ('unverified','manual_review','verified','rejected')),
  can_support_eligibility boolean not null default false check (can_support_eligibility=false),
  engine_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.gi_relations (
  id uuid primary key default gen_random_uuid(),
  intelligence_run_id uuid not null references public.gi_intelligence_runs(id) on delete cascade,
  project_id uuid not null references public.gi_projects(id) on delete cascade,
  source_id uuid references public.gi_official_sources(id) on delete set null,
  source_snapshot_id uuid references public.gi_source_versions(id) on delete set null,
  evidence_id uuid references public.gi_evidence_records(id) on delete set null,
  subject_entity_id uuid references public.gi_entities(id) on delete set null,
  subject_key text not null,
  predicate text not null,
  object_entity_id uuid references public.gi_entities(id) on delete set null,
  object_key text,
  object_value jsonb,
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  epistemic_status text not null check (epistemic_status in ('observed','inferred','hypothesis')),
  truth_status text not null default 'unverified' check (truth_status in ('unverified','manual_review','verified','rejected')),
  can_support_eligibility boolean not null default false check (can_support_eligibility=false),
  engine_version text not null,
  created_at timestamptz not null default now(),
  check (object_key is not null or object_value is not null)
);

create table if not exists public.gi_trajectories (
  id uuid primary key default gen_random_uuid(),
  intelligence_run_id uuid not null references public.gi_intelligence_runs(id) on delete cascade,
  project_id uuid not null references public.gi_projects(id) on delete cascade,
  source_id uuid references public.gi_official_sources(id) on delete set null,
  source_snapshot_id uuid references public.gi_source_versions(id) on delete set null,
  evidence_id uuid references public.gi_evidence_records(id) on delete set null,
  signal_type text not null references public.gi_signal_registry(signal_type),
  direction text not null check (direction in ('up','down','stable','emerging','terminating','insufficient_history')),
  period_start timestamptz,
  period_end timestamptz,
  velocity numeric,
  acceleration numeric,
  evidence_ids uuid[] not null default '{}'::uuid[],
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  epistemic_status text not null check (epistemic_status in ('inferred','hypothesis')),
  truth_status text not null default 'unverified' check (truth_status in ('unverified','manual_review','verified','rejected')),
  can_support_eligibility boolean not null default false check (can_support_eligibility=false),
  engine_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.gi_narratives (
  id uuid primary key default gen_random_uuid(),
  intelligence_run_id uuid not null references public.gi_intelligence_runs(id) on delete cascade,
  project_id uuid not null references public.gi_projects(id) on delete cascade,
  source_id uuid references public.gi_official_sources(id) on delete set null,
  source_snapshot_id uuid references public.gi_source_versions(id) on delete set null,
  evidence_id uuid references public.gi_evidence_records(id) on delete set null,
  theme text not null,
  repeated_terms text[] not null default '{}'::text[],
  transition_stage text not null check (transition_stage in ('rhetoric','programme','budget','legal_act','procurement')),
  evidence_ids uuid[] not null default '{}'::uuid[],
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  epistemic_status text not null check (epistemic_status in ('inferred','hypothesis')),
  truth_status text not null default 'unverified' check (truth_status in ('unverified','manual_review','verified','rejected')),
  can_support_eligibility boolean not null default false check (can_support_eligibility=false),
  engine_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.gi_forecasts (
  id uuid primary key default gen_random_uuid(),
  intelligence_run_id uuid not null references public.gi_intelligence_runs(id) on delete cascade,
  project_id uuid not null references public.gi_projects(id) on delete cascade,
  source_id uuid references public.gi_official_sources(id) on delete set null,
  source_snapshot_id uuid references public.gi_source_versions(id) on delete set null,
  evidence_id uuid references public.gi_evidence_records(id) on delete set null,
  forecast_type text not null,
  horizon_months integer not null check (horizon_months between 1 and 60),
  statement text not null,
  probability numeric(5,4) not null check (probability between 0 and 1),
  assumptions jsonb not null default '[]'::jsonb,
  falsification_conditions jsonb not null default '[]'::jsonb,
  evidence_ids uuid[] not null default '{}'::uuid[],
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  epistemic_status text not null default 'hypothesis' check (epistemic_status='hypothesis'),
  truth_status text not null default 'manual_review' check (truth_status in ('unverified','manual_review','rejected')),
  status text not null default 'manual_review' check (status in ('draft','manual_review','published','rejected')),
  can_support_eligibility boolean not null default false check (can_support_eligibility=false),
  engine_version text not null,
  created_at timestamptz not null default now(),
  check (status <> 'published' or cardinality(evidence_ids) >= 2)
);

create table if not exists public.gi_decision_cards (
  id uuid primary key default gen_random_uuid(),
  intelligence_run_id uuid not null references public.gi_intelligence_runs(id) on delete cascade,
  project_id uuid not null references public.gi_projects(id) on delete cascade,
  project_check_id uuid references public.gi_project_checks(id) on delete set null,
  measure_id uuid references public.gi_support_measures(id) on delete set null,
  source_id uuid references public.gi_official_sources(id) on delete set null,
  source_snapshot_id uuid references public.gi_source_versions(id) on delete set null,
  evidence_id uuid references public.gi_evidence_records(id) on delete set null,
  decision text not null,
  legal_basis jsonb not null default '[]'::jsonb,
  confirmed_conditions jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  next_action text not null,
  forecast_signal text,
  forecast_status text not null default 'none' check (forecast_status in ('none','hypothesis','manual_review')),
  eligibility_status text not null check (eligibility_status in ('match','mismatch','insufficient_data','manual_review')),
  verified_requirement_count integer not null default 0 check (verified_requirement_count >= 0),
  verified_evidence_count integer not null default 0 check (verified_evidence_count >= 0),
  truth_gate_passed boolean not null default false,
  publish_status text not null default 'manual_review' check (publish_status in ('draft','manual_review','published','rejected')),
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  epistemic_status text not null check (epistemic_status in ('observed','inferred','hypothesis')),
  truth_status text not null default 'manual_review' check (truth_status in ('unverified','manual_review','verified','rejected')),
  engine_version text not null,
  created_at timestamptz not null default now(),
  check (
    truth_gate_passed = false
    or (
      eligibility_status='match'
      and verified_requirement_count > 0
      and verified_evidence_count > 0
    )
  ),
  check (publish_status <> 'published' or truth_gate_passed = true)
);

alter table public.gi_analytic_signals add column if not exists intelligence_run_id uuid references public.gi_intelligence_runs(id) on delete set null;
alter table public.gi_analytic_signals add column if not exists project_id uuid references public.gi_projects(id) on delete cascade;
alter table public.gi_analytic_signals add column if not exists source_id uuid references public.gi_official_sources(id) on delete set null;
alter table public.gi_analytic_signals add column if not exists source_snapshot_id uuid references public.gi_source_versions(id) on delete set null;
alter table public.gi_analytic_signals add column if not exists evidence_id uuid references public.gi_evidence_records(id) on delete set null;
alter table public.gi_analytic_signals add column if not exists epistemic_status text not null default 'inferred';
alter table public.gi_analytic_signals add column if not exists engine_version text not null default 'legacy-analytic-signal';
alter table public.gi_analytic_signals add column if not exists can_support_eligibility boolean not null default false;
alter table public.gi_analytic_signals add column if not exists truth_status text not null default 'unverified';

update public.gi_analytic_signals set can_support_eligibility=false where can_support_eligibility is distinct from false;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='gi_analytic_signals_epistemic_status_check') then
    alter table public.gi_analytic_signals add constraint gi_analytic_signals_epistemic_status_check
      check (epistemic_status in ('observed','inferred','hypothesis'));
  end if;
  if not exists(select 1 from pg_constraint where conname='gi_analytic_signals_truth_status_check') then
    alter table public.gi_analytic_signals add constraint gi_analytic_signals_truth_status_check
      check (truth_status in ('unverified','manual_review','verified','rejected'));
  end if;
  if not exists(select 1 from pg_constraint where conname='gi_analytic_signals_no_eligibility_check') then
    alter table public.gi_analytic_signals add constraint gi_analytic_signals_no_eligibility_check
      check (can_support_eligibility=false);
  end if;
end $$;

create index if not exists gi_intelligence_runs_project_created_idx on public.gi_intelligence_runs(project_id,created_at desc);
create index if not exists gi_entities_project_type_idx on public.gi_entities(project_id,entity_type,normalized_key);
create index if not exists gi_claims_project_created_idx on public.gi_claims(project_id,created_at desc);
create index if not exists gi_events_project_occurred_idx on public.gi_events(project_id,occurred_at desc);
create index if not exists gi_relations_subject_idx on public.gi_relations(project_id,subject_key,predicate);
create index if not exists gi_relations_object_idx on public.gi_relations(project_id,object_key,predicate);
create index if not exists gi_trajectories_project_signal_idx on public.gi_trajectories(project_id,signal_type,created_at desc);
create index if not exists gi_narratives_project_theme_idx on public.gi_narratives(project_id,theme,created_at desc);
create index if not exists gi_forecasts_project_status_idx on public.gi_forecasts(project_id,status,created_at desc);
create index if not exists gi_decision_cards_project_status_idx on public.gi_decision_cards(project_id,publish_status,created_at desc);
create index if not exists gi_analytic_signals_project_type_idx on public.gi_analytic_signals(project_id,signal_type,created_at desc);

alter table public.gi_signal_registry enable row level security;
alter table public.gi_intelligence_runs enable row level security;
alter table public.gi_entities enable row level security;
alter table public.gi_claims enable row level security;
alter table public.gi_events enable row level security;
alter table public.gi_relations enable row level security;
alter table public.gi_trajectories enable row level security;
alter table public.gi_narratives enable row level security;
alter table public.gi_forecasts enable row level security;
alter table public.gi_decision_cards enable row level security;

revoke all on table public.gi_signal_registry from public,anon,authenticated;
revoke all on table public.gi_intelligence_runs from public,anon,authenticated;
revoke all on table public.gi_entities from public,anon,authenticated;
revoke all on table public.gi_claims from public,anon,authenticated;
revoke all on table public.gi_events from public,anon,authenticated;
revoke all on table public.gi_relations from public,anon,authenticated;
revoke all on table public.gi_trajectories from public,anon,authenticated;
revoke all on table public.gi_narratives from public,anon,authenticated;
revoke all on table public.gi_forecasts from public,anon,authenticated;
revoke all on table public.gi_decision_cards from public,anon,authenticated;

grant all on table public.gi_signal_registry to service_role;
grant all on table public.gi_intelligence_runs to service_role;
grant all on table public.gi_entities to service_role;
grant all on table public.gi_claims to service_role;
grant all on table public.gi_events to service_role;
grant all on table public.gi_relations to service_role;
grant all on table public.gi_trajectories to service_role;
grant all on table public.gi_narratives to service_role;
grant all on table public.gi_forecasts to service_role;
grant all on table public.gi_decision_cards to service_role;

create or replace function public.gi_jsonb_uuid_array(p_value jsonb)
returns uuid[]
language sql
immutable
set search_path=pg_catalog
as $$
  select coalesce(array_agg(value::uuid),'{}'::uuid[])
  from jsonb_array_elements_text(coalesce(p_value,'[]'::jsonb)) value
  where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$$;

revoke all on function public.gi_jsonb_uuid_array(jsonb) from public,anon,authenticated;
grant execute on function public.gi_jsonb_uuid_array(jsonb) to service_role,postgres;

create or replace function public.gi_persist_intelligence_bundle(
  p_project_id uuid,
  p_telegram_user_id bigint,
  p_check_id uuid,
  p_bundle jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_run_id uuid;
  v_item jsonb;
  v_signal_id uuid;
  v_subject_id uuid;
  v_object_id uuid;
  v_actor_ids uuid[];
  v_territory_ids uuid[];
  v_evidence_text text;
  v_engine_version text:=coalesce(nullif(p_bundle->>'engineVersion',''),'ver436sia-intelligence-v0.72');
  v_metrics jsonb;
begin
  if not exists(
    select 1 from public.gi_projects
    where id=p_project_id and telegram_user_id=p_telegram_user_id
  ) then
    raise exception 'project_not_found';
  end if;

  if p_check_id is not null and not exists(
    select 1 from public.gi_project_checks
    where id=p_check_id and project_id=p_project_id and telegram_user_id=p_telegram_user_id
  ) then
    raise exception 'project_check_not_found';
  end if;

  insert into public.gi_intelligence_runs(
    project_id,project_check_id,telegram_user_id,input_kind,status,engine_version
  ) values(
    p_project_id,p_check_id,p_telegram_user_id,
    coalesce(nullif(p_bundle->>'inputKind',''),'project_report'),
    'running',v_engine_version
  ) returning id into v_run_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'entities','[]'::jsonb)) loop
    insert into public.gi_entities(
      intelligence_run_id,project_id,source_id,source_snapshot_id,evidence_id,
      entity_type,canonical_name,normalized_key,aliases,attributes,
      confidence,epistemic_status,truth_status,engine_version
    ) values(
      v_run_id,p_project_id,
      nullif(v_item->>'sourceId','')::uuid,
      nullif(v_item->>'sourceSnapshotId','')::uuid,
      nullif(v_item->>'evidenceId','')::uuid,
      coalesce(nullif(v_item->>'type',''),'other'),
      coalesce(nullif(v_item->>'canonicalName',''),nullif(v_item->>'key',''),'Неизвестная сущность'),
      coalesce(nullif(v_item->>'key',''),md5(v_item::text)),
      array(select jsonb_array_elements_text(coalesce(v_item->'aliases','[]'::jsonb))),
      coalesce(v_item->'attributes','{}'::jsonb),
      greatest(0,least(1,coalesce(nullif(v_item->>'confidence','')::numeric,0.5))),
      coalesce(nullif(v_item->>'epistemicStatus',''),'inferred'),
      coalesce(nullif(v_item->>'truthStatus',''),'unverified'),
      v_engine_version
    ) on conflict(intelligence_run_id,normalized_key) do update set
      aliases=excluded.aliases,
      attributes=public.gi_entities.attributes||excluded.attributes,
      confidence=greatest(public.gi_entities.confidence,excluded.confidence);
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'claims','[]'::jsonb)) loop
    select coalesce(array_agg(id),'{}'::uuid[]) into v_actor_ids
    from public.gi_entities
    where intelligence_run_id=v_run_id
      and normalized_key in (select jsonb_array_elements_text(coalesce(v_item->'actorKeys','[]'::jsonb)));

    select coalesce(array_agg(id),'{}'::uuid[]) into v_territory_ids
    from public.gi_entities
    where intelligence_run_id=v_run_id
      and normalized_key in (select jsonb_array_elements_text(coalesce(v_item->'territoryKeys','[]'::jsonb)));

    insert into public.gi_claims(
      intelligence_run_id,project_id,source_id,source_snapshot_id,evidence_id,
      claim_type,actor_entity_ids,intent,mechanism,resource,control,expected_outcome,
      territory_entity_ids,effective_dates,canonical_payload,confidence,
      epistemic_status,truth_status,can_support_eligibility,engine_version
    ) values(
      v_run_id,p_project_id,
      nullif(v_item->>'sourceId','')::uuid,
      nullif(v_item->>'sourceSnapshotId','')::uuid,
      nullif(v_item->>'evidenceId','')::uuid,
      coalesce(nullif(v_item->>'claimType',''),'canonical_claim'),
      v_actor_ids,
      array(select jsonb_array_elements_text(coalesce(v_item->'intent','[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(v_item->'mechanism','[]'::jsonb))),
      coalesce(v_item->'resource','[]'::jsonb),
      array(select jsonb_array_elements_text(coalesce(v_item->'control','[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(v_item->'expectedOutcome','[]'::jsonb))),
      v_territory_ids,
      coalesce(v_item->'effectiveDates','[]'::jsonb),
      coalesce(v_item->'canonicalPayload','{}'::jsonb),
      greatest(0,least(1,coalesce(nullif(v_item->>'confidence','')::numeric,0.5))),
      coalesce(nullif(v_item->>'epistemicStatus',''),'inferred'),
      coalesce(nullif(v_item->>'truthStatus',''),'unverified'),
      coalesce((v_item->>'canSupportEligibility')::boolean,false),
      v_engine_version
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'events','[]'::jsonb)) loop
    insert into public.gi_events(
      intelligence_run_id,project_id,source_id,source_snapshot_id,evidence_id,
      event_type,occurred_at,effective_dates,payload,confidence,
      epistemic_status,truth_status,can_support_eligibility,engine_version
    ) values(
      v_run_id,p_project_id,
      nullif(v_item->>'sourceId','')::uuid,
      nullif(v_item->>'sourceSnapshotId','')::uuid,
      nullif(v_item->>'evidenceId','')::uuid,
      coalesce(nullif(v_item->>'eventType',''),'source_change'),
      nullif(v_item->>'occurredAt','')::timestamptz,
      coalesce(v_item->'effectiveDates','[]'::jsonb),
      coalesce(v_item->'payload','{}'::jsonb),
      greatest(0,least(1,coalesce(nullif(v_item->>'confidence','')::numeric,0.5))),
      coalesce(nullif(v_item->>'epistemicStatus',''),'observed'),
      coalesce(nullif(v_item->>'truthStatus',''),'unverified'),
      false,v_engine_version
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'signals','[]'::jsonb)) loop
    insert into public.gi_analytic_signals(
      signal_key,signal_type,title,summary,level,region,sectors,confidence,status,
      first_detected_at,last_confirmed_at,rationale,metadata,signal_stage,
      actionability_status,evidence_count,intelligence_run_id,project_id,
      source_id,source_snapshot_id,evidence_id,epistemic_status,engine_version,
      can_support_eligibility,truth_status
    ) values(
      coalesce(nullif(v_item->>'key',''),p_project_id::text||':'||coalesce(v_item->>'type','early_policy_signal')||':'||md5(v_item::text)),
      coalesce(nullif(v_item->>'type',''),'early_policy_signal'),
      coalesce(nullif(v_item->>'title',''),'Государственный сигнал'),
      nullif(v_item->>'summary',''),
      coalesce(nullif(v_item->>'level',''),'project'),
      nullif(v_item->>'region',''),
      array(select jsonb_array_elements_text(coalesce(v_item->'sectors','[]'::jsonb))),
      greatest(0,least(1,coalesce(nullif(v_item->>'confidence','')::numeric,0.5))),
      'active',
      coalesce(nullif(v_item->>'firstDetectedAt','')::timestamptz,now()),
      nullif(v_item->>'lastConfirmedAt','')::timestamptz,
      jsonb_build_object('source','ver436sia-intelligence-merge','epistemic_status',coalesce(v_item->>'epistemicStatus','inferred')),
      jsonb_build_object('project_check_id',p_check_id,'truth_status',coalesce(v_item->>'truthStatus','unverified')),
      'mention','not_actionable',
      jsonb_array_length(coalesce(v_item->'evidenceIds','[]'::jsonb)),
      v_run_id,p_project_id,
      nullif(v_item->>'sourceId','')::uuid,
      nullif(v_item->>'sourceSnapshotId','')::uuid,
      nullif(v_item->>'evidenceId','')::uuid,
      coalesce(nullif(v_item->>'epistemicStatus',''),'inferred'),
      v_engine_version,false,
      coalesce(nullif(v_item->>'truthStatus',''),'unverified')
    ) on conflict(signal_key) do update set
      title=excluded.title,
      summary=excluded.summary,
      confidence=greatest(public.gi_analytic_signals.confidence,excluded.confidence),
      last_confirmed_at=coalesce(excluded.last_confirmed_at,public.gi_analytic_signals.last_confirmed_at),
      evidence_count=greatest(public.gi_analytic_signals.evidence_count,excluded.evidence_count),
      intelligence_run_id=excluded.intelligence_run_id,
      project_id=excluded.project_id,
      source_id=coalesce(excluded.source_id,public.gi_analytic_signals.source_id),
      source_snapshot_id=coalesce(excluded.source_snapshot_id,public.gi_analytic_signals.source_snapshot_id),
      evidence_id=coalesce(excluded.evidence_id,public.gi_analytic_signals.evidence_id),
      epistemic_status=excluded.epistemic_status,
      engine_version=excluded.engine_version,
      truth_status=excluded.truth_status,
      updated_at=now()
    returning id into v_signal_id;

    for v_evidence_text in select jsonb_array_elements_text(coalesce(v_item->'evidenceIds','[]'::jsonb)) loop
      if v_evidence_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        insert into public.gi_signal_evidence(signal_id,evidence_id,weight,relation)
        values(v_signal_id,v_evidence_text::uuid,1,'supports')
        on conflict(signal_id,evidence_id) do nothing;
      end if;
    end loop;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'relations','[]'::jsonb)) loop
    select id into v_subject_id from public.gi_entities
      where intelligence_run_id=v_run_id and normalized_key=v_item->>'subjectKey' limit 1;
    select id into v_object_id from public.gi_entities
      where intelligence_run_id=v_run_id and normalized_key=v_item->>'objectKey' limit 1;

    insert into public.gi_relations(
      intelligence_run_id,project_id,source_id,source_snapshot_id,evidence_id,
      subject_entity_id,subject_key,predicate,object_entity_id,object_key,object_value,
      confidence,epistemic_status,truth_status,can_support_eligibility,engine_version
    ) values(
      v_run_id,p_project_id,
      nullif(v_item->>'sourceId','')::uuid,
      nullif(v_item->>'sourceSnapshotId','')::uuid,
      nullif(v_item->>'evidenceId','')::uuid,
      v_subject_id,coalesce(nullif(v_item->>'subjectKey',''),'unknown'),
      coalesce(nullif(v_item->>'predicate',''),'related_to'),
      v_object_id,nullif(v_item->>'objectKey',''),v_item->'objectValue',
      greatest(0,least(1,coalesce(nullif(v_item->>'confidence','')::numeric,0.5))),
      coalesce(nullif(v_item->>'epistemicStatus',''),'inferred'),
      coalesce(nullif(v_item->>'truthStatus',''),'unverified'),
      false,v_engine_version
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'trajectories','[]'::jsonb)) loop
    insert into public.gi_trajectories(
      intelligence_run_id,project_id,source_id,source_snapshot_id,evidence_id,
      signal_type,direction,period_start,period_end,velocity,acceleration,evidence_ids,
      confidence,epistemic_status,truth_status,can_support_eligibility,engine_version
    ) values(
      v_run_id,p_project_id,
      nullif(v_item->>'sourceId','')::uuid,
      nullif(v_item->>'sourceSnapshotId','')::uuid,
      nullif(v_item->>'evidenceId','')::uuid,
      coalesce(nullif(v_item->>'signalType',''),'early_policy_signal'),
      coalesce(nullif(v_item->>'direction',''),'insufficient_history'),
      nullif(v_item->>'periodStart','')::timestamptz,
      nullif(v_item->>'periodEnd','')::timestamptz,
      nullif(v_item->>'velocity','')::numeric,
      nullif(v_item->>'acceleration','')::numeric,
      public.gi_jsonb_uuid_array(v_item->'evidenceIds'),
      greatest(0,least(1,coalesce(nullif(v_item->>'confidence','')::numeric,0.5))),
      case when v_item->>'epistemicStatus'='hypothesis' then 'hypothesis' else 'inferred' end,
      coalesce(nullif(v_item->>'truthStatus',''),'unverified'),
      false,v_engine_version
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'narratives','[]'::jsonb)) loop
    insert into public.gi_narratives(
      intelligence_run_id,project_id,source_id,source_snapshot_id,evidence_id,
      theme,repeated_terms,transition_stage,evidence_ids,confidence,
      epistemic_status,truth_status,can_support_eligibility,engine_version
    ) values(
      v_run_id,p_project_id,
      nullif(v_item->>'sourceId','')::uuid,
      nullif(v_item->>'sourceSnapshotId','')::uuid,
      nullif(v_item->>'evidenceId','')::uuid,
      coalesce(nullif(v_item->>'theme',''),'unknown'),
      array(select jsonb_array_elements_text(coalesce(v_item->'repeatedTerms','[]'::jsonb))),
      coalesce(nullif(v_item->>'transitionStage',''),'rhetoric'),
      public.gi_jsonb_uuid_array(v_item->'evidenceIds'),
      greatest(0,least(1,coalesce(nullif(v_item->>'confidence','')::numeric,0.5))),
      case when v_item->>'epistemicStatus'='hypothesis' then 'hypothesis' else 'inferred' end,
      coalesce(nullif(v_item->>'truthStatus',''),'unverified'),
      false,v_engine_version
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'forecasts','[]'::jsonb)) loop
    insert into public.gi_forecasts(
      intelligence_run_id,project_id,source_id,source_snapshot_id,evidence_id,
      forecast_type,horizon_months,statement,probability,assumptions,
      falsification_conditions,evidence_ids,confidence,epistemic_status,
      truth_status,status,can_support_eligibility,engine_version
    ) values(
      v_run_id,p_project_id,
      nullif(v_item->>'sourceId','')::uuid,
      nullif(v_item->>'sourceSnapshotId','')::uuid,
      nullif(v_item->>'evidenceId','')::uuid,
      coalesce(nullif(v_item->>'forecastType',''),'controlled_forecast'),
      greatest(1,least(60,coalesce(nullif(v_item->>'horizonMonths','')::integer,12))),
      coalesce(nullif(v_item->>'statement',''),'Прогноз требует ручной проверки.'),
      greatest(0,least(1,coalesce(nullif(v_item->>'probability','')::numeric,0.5))),
      coalesce(v_item->'assumptions','[]'::jsonb),
      coalesce(v_item->'falsificationConditions','[]'::jsonb),
      public.gi_jsonb_uuid_array(v_item->'evidenceIds'),
      greatest(0,least(1,coalesce(nullif(v_item->>'confidence','')::numeric,0.5))),
      'hypothesis',
      case when v_item->>'truthStatus'='rejected' then 'rejected' else 'manual_review' end,
      'manual_review',false,v_engine_version
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_bundle->'decisionCards','[]'::jsonb)) loop
    insert into public.gi_decision_cards(
      intelligence_run_id,project_id,project_check_id,measure_id,source_id,
      source_snapshot_id,evidence_id,decision,legal_basis,confirmed_conditions,
      blockers,next_action,forecast_signal,forecast_status,eligibility_status,
      verified_requirement_count,verified_evidence_count,truth_gate_passed,
      publish_status,confidence,epistemic_status,truth_status,engine_version
    ) values(
      v_run_id,p_project_id,p_check_id,
      nullif(v_item->>'measureId','')::uuid,
      nullif(v_item->>'sourceId','')::uuid,
      nullif(v_item->>'sourceSnapshotId','')::uuid,
      nullif(v_item->>'evidenceId','')::uuid,
      coalesce(nullif(v_item->>'decision',''),'Требуется ручная проверка.'),
      coalesce(v_item->'legalBasis','[]'::jsonb),
      coalesce(v_item->'confirmedConditions','[]'::jsonb),
      coalesce(v_item->'blockers','[]'::jsonb),
      coalesce(nullif(v_item->>'nextAction',''),'Проверить первичные источники.'),
      nullif(v_item->>'forecastSignal',''),
      coalesce(nullif(v_item->>'forecastStatus',''),'none'),
      coalesce(nullif(v_item->>'eligibilityStatus',''),'insufficient_data'),
      greatest(0,coalesce(nullif(v_item->>'verifiedRequirementCount','')::integer,0)),
      greatest(0,coalesce(nullif(v_item->>'verifiedEvidenceCount','')::integer,0)),
      coalesce((v_item->>'truthGatePassed')::boolean,false),
      coalesce(nullif(v_item->>'publishStatus',''),'manual_review'),
      greatest(0,least(1,coalesce(nullif(v_item->>'confidence','')::numeric,0.5))),
      coalesce(nullif(v_item->>'epistemicStatus',''),'inferred'),
      coalesce(nullif(v_item->>'truthStatus',''),'manual_review'),
      v_engine_version
    );
  end loop;

  v_metrics:=jsonb_build_object(
    'entities',(select count(*) from public.gi_entities where intelligence_run_id=v_run_id),
    'claims',(select count(*) from public.gi_claims where intelligence_run_id=v_run_id),
    'events',(select count(*) from public.gi_events where intelligence_run_id=v_run_id),
    'signals',(select count(*) from public.gi_analytic_signals where intelligence_run_id=v_run_id),
    'relations',(select count(*) from public.gi_relations where intelligence_run_id=v_run_id),
    'trajectories',(select count(*) from public.gi_trajectories where intelligence_run_id=v_run_id),
    'narratives',(select count(*) from public.gi_narratives where intelligence_run_id=v_run_id),
    'forecasts',(select count(*) from public.gi_forecasts where intelligence_run_id=v_run_id),
    'decision_cards',(select count(*) from public.gi_decision_cards where intelligence_run_id=v_run_id),
    'published_decision_cards',(select count(*) from public.gi_decision_cards where intelligence_run_id=v_run_id and publish_status='published')
  );

  update public.gi_intelligence_runs
  set status=case when (v_metrics->>'published_decision_cards')::integer>0 then 'completed' else 'manual_review' end,
      metrics=v_metrics,
      finished_at=now()
  where id=v_run_id;

  return jsonb_build_object(
    'run_id',v_run_id,
    'status',case when (v_metrics->>'published_decision_cards')::integer>0 then 'completed' else 'manual_review' end,
    'engine_version',v_engine_version,
    'metrics',v_metrics
  );
end;
$$;

revoke all on function public.gi_persist_intelligence_bundle(uuid,bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.gi_persist_intelligence_bundle(uuid,bigint,uuid,jsonb) to service_role,postgres;

create or replace function public.gi_get_project_intelligence(
  p_project_id uuid,
  p_telegram_user_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_run_id uuid;
begin
  if not exists(
    select 1 from public.gi_projects
    where id=p_project_id and telegram_user_id=p_telegram_user_id
  ) then raise exception 'project_not_found'; end if;

  select id into v_run_id
  from public.gi_intelligence_runs
  where project_id=p_project_id and telegram_user_id=p_telegram_user_id
  order by created_at desc limit 1;

  if v_run_id is null then
    return jsonb_build_object('status','not_run','engine_version','ver436sia-intelligence-v0.72');
  end if;

  return jsonb_build_object(
    'run',(select to_jsonb(r) from public.gi_intelligence_runs r where id=v_run_id),
    'entities',coalesce((select jsonb_agg(to_jsonb(e) order by e.entity_type,e.canonical_name) from public.gi_entities e where e.intelligence_run_id=v_run_id),'[]'::jsonb),
    'claims',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.gi_claims c where c.intelligence_run_id=v_run_id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at desc nulls last) from public.gi_events e where e.intelligence_run_id=v_run_id),'[]'::jsonb),
    'signals',coalesce((select jsonb_agg(to_jsonb(s) order by s.confidence desc) from public.gi_analytic_signals s where s.intelligence_run_id=v_run_id),'[]'::jsonb),
    'relations',coalesce((select jsonb_agg(to_jsonb(r) order by r.predicate) from public.gi_relations r where r.intelligence_run_id=v_run_id),'[]'::jsonb),
    'trajectories',coalesce((select jsonb_agg(to_jsonb(t) order by t.confidence desc) from public.gi_trajectories t where t.intelligence_run_id=v_run_id),'[]'::jsonb),
    'narratives',coalesce((select jsonb_agg(to_jsonb(n) order by n.confidence desc) from public.gi_narratives n where n.intelligence_run_id=v_run_id),'[]'::jsonb),
    'forecasts',coalesce((select jsonb_agg(to_jsonb(f) order by f.confidence desc) from public.gi_forecasts f where f.intelligence_run_id=v_run_id),'[]'::jsonb),
    'decision_cards',coalesce((select jsonb_agg(to_jsonb(d) order by d.confidence desc) from public.gi_decision_cards d where d.intelligence_run_id=v_run_id),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.gi_get_project_intelligence(uuid,bigint) from public,anon,authenticated;
grant execute on function public.gi_get_project_intelligence(uuid,bigint) to service_role,postgres;

commit;
