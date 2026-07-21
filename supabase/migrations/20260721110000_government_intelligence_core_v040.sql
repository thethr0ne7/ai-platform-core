begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.gi_source_categories (
  code text primary key,
  name text not null,
  description text,
  default_priority integer not null default 100,
  default_cadence_minutes integer not null default 1440,
  created_at timestamptz not null default now()
);

create table if not exists public.gi_source_endpoints (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.gi_official_sources(id) on delete cascade,
  endpoint_type text not null check (endpoint_type in ('homepage','catalog','search','news','documents','subsidies','procurement','rss','sitemap','api','other')),
  url text not null,
  active boolean not null default true,
  priority integer not null default 100,
  discovery_method text not null default 'manual_seed',
  parser_hint text,
  metadata jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, url)
);

create table if not exists public.gi_crawl_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.gi_official_sources(id) on delete cascade,
  endpoint_id uuid references public.gi_source_endpoints(id) on delete set null,
  job_type text not null check (job_type in ('discover','fetch','extract','diff','classify','signal')),
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','dead_letter','blocked')),
  priority integer not null default 100,
  scheduled_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gi_change_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.gi_source_documents(id) on delete cascade,
  from_version_id uuid references public.gi_source_versions(id) on delete set null,
  to_version_id uuid not null references public.gi_source_versions(id) on delete cascade,
  change_type text not null check (change_type in ('created','updated','deadline_changed','amount_changed','eligibility_changed','status_changed','document_replaced','removed','other')),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  summary text,
  diff jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.gi_analytic_signals (
  id uuid primary key default gen_random_uuid(),
  signal_key text unique,
  signal_type text not null check (signal_type in ('support_opened','support_planned','support_closed','budget_growth','budget_reduction','priority_shift','regulatory_change','procurement_demand','land_opportunity','infrastructure_opportunity','risk','forecast','other')),
  title text not null,
  summary text,
  level text not null check (level in ('federal','regional','municipal')),
  region text,
  municipality text,
  sectors text[] not null default '{}',
  horizon_months integer,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  status text not null default 'active' check (status in ('active','watch','confirmed','rejected','expired')),
  first_detected_at timestamptz not null default now(),
  last_confirmed_at timestamptz,
  expires_at timestamptz,
  rationale jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gi_signal_evidence (
  signal_id uuid not null references public.gi_analytic_signals(id) on delete cascade,
  evidence_id uuid not null references public.gi_evidence_records(id) on delete cascade,
  weight numeric not null default 1 check (weight >= 0 and weight <= 1),
  relation text not null default 'supports' check (relation in ('supports','contradicts','context')),
  created_at timestamptz not null default now(),
  primary key (signal_id, evidence_id)
);

alter table public.gi_official_sources
  add column if not exists category_code text references public.gi_source_categories(code),
  add column if not exists source_class text not null default 'authority',
  add column if not exists priority integer not null default 100,
  add column if not exists cadence_minutes integer not null default 1440,
  add column if not exists robots_policy text not null default 'respect',
  add column if not exists ingestion_mode text not null default 'html',
  add column if not exists trust_tier integer not null default 1,
  add column if not exists coverage_scope text[] not null default '{}';

create index if not exists gi_source_endpoints_active_priority_idx on public.gi_source_endpoints(active, priority);
create index if not exists gi_crawl_jobs_status_schedule_idx on public.gi_crawl_jobs(status, scheduled_at, priority);
create index if not exists gi_change_events_detected_idx on public.gi_change_events(detected_at desc);
create index if not exists gi_analytic_signals_status_idx on public.gi_analytic_signals(status, level, region);
create index if not exists gi_analytic_signals_sectors_gin_idx on public.gi_analytic_signals using gin(sectors);

alter table public.gi_source_categories enable row level security;
alter table public.gi_source_endpoints enable row level security;
alter table public.gi_crawl_jobs enable row level security;
alter table public.gi_change_events enable row level security;
alter table public.gi_analytic_signals enable row level security;
alter table public.gi_signal_evidence enable row level security;

revoke all on public.gi_source_categories, public.gi_source_endpoints, public.gi_crawl_jobs, public.gi_change_events, public.gi_analytic_signals, public.gi_signal_evidence from anon, authenticated;
grant all on public.gi_source_categories, public.gi_source_endpoints, public.gi_crawl_jobs, public.gi_change_events, public.gi_analytic_signals, public.gi_signal_evidence to service_role;

insert into public.gi_source_categories(code,name,description,default_priority,default_cadence_minutes) values
('law','Право и нормативные акты','Законы, указы, постановления, проекты НПА',10,360),
('support','Меры поддержки','Субсидии, гранты, льготы, гарантии и кредиты',10,360),
('agriculture','Сельское хозяйство','АПК, КФХ, агротуризм, техника, мелиорация',15,720),
('industry','Промышленность','ФРП, ГИСП, промышленная ипотека и производство',15,720),
('sme','МСП','Поддержка малого и среднего бизнеса',20,720),
('tourism','Туризм','Туристическая инфраструктура и инвестиционные проекты',25,720),
('export','Экспорт','РЭЦ, Мой экспорт, страхование и экспортное кредитование',30,1440),
('procurement','Закупки','44-ФЗ, 223-ФЗ, планы и закупочный спрос',20,360),
('land','Земля и имущество','Торги, Росимущество, Росреестр, земельные возможности',20,720),
('budget','Бюджет и госпрограммы','Бюджеты, госпрограммы, лимиты и финансирование',15,720),
('innovation','Инновации','ФСИ, Сколково, технологические компании',30,1440),
('development','Институты развития','ВЭБ.РФ, ДОМ.РФ, инфраструктурные фонды',35,1440)
on conflict (code) do update set name=excluded.name, description=excluded.description, default_priority=excluded.default_priority, default_cadence_minutes=excluded.default_cadence_minutes;

insert into public.gi_official_sources(source_key,name,authority,level,base_url,active,discovery_methods,status,metadata,category_code,source_class,priority,cadence_minutes,ingestion_mode,trust_tier,coverage_scope) values
('budget-support','Портал предоставления мер финансовой государственной поддержки','Минфин России','federal','https://promote.budget.gov.ru/',true,array['catalog','search'],'pending','{}','support','platform',5,360,'html',1,array['subsidy','grant','selection']),
('msp-platform','Цифровая платформа МСП.РФ','Корпорация МСП','federal','https://мсп.рф/',true,array['catalog','search'],'pending','{}','sme','platform',10,720,'html',1,array['sme','loan','guarantee']),
('my-business','Портал Мой бизнес','Минэкономразвития России','federal','https://мойбизнес.рф/',true,array['catalog','regional-directory'],'pending','{}','sme','platform',15,720,'html',1,array['regional-support','services']),
('economy-russia','Минэкономразвития России','Минэкономразвития России','federal','https://economy.gov.ru/',true,array['news','documents'],'pending','{}','budget','authority',15,720,'html',1,array['sme','tourism','investment']),
('finance-russia','Минфин России','Минфин России','federal','https://minfin.gov.ru/',true,array['documents','news'],'pending','{}','budget','authority',15,720,'html',1,array['budget','subsidies']),
('industry-russia','Минпромторг России','Минпромторг России','federal','https://minpromtorg.gov.ru/',true,array['documents','support'],'pending','{}','industry','authority',10,720,'html',1,array['industry','subsidies','industrial-mortgage']),
('gisp','Государственная информационная система промышленности','Минпромторг России','federal','https://gisp.gov.ru/',true,array['catalog','support'],'pending','{}','industry','platform',10,720,'html',1,array['industry','support']),
('frp-russia','Фонд развития промышленности','ФРП','federal','https://frprf.ru/',true,array['programs','news'],'pending','{}','industry','development-institution',10,720,'html',1,array['loan','leasing','industry']),
('fsi-russia','Фонд содействия инновациям','Фонд содействия инновациям','federal','https://fasie.ru/',true,array['competitions','programs'],'pending','{}','innovation','development-institution',20,720,'html',1,array['grant','innovation']),
('skolkovo','Фонд Сколково','Фонд Сколково','federal','https://sk.ru/',true,array['support','news'],'pending','{}','innovation','development-institution',30,1440,'html',1,array['innovation','tax','grant']),
('rec-russia','Российский экспортный центр','РЭЦ','federal','https://www.exportcenter.ru/',true,array['support','news'],'pending','{}','export','development-institution',20,720,'html',1,array['export','subsidy','certification']),
('my-export','Платформа Мой экспорт','РЭЦ','federal','https://myexport.exportcenter.ru/',true,array['catalog','services'],'pending','{}','export','platform',20,720,'html',1,array['export-services']),
('veb-rf','ВЭБ.РФ','ВЭБ.РФ','federal','https://вэб.рф/',true,array['projects','news'],'pending','{}','development','development-institution',30,1440,'html',1,array['investment','infrastructure']),
('dom-rf','ДОМ.РФ','ДОМ.РФ','federal','https://дом.рф/',true,array['programs','news'],'pending','{}','development','development-institution',35,1440,'html',1,array['infrastructure','housing','land']),
('tourism-rf','Корпорация Туризм.РФ','Туризм.РФ','federal','https://туризм.рф/',true,array['projects','support'],'pending','{}','tourism','development-institution',20,720,'html',1,array['tourism','investment']),
('zakupki-gov','Единая информационная система в сфере закупок','Казначейство России','federal','https://zakupki.gov.ru/',true,array['search','api'],'pending','{}','procurement','platform',5,360,'html',1,array['44-fz','223-fz','procurement']),
('regulation-gov','Федеральный портал проектов нормативных правовых актов','Правительство России','federal','https://regulation.gov.ru/',true,array['search','documents'],'pending','{}','law','platform',5,360,'html',1,array['draft-law','regulation']),
('duma-russia','Государственная Дума','Государственная Дума','federal','https://duma.gov.ru/',true,array['legislation','news'],'pending','{}','law','authority',15,720,'html',1,array['bills','law']),
('council-russia','Совет Федерации','Совет Федерации','federal','http://council.gov.ru/',true,array['legislation','news'],'pending','{}','law','authority',20,720,'html',1,array['law','policy']),
('nalog-russia','Федеральная налоговая служба','ФНС России','federal','https://www.nalog.gov.ru/',true,array['documents','services'],'pending','{}','sme','authority',20,720,'html',1,array['tax','benefits']),
('rosim-russia','Росимущество','Росимущество','federal','https://rosim.gov.ru/',true,array['auctions','documents'],'pending','{}','land','authority',20,720,'html',1,array['property','auctions']),
('rosreestr-russia','Росреестр','Росреестр','federal','https://rosreestr.gov.ru/',true,array['services','documents'],'pending','{}','land','authority',25,1440,'html',1,array['land','cadastre']),
('torgi-gov','ГИС Торги','Федеральное казначейство','federal','https://torgi.gov.ru/',true,array['search','api'],'pending','{}','land','platform',10,360,'html',1,array['land-auctions','property']),
('rshb-russia','Россельхозбанк','Россельхозбанк','federal','https://www.rshb.ru/',true,array['programs','news'],'pending','{}','agriculture','bank',25,1440,'html',1,array['agriculture','loan']),
('agro-ministry-kbr','Министерство сельского хозяйства КБР','Минсельхоз КБР','regional','https://mcx.kbr.ru/',true,array['news','documents','support'],'pending','{"region_code":"07"}','agriculture','authority',5,360,'html',1,array['kbr','agriculture','grant']),
('government-kbr','Правительство Кабардино-Балкарской Республики','Правительство КБР','regional','https://pravitelstvo.kbr.ru/',true,array['news','documents'],'pending','{"region_code":"07"}','law','authority',5,360,'html',1,array['kbr','policy','support']),
('economy-kbr','Министерство экономического развития КБР','Минэкономразвития КБР','regional','https://economy.kbr.ru/',true,array['news','support'],'pending','{"region_code":"07"}','sme','authority',5,360,'html',1,array['kbr','sme','tourism']),
('mybusiness-kbr','Центр Мой бизнес КБР','Мой бизнес КБР','regional','https://мойбизнес07.рф/',true,array['support','news'],'pending','{"region_code":"07"}','sme','support-operator',5,360,'html',1,array['kbr','sme','loan']),
('frp-kbr','Фонд развития промышленности КБР','ФРП КБР','regional','https://frp-kbr.ru/',true,array['programs','news'],'pending','{"region_code":"07"}','industry','development-institution',5,360,'html',1,array['kbr','industry','loan'])
on conflict (source_key) do update set
  name=excluded.name,
  authority=excluded.authority,
  level=excluded.level,
  base_url=excluded.base_url,
  active=excluded.active,
  discovery_methods=excluded.discovery_methods,
  category_code=excluded.category_code,
  source_class=excluded.source_class,
  priority=excluded.priority,
  cadence_minutes=excluded.cadence_minutes,
  ingestion_mode=excluded.ingestion_mode,
  trust_tier=excluded.trust_tier,
  coverage_scope=excluded.coverage_scope,
  updated_at=now();

insert into public.gi_source_endpoints(source_id,endpoint_type,url,priority,discovery_method)
select id,'homepage',base_url,priority,'official_registry_v040'
from public.gi_official_sources
where active=true
on conflict (source_id,url) do update set active=true, priority=excluded.priority, updated_at=now();

insert into public.gi_crawl_jobs(source_id,endpoint_id,job_type,status,priority,scheduled_at,payload)
select s.id,e.id,'discover','pending',s.priority,now(),jsonb_build_object('seed','v0.40','max_depth',1,'max_items',20)
from public.gi_official_sources s
join public.gi_source_endpoints e on e.source_id=s.id and e.endpoint_type='homepage'
where s.active=true
  and not exists (
    select 1 from public.gi_crawl_jobs j
    where j.source_id=s.id and j.endpoint_id=e.id and j.job_type='discover' and j.status in ('pending','running')
  );

commit;
