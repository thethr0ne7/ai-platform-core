begin;

create table if not exists public.platform_ingestion_jobs (
  id text primary key,
  idempotency_key text not null unique,
  source_id text not null,
  product_id text not null,
  requirement_id text not null,
  entity_type text not null,
  scheduled_for timestamptz not null,
  status text not null check (status in ('pending','running','succeeded','failed','dead-letter')),
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null check (max_attempts >= 1),
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_data_versions (
  id bigint generated always as identity primary key,
  namespace text not null,
  record_id text not null,
  subject text not null,
  content_hash text not null,
  content jsonb not null,
  evidence jsonb not null default '[]'::jsonb,
  source_url text not null,
  source_version integer not null check (source_version >= 1),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  inserted_at timestamptz not null default now(),
  unique (namespace, record_id, content_hash)
);

create table if not exists public.platform_evidence_records (
  evidence_id text primary key,
  namespace text not null,
  record_id text not null,
  source_type text not null,
  source_ref text not null,
  quote text,
  status text not null check (status in ('verified','unverified','inferred','rejected')),
  captured_at timestamptz not null,
  metadata jsonb,
  inserted_at timestamptz not null default now()
);

create table if not exists public.platform_source_checkpoints (
  source_id text primary key,
  last_checked_at timestamptz not null,
  last_successful_at timestamptz,
  content_hash text,
  last_job_id text,
  status text not null check (status in ('active','degraded','blocked','retired','needs-review')),
  metadata jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists platform_ingestion_jobs_source_status_idx
  on public.platform_ingestion_jobs (source_id, status, scheduled_for desc);
create index if not exists platform_data_versions_namespace_subject_idx
  on public.platform_data_versions (namespace, subject);

create or replace function public.claim_platform_ingestion_job(
  p_id text,
  p_idempotency_key text,
  p_source_id text,
  p_product_id text,
  p_requirement_id text,
  p_entity_type text,
  p_scheduled_for timestamptz,
  p_max_attempts integer
)
returns table (claimed boolean, job_status text)
language plpgsql
security definer
set search_path = public
as $$
declare inserted_count integer;
begin
  insert into public.platform_ingestion_jobs (
    id, idempotency_key, source_id, product_id, requirement_id,
    entity_type, scheduled_for, status, attempt, max_attempts,
    started_at, created_at, updated_at
  ) values (
    p_id, p_idempotency_key, p_source_id, p_product_id, p_requirement_id,
    p_entity_type, p_scheduled_for, 'running', 1, p_max_attempts,
    now(), now(), now()
  ) on conflict (idempotency_key) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then
    return query select true, 'running'::text;
  end if;
  return query select false, j.status
    from public.platform_ingestion_jobs j
    where j.idempotency_key = p_idempotency_key;
end;
$$;

revoke all on function public.claim_platform_ingestion_job(text,text,text,text,text,text,timestamptz,integer) from public;
grant execute on function public.claim_platform_ingestion_job(text,text,text,text,text,text,timestamptz,integer) to service_role;

alter table public.platform_ingestion_jobs enable row level security;
alter table public.platform_data_versions enable row level security;
alter table public.platform_evidence_records enable row level security;
alter table public.platform_source_checkpoints enable row level security;

commit;
