begin;

alter table public.gi_project_documents
  add column if not exists content_hash text,
  add column if not exists text_hash text,
  add column if not exists parser_name text,
  add column if not exists parser_version text,
  add column if not exists page_count integer,
  add column if not exists char_count integer,
  add column if not exists chunk_count integer not null default 0,
  add column if not exists fact_candidates_count integer not null default 0,
  add column if not exists analysis_attempts integer not null default 0,
  add column if not exists analysis_started_at timestamptz,
  add column if not exists analysis_finished_at timestamptz,
  add column if not exists analysis_error text,
  add column if not exists duplicate_of uuid references public.gi_project_documents(id) on delete set null;

alter table public.gi_project_documents
  drop constraint if exists gi_project_documents_analysis_status_check;
alter table public.gi_project_documents
  add constraint gi_project_documents_analysis_status_check
  check (analysis_status in ('uploaded','queued','processing','parsed','needs_ocr','unsupported','failed'));

create index if not exists gi_project_documents_processing_v061_idx
  on public.gi_project_documents(analysis_status,created_at)
  where analysis_status in ('uploaded','queued','failed');
create index if not exists gi_project_documents_content_hash_v061_idx
  on public.gi_project_documents(project_id,content_hash)
  where content_hash is not null;

create table if not exists public.gi_project_document_chunks(
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.gi_project_documents(id) on delete cascade,
  project_id uuid not null references public.gi_projects(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  telegram_user_id bigint references public.gi_telegram_profiles(telegram_user_id) on delete cascade,
  ordinal integer not null,
  page_number integer,
  locator text not null,
  content text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  constraint gi_project_document_chunks_identity_check check (owner_id is not null or telegram_user_id is not null),
  constraint gi_project_document_chunks_ordinal_check check (ordinal>=0),
  unique(document_id,ordinal)
);

create index if not exists gi_project_document_chunks_project_v061_idx
  on public.gi_project_document_chunks(project_id,document_id,ordinal);
alter table public.gi_project_document_chunks enable row level security;
revoke all on table public.gi_project_document_chunks from anon,authenticated;

create table if not exists public.gi_project_fact_candidates(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.gi_projects(id) on delete cascade,
  document_id uuid not null references public.gi_project_documents(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  telegram_user_id bigint references public.gi_telegram_profiles(telegram_user_id) on delete cascade,
  fact_code text not null,
  fact_label text not null,
  fact_type text not null default 'text',
  value jsonb not null,
  quote text not null,
  locator text not null,
  confidence numeric not null default 0 check(confidence>=0 and confidence<=1),
  status text not null default 'pending_confirmation' check(status in ('pending_confirmation','confirmed','rejected')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gi_project_fact_candidates_identity_check check (owner_id is not null or telegram_user_id is not null)
);

create index if not exists gi_project_fact_candidates_review_v061_idx
  on public.gi_project_fact_candidates(project_id,status,created_at);
alter table public.gi_project_fact_candidates enable row level security;
revoke all on table public.gi_project_fact_candidates from anon,authenticated;

create or replace function public.gi_enqueue_project_document(p_document_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  update public.gi_project_documents
  set analysis_status='queued',analysis_error=null,updated_at=now()
  where id=p_document_id and analysis_status in ('uploaded','failed','unsupported','needs_ocr');
  return found;
end;
$$;

create or replace function public.gi_claim_project_document(p_document_id uuid)
returns public.gi_project_documents
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_document public.gi_project_documents;
begin
  update public.gi_project_documents
  set analysis_status='processing',
      analysis_attempts=analysis_attempts+1,
      analysis_started_at=now(),
      analysis_finished_at=null,
      analysis_error=null,
      updated_at=now()
  where id=p_document_id
    and analysis_status in ('uploaded','queued','failed')
  returning * into v_document;
  return v_document;
end;
$$;

revoke all on function public.gi_enqueue_project_document(uuid) from public,anon,authenticated;
revoke all on function public.gi_claim_project_document(uuid) from public,anon,authenticated;
grant execute on function public.gi_enqueue_project_document(uuid) to service_role,postgres;
grant execute on function public.gi_claim_project_document(uuid) to service_role,postgres;

update public.gi_project_documents
set analysis_status='queued',updated_at=now()
where analysis_status='uploaded';

commit;
