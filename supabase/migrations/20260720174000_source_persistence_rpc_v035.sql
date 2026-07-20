begin;

create table if not exists public.gi_source_documents (
  id uuid primary key default gen_random_uuid()
);

alter table public.gi_source_documents
  add column if not exists source_key text,
  add column if not exists canonical_url text,
  add column if not exists title text,
  add column if not exists authority text,
  add column if not exists document_number text,
  add column if not exists published_at date,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists last_checked_at timestamptz;

create unique index if not exists gi_source_documents_canonical_url_v035_uq
  on public.gi_source_documents (canonical_url)
  where canonical_url is not null;

create table if not exists public.gi_source_versions (
  id uuid primary key default gen_random_uuid()
);

alter table public.gi_source_versions
  add column if not exists document_id uuid,
  add column if not exists content_hash text,
  add column if not exists extracted_text text,
  add column if not exists extraction_method text,
  add column if not exists checked_at timestamptz not null default now(),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists gi_source_versions_document_hash_v035_uq
  on public.gi_source_versions (document_id, content_hash)
  where document_id is not null and content_hash is not null;

create index if not exists gi_source_versions_latest_v035_idx
  on public.gi_source_versions (document_id, checked_at desc);

create table if not exists public.gi_evidence_records (
  id uuid primary key default gen_random_uuid()
);

alter table public.gi_evidence_records
  add column if not exists source_version_id uuid,
  add column if not exists locator text,
  add column if not exists quote text,
  add column if not exists status text not null default 'unverified',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

create index if not exists gi_evidence_records_version_v035_idx
  on public.gi_evidence_records (source_version_id);

create table if not exists public.gi_ingestion_failures (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  error_message text not null,
  checked_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.gi_source_documents enable row level security;
alter table public.gi_source_versions enable row level security;
alter table public.gi_evidence_records enable row level security;
alter table public.gi_ingestion_failures enable row level security;

create or replace function public.gi_get_latest_source_text(p_canonical_url text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select v.extracted_text
  from public.gi_source_documents d
  join public.gi_source_versions v on v.document_id = d.id
  where d.canonical_url = p_canonical_url
  order by v.checked_at desc
  limit 1;
$$;

create or replace function public.gi_persist_source_evidence(p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_id uuid;
  v_version_id uuid;
  v_citation jsonb;
begin
  if coalesce(p_record->>'source_id', '') = '' then
    raise exception 'source_id is required';
  end if;
  if coalesce(p_record->>'canonical_url', '') = '' then
    raise exception 'canonical_url is required';
  end if;
  if coalesce(p_record->>'content_hash', '') = '' then
    raise exception 'content_hash is required';
  end if;
  if coalesce(p_record->>'extracted_text', '') = '' then
    raise exception 'extracted_text is required';
  end if;

  insert into public.gi_source_documents (
    source_key,
    canonical_url,
    title,
    authority,
    document_number,
    published_at,
    metadata,
    last_checked_at
  ) values (
    p_record->>'source_id',
    p_record->>'canonical_url',
    nullif(p_record->>'title', ''),
    nullif(p_record->>'authority', ''),
    nullif(p_record->>'document_number', ''),
    nullif(p_record->>'published_at', '')::date,
    coalesce(p_record->'metadata', '{}'::jsonb),
    coalesce(nullif(p_record->>'checked_at', '')::timestamptz, now())
  )
  on conflict (canonical_url) where canonical_url is not null
  do update set
    source_key = excluded.source_key,
    title = excluded.title,
    authority = excluded.authority,
    document_number = excluded.document_number,
    published_at = excluded.published_at,
    metadata = excluded.metadata,
    last_checked_at = excluded.last_checked_at
  returning id into v_document_id;

  insert into public.gi_source_versions (
    document_id,
    content_hash,
    extracted_text,
    extraction_method,
    checked_at,
    metadata
  ) values (
    v_document_id,
    p_record->>'content_hash',
    p_record->>'extracted_text',
    coalesce(nullif(p_record->>'extraction_method', ''), 'unsupported'),
    coalesce(nullif(p_record->>'checked_at', '')::timestamptz, now()),
    jsonb_build_object('source_id', p_record->>'source_id')
  )
  on conflict (document_id, content_hash) where document_id is not null and content_hash is not null
  do update set checked_at = excluded.checked_at
  returning id into v_version_id;

  delete from public.gi_evidence_records
  where source_version_id = v_version_id;

  for v_citation in
    select value from jsonb_array_elements(coalesce(p_record->'citations', '[]'::jsonb))
  loop
    insert into public.gi_evidence_records (
      source_version_id,
      locator,
      quote,
      status,
      metadata
    ) values (
      v_version_id,
      nullif(v_citation->>'locator', ''),
      nullif(v_citation->>'quote', ''),
      'unverified',
      jsonb_build_object('source_id', p_record->>'source_id')
    );
  end loop;

  return jsonb_build_object(
    'document_id', v_document_id,
    'version_id', v_version_id,
    'content_hash', p_record->>'content_hash'
  );
end;
$$;

create or replace function public.gi_record_ingestion_failure(
  p_source_id text,
  p_error_message text,
  p_checked_at timestamptz
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.gi_ingestion_failures (source_key, error_message, checked_at)
  values (p_source_id, p_error_message, coalesce(p_checked_at, now()));
$$;

revoke all on function public.gi_get_latest_source_text(text) from public, anon, authenticated;
revoke all on function public.gi_persist_source_evidence(jsonb) from public, anon, authenticated;
revoke all on function public.gi_record_ingestion_failure(text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.gi_get_latest_source_text(text) to service_role;
grant execute on function public.gi_persist_source_evidence(jsonb) to service_role;
grant execute on function public.gi_record_ingestion_failure(text, text, timestamptz) to service_role;

commit;
