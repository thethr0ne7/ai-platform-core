begin;

insert into public.gi_official_sources (
  source_key,name,authority,level,region,municipality,base_url,active,discovery_methods,status,metadata,updated_at
) values
('kbr-economy','Министерство экономического развития Кабардино-Балкарской Республики','Министерство экономического развития Кабардино-Балкарской Республики','regional','Кабардино-Балкарская Республика',null,'https://economykbr.ru/',true,array['sitemap','html','document'],'active','{}'::jsonb,now()),
('kbr-tourism-ministry','Министерство курортов и туризма Кабардино-Балкарской Республики','Министерство курортов и туризма Кабардино-Балкарской Республики','regional','Кабардино-Балкарская Республика',null,'https://minturizm.kbr.ru/',true,array['sitemap','html','document'],'active','{}'::jsonb,now()),
('kbr-land-property','Министерство земельных и имущественных отношений Кабардино-Балкарской Республики','Министерство земельных и имущественных отношений Кабардино-Балкарской Республики','regional','Кабардино-Балкарская Республика',null,'https://minimush.kbr.ru/',true,array['sitemap','html','document'],'active','{}'::jsonb,now()),
('kbr-tourism-portal','Официальный туристический портал Кабардино-Балкарской Республики','Министерство курортов и туризма Кабардино-Балкарской Республики','regional','Кабардино-Балкарская Республика',null,'https://visit.kbr.ru/',true,array['sitemap','html','document'],'active','{}'::jsonb,now())
on conflict (source_key) do update set
  name=excluded.name,
  authority=excluded.authority,
  level=excluded.level,
  region=excluded.region,
  base_url=excluded.base_url,
  active=excluded.active,
  discovery_methods=excluded.discovery_methods,
  status=excluded.status,
  metadata=excluded.metadata,
  updated_at=now();

create or replace function public.gi_persist_source_evidence(p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_id uuid;
  v_document_id uuid;
  v_version_id uuid;
  v_version_no integer;
  v_citation jsonb;
begin
  if coalesce(p_record->>'source_id', '') = '' then raise exception 'source_id is required'; end if;
  if coalesce(p_record->>'canonical_url', '') = '' then raise exception 'canonical_url is required'; end if;
  if coalesce(p_record->>'content_hash', '') = '' then raise exception 'content_hash is required'; end if;
  if coalesce(p_record->>'extracted_text', '') = '' then raise exception 'extracted_text is required'; end if;

  select id into v_source_id
  from public.gi_official_sources
  where source_key = p_record->>'source_id'
  limit 1;

  if v_source_id is null then
    raise exception 'official source not found: %', p_record->>'source_id';
  end if;

  insert into public.gi_source_documents (
    source_id, source_key, canonical_url, title, authority, document_number,
    document_date, published_at, metadata, last_checked_at, last_seen_at
  ) values (
    v_source_id,
    p_record->>'source_id',
    p_record->>'canonical_url',
    coalesce(nullif(p_record->>'title', ''), p_record->>'canonical_url'),
    nullif(p_record->>'authority', ''),
    nullif(p_record->>'document_number', ''),
    nullif(p_record->>'published_at', '')::date,
    nullif(p_record->>'published_at', '')::timestamptz,
    coalesce(p_record->'metadata', '{}'::jsonb),
    coalesce(nullif(p_record->>'checked_at', '')::timestamptz, now()),
    coalesce(nullif(p_record->>'checked_at', '')::timestamptz, now())
  )
  on conflict (canonical_url) where canonical_url is not null
  do update set
    source_id = excluded.source_id,
    source_key = excluded.source_key,
    title = excluded.title,
    authority = excluded.authority,
    document_number = excluded.document_number,
    document_date = excluded.document_date,
    published_at = excluded.published_at,
    metadata = excluded.metadata,
    last_checked_at = excluded.last_checked_at,
    last_seen_at = excluded.last_seen_at
  returning id, current_version into v_document_id, v_version_no;

  select id, version_no into v_version_id, v_version_no
  from public.gi_source_versions
  where document_id = v_document_id and content_hash = p_record->>'content_hash'
  limit 1;

  if v_version_id is null then
    select coalesce(max(version_no), 0) + 1 into v_version_no
    from public.gi_source_versions
    where document_id = v_document_id;

    insert into public.gi_source_versions (
      document_id, version_no, content_hash, extracted_text, extraction_method, checked_at, metadata
    ) values (
      v_document_id,
      v_version_no,
      p_record->>'content_hash',
      p_record->>'extracted_text',
      coalesce(nullif(p_record->>'extraction_method', ''), 'unsupported'),
      coalesce(nullif(p_record->>'checked_at', '')::timestamptz, now()),
      jsonb_build_object('source_id', p_record->>'source_id')
    ) returning id into v_version_id;

    update public.gi_source_documents
    set current_version = v_version_no
    where id = v_document_id;
  else
    update public.gi_source_versions
    set checked_at = coalesce(nullif(p_record->>'checked_at', '')::timestamptz, now())
    where id = v_version_id;
  end if;

  delete from public.gi_evidence_records where version_id = v_version_id;

  for v_citation in select value from jsonb_array_elements(coalesce(p_record->'citations', '[]'::jsonb))
  loop
    insert into public.gi_evidence_records (
      version_id, evidence_type, source_locator, quote, extracted_value,
      verification_status, source_version_id, locator, status, metadata
    ) values (
      v_version_id,
      'citation',
      nullif(v_citation->>'locator', ''),
      nullif(v_citation->>'quote', ''),
      jsonb_build_object('source_id', p_record->>'source_id'),
      'unverified',
      v_version_id,
      nullif(v_citation->>'locator', ''),
      'unverified',
      jsonb_build_object('source_id', p_record->>'source_id')
    );
  end loop;

  return jsonb_build_object('document_id', v_document_id, 'version_id', v_version_id, 'content_hash', p_record->>'content_hash');
end;
$$;

commit;
