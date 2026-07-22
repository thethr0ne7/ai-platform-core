begin;

create or replace function public.gi_persist_source_evidence(p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_id uuid;
  v_document_id uuid;
  v_existing_source_id uuid;
  v_version_id uuid;
  v_version_no integer;
  v_citation jsonb;
  v_canonical_url text;
  v_normalized_url text;
  v_evidence_tier text;
begin
  if coalesce(p_record->>'source_id','')='' then raise exception 'source_id is required'; end if;
  if coalesce(p_record->>'canonical_url','')='' then raise exception 'canonical_url is required'; end if;
  if coalesce(p_record->>'content_hash','')='' then raise exception 'content_hash is required'; end if;
  if coalesce(p_record->>'extracted_text','')='' then raise exception 'extracted_text is required'; end if;

  select id into v_source_id
  from public.gi_official_sources
  where source_key=p_record->>'source_id' and active=true
  limit 1;
  if v_source_id is null then raise exception 'official source not found: %',p_record->>'source_id'; end if;

  v_canonical_url:=p_record->>'canonical_url';
  v_normalized_url:=public.gi_normalize_source_url(v_canonical_url);
  v_evidence_tier:=case
    when public.gi_url_host(v_canonical_url) in ('publication.pravo.gov.ru','regulation.gov.ru','promote.budget.gov.ru') then 'A'
    when public.gi_url_host(v_canonical_url) in ('t.me','telegram.me') then 'C'
    else 'B'
  end;

  select id,source_id into v_document_id,v_existing_source_id
  from public.gi_source_documents
  where canonical_url=v_canonical_url
  limit 1;

  if v_document_id is not null and v_existing_source_id<>v_source_id then
    raise exception 'source_owner_conflict: url % already belongs to another source',v_canonical_url;
  end if;

  if v_document_id is null then
    select id into v_document_id
    from public.gi_source_documents
    where source_id=v_source_id
      and normalized_url=v_normalized_url
      and duplicate_of is null
    order by first_seen_at,id
    limit 1;
  end if;

  if v_document_id is null then
    insert into public.gi_source_documents(
      source_id,source_key,canonical_url,normalized_url,title,authority,document_number,
      document_date,published_at,metadata,last_checked_at,last_seen_at,
      evidence_tier,owner_validation_status
    ) values (
      v_source_id,
      p_record->>'source_id',
      v_canonical_url,
      v_normalized_url,
      coalesce(nullif(p_record->>'title',''),v_canonical_url),
      nullif(p_record->>'authority',''),
      nullif(p_record->>'document_number',''),
      nullif(p_record->>'published_at','')::date,
      nullif(p_record->>'published_at','')::timestamptz,
      coalesce(p_record->'metadata','{}'::jsonb),
      coalesce(nullif(p_record->>'checked_at','')::timestamptz,now()),
      coalesce(nullif(p_record->>'checked_at','')::timestamptz,now()),
      v_evidence_tier,
      'verified'
    ) returning id into v_document_id;
  else
    update public.gi_source_documents
    set source_key=p_record->>'source_id',
        title=coalesce(nullif(p_record->>'title',''),title),
        authority=coalesce(nullif(p_record->>'authority',''),authority),
        document_number=coalesce(nullif(p_record->>'document_number',''),document_number),
        document_date=coalesce(nullif(p_record->>'published_at','')::date,document_date),
        published_at=coalesce(nullif(p_record->>'published_at','')::timestamptz,published_at),
        metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_record->'metadata','{}'::jsonb),
        last_checked_at=coalesce(nullif(p_record->>'checked_at','')::timestamptz,now()),
        last_seen_at=coalesce(nullif(p_record->>'checked_at','')::timestamptz,now()),
        normalized_url=v_normalized_url,
        evidence_tier=v_evidence_tier,
        owner_validation_status='verified'
    where id=v_document_id and source_id=v_source_id;
  end if;

  select id,version_no into v_version_id,v_version_no
  from public.gi_source_versions
  where document_id=v_document_id and content_hash=p_record->>'content_hash'
  limit 1;

  if v_version_id is null then
    select coalesce(max(version_no),0)+1 into v_version_no
    from public.gi_source_versions where document_id=v_document_id;

    insert into public.gi_source_versions(
      document_id,version_no,content_hash,extracted_text,extraction_method,checked_at,metadata
    ) values (
      v_document_id,
      v_version_no,
      p_record->>'content_hash',
      p_record->>'extracted_text',
      coalesce(nullif(p_record->>'extraction_method',''),'unsupported'),
      coalesce(nullif(p_record->>'checked_at','')::timestamptz,now()),
      jsonb_build_object('source_id',p_record->>'source_id','evidence_tier',v_evidence_tier,'normalized_url',v_normalized_url)
    ) returning id into v_version_id;

    update public.gi_source_documents set current_version=v_version_no where id=v_document_id;
  else
    update public.gi_source_versions
    set checked_at=coalesce(nullif(p_record->>'checked_at','')::timestamptz,now()),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('evidence_tier',v_evidence_tier,'normalized_url',v_normalized_url)
    where id=v_version_id;
  end if;

  delete from public.gi_evidence_records where version_id=v_version_id or source_version_id=v_version_id;

  for v_citation in
    select value from jsonb_array_elements(coalesce(p_record->'citations','[]'::jsonb))
  loop
    insert into public.gi_evidence_records(
      version_id,evidence_type,source_locator,quote,extracted_value,verification_status,
      source_version_id,locator,status,metadata
    ) values (
      v_version_id,
      'citation',
      nullif(v_citation->>'locator',''),
      nullif(v_citation->>'quote',''),
      jsonb_build_object('source_id',p_record->>'source_id'),
      'unverified',
      v_version_id,
      nullif(v_citation->>'locator',''),
      'unverified',
      jsonb_build_object('source_id',p_record->>'source_id','evidence_tier',v_evidence_tier,'owner_validation_status','verified')
    );
  end loop;

  return jsonb_build_object(
    'document_id',v_document_id,
    'version_id',v_version_id,
    'content_hash',p_record->>'content_hash',
    'normalized_url',v_normalized_url,
    'evidence_tier',v_evidence_tier,
    'owner_validation_status','verified'
  );
end;
$$;

revoke all on function public.gi_persist_source_evidence(jsonb) from public,anon,authenticated;
grant execute on function public.gi_persist_source_evidence(jsonb) to service_role,postgres;

commit;
