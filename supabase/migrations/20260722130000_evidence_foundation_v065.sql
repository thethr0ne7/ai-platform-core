begin;

create table if not exists public.gi_evidence_verification_queue (
  id uuid primary key default gen_random_uuid(),
  measure_id uuid not null references public.gi_support_measures(id) on delete cascade,
  requirement_id uuid references public.gi_measure_requirements(id) on delete cascade,
  source_document_id uuid references public.gi_source_documents(id) on delete set null,
  task_code text not null,
  task_type text not null,
  title text not null,
  target_url text,
  expected_document text,
  status text not null default 'pending',
  priority integer not null default 100,
  result jsonb not null default '{}'::jsonb,
  notes text,
  assigned_to text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(measure_id,task_code),
  constraint gi_evidence_verification_queue_status_check
    check(status in ('pending','in_progress','verified','rejected','blocked')),
  constraint gi_evidence_verification_queue_type_check
    check(task_type in ('source_link','edition_check','quote_locator','requirement_check','conflict_check'))
);

create index if not exists gi_evidence_verification_queue_work_idx
  on public.gi_evidence_verification_queue(status,priority,created_at);

alter table public.gi_evidence_verification_queue enable row level security;
revoke all on table public.gi_evidence_verification_queue from anon,authenticated;
grant all on table public.gi_evidence_verification_queue to service_role,postgres;

create or replace function public.gi_enforce_evidence_verification_gate()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_version_id uuid;
  v_tier text;
  v_owner_status text;
begin
  if coalesce(new.verification_status,'unverified')='verified'
     or coalesce(new.status,'unverified')='verified' then
    if length(btrim(coalesce(new.quote,'')))<20 then
      raise exception 'verified_evidence_requires_exact_quote';
    end if;
    if length(btrim(coalesce(new.source_locator,new.locator,'')))<3 then
      raise exception 'verified_evidence_requires_locator';
    end if;
    if length(btrim(coalesce(new.metadata->>'verified_by','')))<2 then
      raise exception 'verified_evidence_requires_verifier';
    end if;

    v_version_id:=coalesce(new.source_version_id,new.version_id);
    if v_version_id is null then
      raise exception 'verified_evidence_requires_source_version';
    end if;

    select d.evidence_tier,d.owner_validation_status
      into v_tier,v_owner_status
    from public.gi_source_versions v
    join public.gi_source_documents d on d.id=v.document_id
    where v.id=v_version_id;

    if not found then raise exception 'verified_evidence_source_version_not_found'; end if;
    if v_tier<>'A' then raise exception 'verified_evidence_requires_tier_a_source'; end if;
    if v_owner_status<>'verified' then raise exception 'verified_evidence_requires_verified_owner'; end if;

    new.verification_status:='verified';
    new.status:='verified';
    new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'verified_at',coalesce(new.metadata->>'verified_at',now()::text),
      'verification_gate','tier-a-v0.65'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists gi_evidence_verification_gate on public.gi_evidence_records;
create trigger gi_evidence_verification_gate
before insert or update of verification_status,status,quote,source_locator,locator,source_version_id,version_id,metadata
on public.gi_evidence_records
for each row execute function public.gi_enforce_evidence_verification_gate();

create or replace function public.gi_enforce_requirement_verification_gate()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_evidence_id uuid;
  v_ok boolean:=false;
begin
  if new.evidence_status='verified' then
    begin
      v_evidence_id:=nullif(new.metadata->>'evidence_record_id','')::uuid;
    exception when others then
      v_evidence_id:=null;
    end;
    if v_evidence_id is null then raise exception 'verified_requirement_requires_evidence_record'; end if;
    select exists(
      select 1 from public.gi_evidence_records er
      where er.id=v_evidence_id
        and er.verification_status='verified'
        and er.status='verified'
        and (
          (er.subject_type='measure_requirement' and er.subject_id=new.id)
          or (er.subject_type='support_measure' and er.subject_id=new.measure_id)
        )
    ) into v_ok;
    if not v_ok then raise exception 'verified_requirement_evidence_not_valid'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists gi_requirement_verification_gate on public.gi_measure_requirements;
create trigger gi_requirement_verification_gate
before insert or update of evidence_status,metadata
on public.gi_measure_requirements
for each row execute function public.gi_enforce_requirement_verification_gate();

with source as (
  select id,source_key from public.gi_official_sources where source_key='pravo-publication'
)
insert into public.gi_source_documents(
  source_id,canonical_url,title,document_number,document_date,published_at,authority,
  content_type,current_version,status,metadata,source_key,last_checked_at,normalized_url,
  evidence_tier,owner_validation_status
)
select source.id,
  'https://publication.pravo.gov.ru/document/0001202504300025',
  'Приказ Минсельхоза России от 25.03.2025 № 187','187',date '2025-03-25',
  timestamptz '2025-04-30 00:00:00+03','Министерство сельского хозяйства Российской Федерации',
  'legal_act',0,'discovered',jsonb_build_object(
    'publication_number','0001202504300025','registration_number','82027',
    'publication_date','2025-04-30','verification_state','awaiting_exact_text_extraction'
  ),source.source_key,now(),
  public.gi_normalize_source_url('https://publication.pravo.gov.ru/document/0001202504300025'),
  'A','verified'
from source
on conflict(canonical_url) do update set
  title=excluded.title,document_number=excluded.document_number,document_date=excluded.document_date,
  published_at=excluded.published_at,authority=excluded.authority,metadata=excluded.metadata,
  source_id=excluded.source_id,source_key=excluded.source_key,normalized_url=excluded.normalized_url,
  evidence_tier='A',owner_validation_status='verified',last_checked_at=now();

with source as (
  select id,source_key from public.gi_official_sources where source_key='pravo-publication'
)
insert into public.gi_source_documents(
  source_id,canonical_url,title,document_number,document_date,published_at,authority,
  content_type,current_version,status,metadata,source_key,last_checked_at,normalized_url,
  evidence_tier,owner_validation_status
)
select source.id,
  'https://publication.pravo.gov.ru/document/0001202510220015',
  'Приказ Минсельхоза России от 17.09.2025 № 592','592',date '2025-09-17',
  timestamptz '2025-10-22 00:00:00+03','Министерство сельского хозяйства Российской Федерации',
  'legal_act',0,'discovered',jsonb_build_object(
    'publication_number','0001202510220015','registration_number','83898',
    'publication_date','2025-10-22','amends_document_number','187',
    'verification_state','awaiting_exact_text_extraction'
  ),source.source_key,now(),
  public.gi_normalize_source_url('https://publication.pravo.gov.ru/document/0001202510220015'),
  'A','verified'
from source
on conflict(canonical_url) do update set
  title=excluded.title,document_number=excluded.document_number,document_date=excluded.document_date,
  published_at=excluded.published_at,authority=excluded.authority,metadata=excluded.metadata,
  source_id=excluded.source_id,source_key=excluded.source_key,normalized_url=excluded.normalized_url,
  evidence_tier='A',owner_validation_status='verified',last_checked_at=now();

with source as (
  select id,source_key from public.gi_official_sources where source_key='government-russia'
)
insert into public.gi_source_documents(
  source_id,canonical_url,title,document_number,document_date,published_at,authority,
  content_type,current_version,status,metadata,source_key,last_checked_at,normalized_url,
  evidence_tier,owner_validation_status
)
select source.id,'https://government.ru/rugovclassifier/878/',
  'Государственная программа «Комплексное развитие сельских территорий»','696',date '2019-05-31',null,
  'Правительство Российской Федерации','program_page',0,'discovered',jsonb_build_object(
    'base_resolution','Постановление Правительства РФ от 31.05.2019 № 696',
    'source_role','current_program_description','verification_state','tier_b_not_legal_evidence'
  ),source.source_key,now(),public.gi_normalize_source_url('https://government.ru/rugovclassifier/878/'),
  'B','verified'
from source
on conflict(canonical_url) do update set
  title=excluded.title,document_number=excluded.document_number,document_date=excluded.document_date,
  authority=excluded.authority,metadata=excluded.metadata,source_id=excluded.source_id,
  source_key=excluded.source_key,normalized_url=excluded.normalized_url,evidence_tier='B',
  owner_validation_status='verified',last_checked_at=now();

with source as (
  select id,source_key from public.gi_official_sources where source_key='government-russia'
)
insert into public.gi_source_documents(
  source_id,canonical_url,title,document_number,document_date,published_at,authority,
  content_type,current_version,status,metadata,source_key,last_checked_at,normalized_url,
  evidence_tier,owner_validation_status
)
select source.id,'https://government.ru/docs/all/162159/',
  'Постановление Правительства Российской Федерации от 25.11.2025 № 1876','1876',date '2025-11-25',null,
  'Правительство Российской Федерации','legal_act',0,'discovered',jsonb_build_object(
    'amends_document_number','696','source_role','official_government_copy',
    'verification_state','tier_b_requires_tier_a_publication'
  ),source.source_key,now(),public.gi_normalize_source_url('https://government.ru/docs/all/162159/'),
  'B','verified'
from source
on conflict(canonical_url) do update set
  title=excluded.title,document_number=excluded.document_number,document_date=excluded.document_date,
  authority=excluded.authority,metadata=excluded.metadata,source_id=excluded.source_id,
  source_key=excluded.source_key,normalized_url=excluded.normalized_url,evidence_tier='B',
  owner_validation_status='verified',last_checked_at=now();

update public.gi_support_measures m
set official_url='https://publication.pravo.gov.ru/document/0001202504300025',
    source_document_id=d.id,
    source_locator='Приказ Минсельхоза России от 25.03.2025 № 187; официальное опубликование № 0001202504300025 от 30.04.2025',
    evidence_quote=null,checked_at=now(),confidence=0.75,
    metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object(
      'evidence_status','manual_review','legal_basis_corrected_at',now(),
      'previous_locator_rejected','Приказ Минсельхоза России от 26.03.2026 № 179',
      'current_base_document','Приказ Минсельхоза России от 25.03.2025 № 187',
      'known_amendment','Приказ Минсельхоза России от 17.09.2025 № 592','exact_quotes_required',true
    )
from public.gi_source_documents d
where m.code='FED_APK_CONCESSIONAL_CREDIT_2026'
  and d.canonical_url='https://publication.pravo.gov.ru/document/0001202504300025';

update public.gi_support_measures m
set official_url='https://government.ru/rugovclassifier/878/',source_document_id=null,
    source_locator='Постановление Правительства РФ от 31.05.2019 № 696; действующая редакция с изменениями, включая постановление от 25.11.2025 № 1876',
    evidence_quote=null,checked_at=now(),confidence=0.70,
    metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object(
      'evidence_status','unverified','current_program_page','https://government.ru/rugovclassifier/878/',
      'known_amendment','Постановление Правительства РФ от 25.11.2025 № 1876',
      'direct_business_grant',false,'requires_tier_a_publication',true,'exact_quotes_required',true
    )
where m.code='FED_RURAL_TERRITORIES_INFRASTRUCTURE';

update public.gi_measure_requirements r
set source_locator=m.source_locator,evidence_quote=null,
    evidence_status=case when m.source_document_id is null then 'unverified' else 'manual_review' end,
    metadata=coalesce(r.metadata,'{}'::jsonb)||jsonb_build_object(
      'evidence_record_id',null,'verification_state','queued','source_document_id',m.source_document_id
    ),updated_at=now()
from public.gi_support_measures m
where r.measure_id=m.id
  and m.code in ('FED_APK_CONCESSIONAL_CREDIT_2026','FED_RURAL_TERRITORIES_INFRASTRUCTURE');

insert into public.gi_evidence_verification_queue(
  measure_id,requirement_id,source_document_id,task_code,task_type,title,target_url,
  expected_document,status,priority,notes
)
select m.id,null,d.id,'apk_187_extract','source_link','Извлечь официальную редакцию приказа № 187',
  d.canonical_url,'Приказ Минсельхоза России от 25.03.2025 № 187','pending',10,
  'Сохранить версию документа и полный текст. Не подтверждать требования без точной цитаты.'
from public.gi_support_measures m
join public.gi_source_documents d on d.canonical_url='https://publication.pravo.gov.ru/document/0001202504300025'
where m.code='FED_APK_CONCESSIONAL_CREDIT_2026'
on conflict(measure_id,task_code) do update set source_document_id=excluded.source_document_id,target_url=excluded.target_url,status='pending',updated_at=now();

insert into public.gi_evidence_verification_queue(
  measure_id,requirement_id,source_document_id,task_code,task_type,title,target_url,
  expected_document,status,priority,notes
)
select m.id,r.id,m.source_document_id,'apk_'||r.requirement_code||'_quote','quote_locator',
  'Подтвердить требование: '||r.description,m.official_url,m.source_locator,'pending',20,
  'Нужны точная цитата, пункт/страница и проверка актуальной редакции.'
from public.gi_support_measures m
join public.gi_measure_requirements r on r.measure_id=m.id and r.active=true
where m.code='FED_APK_CONCESSIONAL_CREDIT_2026'
on conflict(measure_id,task_code) do update set requirement_id=excluded.requirement_id,source_document_id=excluded.source_document_id,status='pending',updated_at=now();

insert into public.gi_evidence_verification_queue(
  measure_id,requirement_id,source_document_id,task_code,task_type,title,target_url,
  expected_document,status,priority,notes
)
select m.id,null,d.id,'apk_592_amendment','edition_check','Проверить изменения приказом № 592',
  d.canonical_url,'Приказ Минсельхоза России от 17.09.2025 № 592','pending',15,
  'Сопоставить изменения с базовым приказом № 187 до публикации условий меры.'
from public.gi_support_measures m
join public.gi_source_documents d on d.canonical_url='https://publication.pravo.gov.ru/document/0001202510220015'
where m.code='FED_APK_CONCESSIONAL_CREDIT_2026'
on conflict(measure_id,task_code) do update set source_document_id=excluded.source_document_id,target_url=excluded.target_url,status='pending',updated_at=now();

insert into public.gi_evidence_verification_queue(
  measure_id,requirement_id,source_document_id,task_code,task_type,title,target_url,
  expected_document,status,priority,notes
)
select m.id,null,d.id,'rural_696_tier_a','source_link',
  'Найти публикацию Tier A для постановления № 696 и действующей редакции',d.canonical_url,
  'Постановление Правительства РФ от 31.05.2019 № 696 с актуальными изменениями','pending',10,
  'Страница Правительства — Tier B. Для eligibility требуется официальный опубликованный правовой акт Tier A.'
from public.gi_support_measures m
join public.gi_source_documents d on d.canonical_url='https://government.ru/rugovclassifier/878/'
where m.code='FED_RURAL_TERRITORIES_INFRASTRUCTURE'
on conflict(measure_id,task_code) do update set source_document_id=excluded.source_document_id,target_url=excluded.target_url,status='pending',updated_at=now();

insert into public.gi_evidence_verification_queue(
  measure_id,requirement_id,source_document_id,task_code,task_type,title,target_url,
  expected_document,status,priority,notes
)
select m.id,null,d.id,'rural_1876_edition','edition_check','Проверить изменения постановлением № 1876',
  d.canonical_url,'Постановление Правительства РФ от 25.11.2025 № 1876','pending',15,
  'Зафиксировать изменения, влияющие на заявителей, инфраструктурные проекты и региональный отбор.'
from public.gi_support_measures m
join public.gi_source_documents d on d.canonical_url='https://government.ru/docs/all/162159/'
where m.code='FED_RURAL_TERRITORIES_INFRASTRUCTURE'
on conflict(measure_id,task_code) do update set source_document_id=excluded.source_document_id,target_url=excluded.target_url,status='pending',updated_at=now();

insert into public.gi_evidence_verification_queue(
  measure_id,requirement_id,source_document_id,task_code,task_type,title,target_url,
  expected_document,status,priority,notes
)
select m.id,r.id,null,'rural_'||r.requirement_code||'_quote','quote_locator',
  'Подтвердить требование: '||r.description,m.official_url,m.source_locator,'pending',25,
  'Не трактовать программу как прямой универсальный грант бизнесу. Нужны точная норма и маршрут через регион/муниципалитет.'
from public.gi_support_measures m
join public.gi_measure_requirements r on r.measure_id=m.id and r.active=true
where m.code='FED_RURAL_TERRITORIES_INFRASTRUCTURE'
on conflict(measure_id,task_code) do update set requirement_id=excluded.requirement_id,status='pending',updated_at=now();

revoke all on function public.gi_enforce_evidence_verification_gate() from public,anon,authenticated;
revoke all on function public.gi_enforce_requirement_verification_gate() from public,anon,authenticated;
grant execute on function public.gi_enforce_evidence_verification_gate() to service_role,postgres;
grant execute on function public.gi_enforce_requirement_verification_gate() to service_role,postgres;

commit;
