begin;

create or replace function public.gi_claim_legal_ocr_job(p_runner jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_job_id uuid;
  v_result jsonb;
begin
  update public.gi_legal_ocr_jobs
  set status='pending',
      error_message='stale_processing_recovered',
      updated_at=now()
  where status='processing'
    and started_at < now()-interval '45 minutes'
    and attempts < max_attempts;

  select id into v_job_id
  from public.gi_legal_ocr_jobs
  where status in ('pending','failed')
    and attempts < max_attempts
  order by priority,created_at
  for update skip locked
  limit 1;

  if v_job_id is null then
    return null;
  end if;

  update public.gi_legal_ocr_jobs j
  set status='processing',
      attempts=j.attempts+1,
      started_at=now(),
      finished_at=null,
      error_message=null,
      metadata=coalesce(j.metadata,'{}'::jsonb)||jsonb_build_object(
        'runner',coalesce(p_runner,'{}'::jsonb),
        'claimed_at',now()
      ),
      updated_at=now()
  where j.id=v_job_id;

  select jsonb_build_object(
    'id',j.id,
    'evidence_task_id',j.evidence_task_id,
    'source_document_id',j.source_document_id,
    'canonical_url',j.canonical_url,
    'acquisition_url',j.acquisition_url,
    'file_url',j.file_url,
    'language',j.language,
    'priority',j.priority,
    'attempts',j.attempts,
    'max_attempts',j.max_attempts,
    'title',d.title,
    'document_number',d.document_number,
    'authority',d.authority,
    'source_key',d.source_key,
    'evidence_tier',d.evidence_tier
  ) into v_result
  from public.gi_legal_ocr_jobs j
  join public.gi_source_documents d on d.id=j.source_document_id
  where j.id=v_job_id;

  return v_result;
end;
$$;

create or replace function public.gi_complete_legal_ocr_job(
  p_job_id uuid,
  p_extracted_text text,
  p_page_text jsonb,
  p_confidence numeric,
  p_engine text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_job public.gi_legal_ocr_jobs%rowtype;
  v_doc public.gi_source_documents%rowtype;
  v_hash text;
  v_citations jsonb;
  v_persisted jsonb;
  v_version_id uuid;
  v_page_count integer;
begin
  select * into v_job
  from public.gi_legal_ocr_jobs
  where id=p_job_id
  for update;

  if not found then raise exception 'ocr_job_not_found'; end if;
  if v_job.status<>'processing' then raise exception 'ocr_job_not_processing'; end if;
  if length(btrim(coalesce(p_extracted_text,'')))<80 then raise exception 'ocr_text_too_short'; end if;
  if jsonb_typeof(coalesce(p_page_text,'[]'::jsonb))<>'array' then raise exception 'ocr_pages_must_be_array'; end if;

  select * into v_doc from public.gi_source_documents where id=v_job.source_document_id;
  if not found then raise exception 'ocr_source_document_not_found'; end if;
  if v_doc.evidence_tier<>'A' then raise exception 'ocr_requires_tier_a_document'; end if;
  if v_doc.owner_validation_status<>'verified' then raise exception 'ocr_requires_verified_owner'; end if;

  v_hash:=encode(digest(convert_to(p_extracted_text,'UTF8'),'sha256'),'hex');
  v_page_count:=jsonb_array_length(coalesce(p_page_text,'[]'::jsonb));

  select coalesce(jsonb_agg(jsonb_build_object(
    'locator',coalesce(nullif(page->>'locator',''),'page:'||(ordinality::text)),
    'quote',left(coalesce(page->>'text',''),700)
  ) order by ordinality),'[]'::jsonb)
  into v_citations
  from jsonb_array_elements(coalesce(p_page_text,'[]'::jsonb)) with ordinality as pages(page,ordinality)
  where length(btrim(coalesce(page->>'text','')))>=20;

  v_persisted:=public.gi_persist_source_evidence(jsonb_build_object(
    'source_id',v_doc.source_key,
    'canonical_url',v_doc.canonical_url,
    'title',v_doc.title,
    'authority',v_doc.authority,
    'document_number',v_doc.document_number,
    'published_at',coalesce(v_doc.published_at::text,v_doc.document_date::text),
    'checked_at',now(),
    'content_hash',v_hash,
    'extracted_text',p_extracted_text,
    'extraction_method',coalesce(nullif(p_engine,''),'github-actions-ocr-v0.68'),
    'citations',v_citations,
    'metadata',jsonb_build_object(
      'ocr_status','draft_manual_review',
      'ocr_confidence',p_confidence,
      'ocr_page_count',v_page_count,
      'ocr_engine',p_engine,
      'human_verification_required',true,
      'runner_metadata',coalesce(p_metadata,'{}'::jsonb)
    )
  ));

  v_version_id:=nullif(v_persisted->>'version_id','')::uuid;

  if v_version_id is not null then
    update public.gi_source_versions
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'ocr_status','draft_manual_review',
      'ocr_confidence',p_confidence,
      'ocr_page_count',v_page_count,
      'ocr_engine',p_engine,
      'human_verification_required',true,
      'runner_metadata',coalesce(p_metadata,'{}'::jsonb)
    )
    where id=v_version_id;
  end if;

  update public.gi_legal_ocr_jobs
  set status='manual_review',
      engine=coalesce(nullif(p_engine,''),'github-actions-ocr-v0.68'),
      page_count=v_page_count,
      extracted_text=p_extracted_text,
      page_text=coalesce(p_page_text,'[]'::jsonb),
      confidence=least(1,greatest(0,coalesce(p_confidence,0))),
      error_message=null,
      finished_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'version_id',v_version_id,
        'content_hash',v_hash,
        'manual_verification_required',true,
        'completed_by',coalesce(p_metadata,'{}'::jsonb)
      ),
      updated_at=now()
  where id=p_job_id;

  update public.gi_evidence_verification_queue
  set status='in_progress',
      result=coalesce(result,'{}'::jsonb)||jsonb_build_object(
        'capture_status','ocr_ready',
        'ocr_job_id',p_job_id,
        'version_id',v_version_id,
        'ocr_page_count',v_page_count,
        'ocr_confidence',p_confidence,
        'ocr_engine',p_engine,
        'human_verification_required',true
      ),
      notes='OCR-черновик сохранён. Юридические требования остаются неподтверждёнными до ручной проверки точных цитат, пунктов и редакции.',
      updated_at=now()
  where id=v_job.evidence_task_id;

  return jsonb_build_object(
    'job_id',p_job_id,
    'status','manual_review',
    'document_id',v_doc.id,
    'version_id',v_version_id,
    'content_hash',v_hash,
    'page_count',v_page_count,
    'characters',length(p_extracted_text),
    'verified',false
  );
end;
$$;

create or replace function public.gi_fail_legal_ocr_job(
  p_job_id uuid,
  p_error text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_job public.gi_legal_ocr_jobs%rowtype;
  v_next_status text;
begin
  select * into v_job
  from public.gi_legal_ocr_jobs
  where id=p_job_id
  for update;
  if not found then raise exception 'ocr_job_not_found'; end if;

  v_next_status:=case when v_job.attempts>=v_job.max_attempts then 'failed' else 'pending' end;

  update public.gi_legal_ocr_jobs
  set status=v_next_status,
      error_message=left(regexp_replace(coalesce(p_error,'unknown_error'),'[\r\n]+',' ','g'),1500),
      finished_at=case when v_next_status='failed' then now() else null end,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'last_failure_at',now(),
        'failure_metadata',coalesce(p_metadata,'{}'::jsonb)
      ),
      updated_at=now()
  where id=p_job_id;

  return jsonb_build_object(
    'job_id',p_job_id,
    'status',v_next_status,
    'attempts',v_job.attempts,
    'max_attempts',v_job.max_attempts
  );
end;
$$;

revoke all on function public.gi_claim_legal_ocr_job(jsonb) from public,anon,authenticated;
revoke all on function public.gi_complete_legal_ocr_job(uuid,text,jsonb,numeric,text,jsonb) from public,anon,authenticated;
revoke all on function public.gi_fail_legal_ocr_job(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.gi_claim_legal_ocr_job(jsonb) to service_role,postgres;
grant execute on function public.gi_complete_legal_ocr_job(uuid,text,jsonb,numeric,text,jsonb) to service_role,postgres;
grant execute on function public.gi_fail_legal_ocr_job(uuid,text,jsonb) to service_role,postgres;

commit;
