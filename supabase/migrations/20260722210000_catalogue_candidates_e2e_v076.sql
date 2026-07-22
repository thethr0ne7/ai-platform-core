begin;

create table if not exists public.gi_measure_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_code text not null unique,
  title text not null,
  measure_type text not null,
  authority text not null,
  level text not null default 'federal',
  region text,
  summary text not null,
  official_url text not null,
  applicant_types text[] not null default '{}'::text[],
  sectors text[] not null default '{}'::text[],
  max_amount numeric,
  source_document_id uuid not null references public.gi_source_documents(id) on delete restrict,
  source_version_id uuid not null references public.gi_source_versions(id) on delete restrict,
  source_locator text not null,
  evidence_quote text not null,
  evidence_tier text not null,
  owner_validation_status text not null,
  candidate_status text not null default 'machine_match',
  confidence numeric not null default 0.45,
  can_support_eligibility boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  reviewed_by bigint,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gi_measure_candidates_type_check check(measure_type in ('grant','subsidy','loan','leasing','guarantee','tax','land','property','infrastructure','export','consulting','other')),
  constraint gi_measure_candidates_level_check check(level in ('federal','regional','municipal')),
  constraint gi_measure_candidates_tier_check check(evidence_tier in ('A','B','C','D','E')),
  constraint gi_measure_candidates_status_check check(candidate_status in ('machine_match','needs_review','human_approved','promoted','rejected')),
  constraint gi_measure_candidates_confidence_check check(confidence between 0 and 1),
  constraint gi_measure_candidates_no_eligibility check(can_support_eligibility=false)
);

create index if not exists gi_measure_candidates_status_idx on public.gi_measure_candidates(candidate_status,created_at desc);
create index if not exists gi_measure_candidates_document_idx on public.gi_measure_candidates(source_document_id);
create index if not exists gi_measure_candidates_version_idx on public.gi_measure_candidates(source_version_id);

alter table public.gi_measure_candidates enable row level security;
revoke all on table public.gi_measure_candidates from public,anon,authenticated;
grant all on table public.gi_measure_candidates to service_role,postgres;

with seeds(candidate_code,title,measure_type,authority,level,summary,applicant_types,sectors,max_amount,source_url,marker,source_locator,confidence) as (values
  ('FED_AGROTOURISM_GRANT','Грант «Агротуризм»','grant','Минэкономразвития России','federal','Финансовая мера для проектов агротуризма. Условия, размер и допустимые заявители требуют подтверждения профильным нормативным актом.',array['ИП','КФХ','ООО']::text[],array['agriculture','agritourism','tourism']::text[],null::numeric,'https://xn--90aifddrld7a.xn--p1ai/support/','Грант «Агротуризм»','Портал «Мой бизнес», раздел «Поддержка бизнеса», список мер, актуализировано 19.02.2026',0.55),
  ('FED_BUSINESS_PARKS','Бизнес-парки: готовые площадки для роста производства','property','Минэкономразвития России','federal','Имущественная инфраструктурная поддержка производства. Конкретные площадки, тарифы и требования определяются региональным оператором.',array['ИП','ООО','МСП']::text[],array['industry','manufacturing','infrastructure']::text[],null::numeric,'https://xn--90aifddrld7a.xn--p1ai/support/','Бизнес-парки: готовые площадки для роста вашего производства','Портал «Мой бизнес», раздел «Поддержка бизнеса», список мер, актуализировано 19.02.2026',0.5),
  ('FED_BUSINESS_START_18M','Программа «Бизнес-старт»: гранты до 18 млн ₽ на инновации','grant','Минэкономразвития России','federal','Грантовая поддержка инновационных проектов. Критерии технологичности и отбора пока не подтверждены первичным положением.',array['ООО','МСП']::text[],array['innovation','technology','manufacturing']::text[],18000000::numeric,'https://xn--90aifddrld7a.xn--p1ai/support/','Программа «Бизнес-старт»: гранты до 18 млн ₽ на инновации','Портал «Мой бизнес», раздел «Поддержка бизнеса», список мер, актуализировано 19.02.2026',0.55),
  ('FED_SME_SECURITIES_SUPPORT','Поддержка МСП при размещении ценных бумаг','subsidy','Минэкономразвития России','federal','Инвестиционная поддержка субъектов МСП при выходе на рынок капитала. Состав компенсируемых расходов требует проверки положения.',array['МСП','АО','ООО']::text[],array['investment','capital_market']::text[],null::numeric,'https://xn--90aifddrld7a.xn--p1ai/support/','Поддержка МСП при размещении ценных бумаг','Портал «Мой бизнес», раздел «Поддержка бизнеса», список мер, актуализировано 19.02.2026',0.5),
  ('FED_SME_PREFERENTIAL_LEASING','Льготный лизинг для МСП','leasing','Минэкономразвития России','federal','Льготное приобретение оборудования субъектами МСП через лизинговые программы. Ставки и перечень оборудования требуют подтверждения оператором.',array['ИП','ООО','МСП']::text[],array['equipment','manufacturing','agriculture']::text[],null::numeric,'https://xn--90aifddrld7a.xn--p1ai/support/','Льготный лизинг для МСП','Портал «Мой бизнес», раздел «Поддержка бизнеса», список мер, актуализировано 19.02.2026',0.55),
  ('FED_SME_UMBRELLA_GUARANTEE','Зонтичные поручительства','guarantee','Минэкономразвития России / Корпорация МСП','federal','Гарантийная поддержка кредитования субъектов МСП. Лимиты поручительства и требования банка требуют подтверждения правилами оператора.',array['ИП','ООО','МСП']::text[],array['business','investment','working_capital']::text[],null::numeric,'https://xn--90aifddrld7a.xn--p1ai/support/','Зонтичные поручительства','Портал «Мой бизнес», раздел «Поддержка бизнеса», список мер, актуализировано 19.02.2026',0.55),
  ('FED_SME_INVESTMENT_LOANS','Инвестиционные кредиты для МСП','loan','Минэкономразвития России','federal','Инвестиционное кредитование малого и среднего бизнеса. Ставка, сроки и отраслевые приоритеты требуют подтверждения первичным документом.',array['ИП','ООО','МСП']::text[],array['business','investment','manufacturing']::text[],null::numeric,'https://xn--90aifddrld7a.xn--p1ai/support/','Инвестиционные кредиты для МСП','Портал «Мой бизнес», раздел «Поддержка бизнеса», список мер, актуализировано 19.02.2026',0.5),
  ('REGIONAL_GUARANTEE_ORGANISATIONS','Поручительства региональных гарантийных организаций','guarantee','Минэкономразвития России / региональные гарантийные организации','regional','Региональные поручительства для получения финансирования субъектами МСП. Условия зависят от региона и конкретной гарантийной организации.',array['ИП','ООО','МСП']::text[],array['business','investment']::text[],null::numeric,'https://xn--90aifddrld7a.xn--p1ai/support/','Поручительства Региональных гарантийных организаций','Портал «Мой бизнес», раздел «Поддержка бизнеса», список мер, актуализировано 19.02.2026',0.5),
  ('REGIONAL_SME_MICROLOANS','Льготные микрозаймы для малого и среднего бизнеса','loan','Минэкономразвития России / государственные микрофинансовые организации','regional','Региональные льготные микрозаймы для субъектов МСП. Сумма, ставка и сроки определяются региональным фондом.',array['ИП','ООО','МСП']::text[],array['business','working_capital','investment']::text[],null::numeric,'https://xn--90aifddrld7a.xn--p1ai/support/','Льготные микрозаймы для малого и среднего бизнеса','Портал «Мой бизнес», раздел «Поддержка бизнеса», список мер, актуализировано 19.02.2026',0.5),
  ('FED_DOMRF_HERITAGE_CREDIT','Льготное кредитование восстановления объектов культурного наследия','loan','ДОМ.РФ','federal','Льготное кредитование инвесторов и предпринимателей, восстанавливающих объекты культурного наследия в неудовлетворительном состоянии.',array['ИП','ООО','МСП','инвестор']::text[],array['tourism','hospitality','heritage','real_estate']::text[],null::numeric,'https://xn--d1aqf.xn--p1ai/media/news/polzovateli-platformy-msp-rf-budut-adresno-poluchat-informatsiyu-o-programme-lgotnogo-kreditovaniya-/','ДОМ.РФ — оператор программы льготного кредитования восстановления объектов культурного наследия (ОКН), находящихся в неудовлетворительном состоянии.','Новость ДОМ.РФ о программе льготного кредитования восстановления ОКН',0.65),
  ('FED_TOURISM_RF_LAND_LOTS','Земельные участки и инвестиционные лоты для туризма','land','Корпорация Туризм.РФ','federal','Федеральные земельные участки и инвестиционные лоты для реализации туристических проектов через цифровую платформу Туризм.РФ.',array['ИП','ООО','инвестор']::text[],array['tourism','hospitality','infrastructure','land']::text[],null::numeric,'https://xn--g1abnnjg.xn--p1ai/','Земельные участки для туризма','Главная страница Корпорации Туризм.РФ, блок инвестиционных лотов и федеральной земли',0.6),
  ('FED_SKOLKOVO_SECURITIES_MINIGRANT_10M','Минигранты Сколково до 10 млн ₽ на размещение ценных бумаг','grant','Фонд Сколково','federal','Минигрантовая поддержка технологических компаний при размещении ценных бумаг. Полные критерии требуют проверки страницы программы и конкурсной документации.',array['ООО','МТК','участник Сколково']::text[],array['innovation','technology','capital_market']::text[],10000000::numeric,'https://sk.ru/news/type/news/','Сколково предоставит минигранты до 10 млн рублей на размещение ценных бумаг','Новости Фонда Сколково, 15.07.2026',0.55)
), contexts as (
  select s.*,d.id source_document_id,d.evidence_tier,d.owner_validation_status,
         v.id source_version_id,v.extracted_text
  from seeds s
  join public.gi_source_documents d on d.canonical_url=s.source_url
  join lateral (
    select sv.* from public.gi_source_versions sv
    where sv.document_id=d.id
    order by sv.version_no desc,sv.checked_at desc limit 1
  ) v on true
)
insert into public.gi_measure_candidates(
  candidate_code,title,measure_type,authority,level,summary,official_url,
  applicant_types,sectors,max_amount,source_document_id,source_version_id,
  source_locator,evidence_quote,evidence_tier,owner_validation_status,
  candidate_status,confidence,metadata,updated_at
)
select candidate_code,title,measure_type,authority,level,summary,source_url,
       applicant_types,sectors,max_amount,source_document_id,source_version_id,
       source_locator,marker,evidence_tier,owner_validation_status,
       case when position(lower(marker) in lower(extracted_text))>0 then 'machine_match' else 'needs_review' end,
       confidence,
       jsonb_build_object(
         'source_text_match',position(lower(marker) in lower(extracted_text))>0,
         'promotion_rule','candidate_requires_human_review_and_verified_requirements',
         'epistemic_contract','candidate_is_not_eligibility'
       ),now()
from contexts
on conflict(candidate_code) do update set
  title=excluded.title,
  measure_type=excluded.measure_type,
  authority=excluded.authority,
  level=excluded.level,
  summary=excluded.summary,
  official_url=excluded.official_url,
  applicant_types=excluded.applicant_types,
  sectors=excluded.sectors,
  max_amount=excluded.max_amount,
  source_document_id=excluded.source_document_id,
  source_version_id=excluded.source_version_id,
  source_locator=excluded.source_locator,
  evidence_quote=excluded.evidence_quote,
  evidence_tier=excluded.evidence_tier,
  owner_validation_status=excluded.owner_validation_status,
  candidate_status=case when public.gi_measure_candidates.candidate_status in ('human_approved','promoted','rejected') then public.gi_measure_candidates.candidate_status else excluded.candidate_status end,
  confidence=excluded.confidence,
  metadata=public.gi_measure_candidates.metadata||excluded.metadata,
  updated_at=now();

create table if not exists public.gi_project_e2e_audits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gi_projects(id) on delete cascade,
  telegram_user_id bigint not null,
  project_check_id uuid references public.gi_project_checks(id) on delete set null,
  status text not null,
  gates jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  engine_version text not null default 'project-data-plane-e2e-v0.76',
  created_at timestamptz not null default now(),
  constraint gi_project_e2e_audits_status_check check(status in ('passed','failed'))
);

create index if not exists gi_project_e2e_audits_project_created_idx on public.gi_project_e2e_audits(project_id,created_at desc);
create index if not exists gi_project_e2e_audits_check_idx on public.gi_project_e2e_audits(project_check_id) where project_check_id is not null;

alter table public.gi_project_e2e_audits enable row level security;
revoke all on table public.gi_project_e2e_audits from public,anon,authenticated;
grant all on table public.gi_project_e2e_audits to service_role,postgres;

create or replace function public.gi_get_catalogue_control_summary()
returns jsonb
language sql
security definer
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'active_measures',(select count(*) from public.gi_support_measures),
    'candidate_measures',(select count(*) from public.gi_measure_candidates where candidate_status not in ('rejected','promoted')),
    'machine_candidates',(select count(*) from public.gi_measure_candidates where candidate_status='machine_match'),
    'needs_review_candidates',(select count(*) from public.gi_measure_candidates where candidate_status='needs_review'),
    'human_approved_candidates',(select count(*) from public.gi_measure_candidates where candidate_status='human_approved'),
    'promoted_candidates',(select count(*) from public.gi_measure_candidates where candidate_status='promoted'),
    'verified_evidence',(select count(*) from public.gi_evidence_records where verification_status='verified' and coalesce((metadata->>'human_reviewed')::boolean,false)=true),
    'verified_requirements',(select count(*) from public.gi_measure_requirements where evidence_status='verified'),
    'latest_e2e',(
      select jsonb_build_object('status',a.status,'created_at',a.created_at,'summary',a.summary)
      from public.gi_project_e2e_audits a order by a.created_at desc limit 1
    )
  );
$$;

create or replace function public.gi_list_measure_candidates(p_limit integer default 100)
returns jsonb
language sql
security definer
set search_path=public,pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.confidence desc,x.title),'[]'::jsonb)
  from (
    select id,candidate_code,title,measure_type,authority,level,region,summary,official_url,
           applicant_types,sectors,max_amount,source_locator,evidence_quote,evidence_tier,
           owner_validation_status,candidate_status,confidence,metadata,created_at,updated_at
    from public.gi_measure_candidates
    order by confidence desc,title
    limit greatest(1,least(coalesce(p_limit,100),200))
  ) x;
$$;

create or replace function public.gi_run_project_data_plane_e2e(
  p_project_id uuid,
  p_telegram_user_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_check public.gi_project_checks%rowtype;
  v_docs integer;
  v_parsed integer;
  v_chunks integer;
  v_candidates integer;
  v_confirmed integer;
  v_pending integer;
  v_facts integer;
  v_verified_facts integer;
  v_reports integer;
  v_decision_cards integer;
  v_measure_matches integer;
  v_metadata jsonb;
  v_gates jsonb;
  v_passed boolean;
  v_audit_id uuid;
begin
  if not exists(select 1 from public.gi_projects where id=p_project_id and telegram_user_id=p_telegram_user_id) then
    raise exception 'project_not_found';
  end if;

  select * into v_check
  from public.gi_project_checks
  where project_id=p_project_id and telegram_user_id=p_telegram_user_id
  order by started_at desc limit 1;

  select count(*),count(*) filter(where analysis_status='parsed')
  into v_docs,v_parsed
  from public.gi_project_documents
  where project_id=p_project_id and telegram_user_id=p_telegram_user_id;

  select count(*) into v_chunks from public.gi_project_document_chunks where project_id=p_project_id and telegram_user_id=p_telegram_user_id;
  select count(*),count(*) filter(where status='confirmed'),count(*) filter(where status='pending_confirmation')
  into v_candidates,v_confirmed,v_pending
  from public.gi_project_fact_candidates where project_id=p_project_id and telegram_user_id=p_telegram_user_id;
  select count(*),count(*) filter(where verification_status='verified')
  into v_facts,v_verified_facts
  from public.gi_project_facts where project_id=p_project_id and telegram_user_id=p_telegram_user_id;
  select count(*) into v_reports from public.gi_project_reports where project_id=p_project_id and telegram_user_id=p_telegram_user_id;
  select count(*) into v_decision_cards from public.gi_decision_cards where project_id=p_project_id and project_check_id=v_check.id;
  v_measure_matches:=jsonb_array_length(coalesce(v_check.result->'measure_matches','[]'::jsonb));
  v_metadata:=coalesce(v_check.result->'metadata','{}'::jsonb);

  v_gates:=jsonb_build_object(
    'project_owned',true,
    'documents_present',v_docs>0,
    'documents_all_parsed',v_docs>0 and v_docs=v_parsed,
    'chunks_present',v_chunks>0,
    'fact_candidates_present',v_candidates>0,
    'fact_candidates_resolved',v_candidates>0 and v_pending=0 and v_confirmed>0,
    'verified_project_facts_present',v_verified_facts>0,
    'latest_check_completed',v_check.id is not null and v_check.status='completed',
    'federal_checked',v_check.federal_status='checked',
    'regional_checked',v_check.regional_status='checked',
    'measure_matches_present',v_measure_matches>0,
    'truth_gate_recorded',coalesce(v_metadata->>'truth_gate_engine','')<>'',
    'report_persisted',v_reports>0,
    'decision_cards_persisted',v_decision_cards>0,
    'raw_json_not_required',true
  );

  select bool_and(value::boolean) into v_passed
  from jsonb_each_text(v_gates);

  insert into public.gi_project_e2e_audits(project_id,telegram_user_id,project_check_id,status,gates,summary)
  values(
    p_project_id,p_telegram_user_id,v_check.id,
    case when v_passed then 'passed' else 'failed' end,
    v_gates,
    jsonb_build_object(
      'documents_total',v_docs,'documents_parsed',v_parsed,'chunks',v_chunks,
      'fact_candidates',v_candidates,'confirmed_candidates',v_confirmed,'pending_candidates',v_pending,
      'facts_total',v_facts,'verified_facts',v_verified_facts,'reports',v_reports,
      'measure_matches',v_measure_matches,'decision_cards',v_decision_cards,
      'latest_check_id',v_check.id,'latest_check_status',v_check.status,
      'truth_gate_engine',v_metadata->>'truth_gate_engine',
      'eligibility_engine',v_metadata->>'eligibility_engine',
      'direction_engine',v_metadata->>'measure_direction_engine'
    )
  ) returning id into v_audit_id;

  return jsonb_build_object(
    'audit_id',v_audit_id,
    'status',case when v_passed then 'passed' else 'failed' end,
    'gates',v_gates,
    'summary',(select summary from public.gi_project_e2e_audits where id=v_audit_id)
  );
end;
$$;

revoke all on function public.gi_get_catalogue_control_summary() from public,anon,authenticated;
revoke all on function public.gi_list_measure_candidates(integer) from public,anon,authenticated;
revoke all on function public.gi_run_project_data_plane_e2e(uuid,bigint) from public,anon,authenticated;
grant execute on function public.gi_get_catalogue_control_summary() to service_role,postgres;
grant execute on function public.gi_list_measure_candidates(integer) to service_role,postgres;
grant execute on function public.gi_run_project_data_plane_e2e(uuid,bigint) to service_role,postgres;

commit;