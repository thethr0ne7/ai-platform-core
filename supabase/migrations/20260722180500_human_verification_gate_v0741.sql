begin;

alter table public.gi_evidence_review_audit
  add column if not exists review_mode text not null default 'human';

alter table public.gi_evidence_review_audit
  drop constraint if exists gi_evidence_review_audit_review_mode_check;

alter table public.gi_evidence_review_audit
  add constraint gi_evidence_review_audit_review_mode_check
  check(review_mode in ('human','machine'));

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
    if coalesce(new.metadata->>'human_reviewed','false')<>'true' then
      raise exception 'verified_evidence_requires_human_review';
    end if;
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

    if not found then
      raise exception 'verified_evidence_source_version_not_found';
    end if;
    if v_tier<>'A' then
      raise exception 'verified_evidence_requires_tier_a_source';
    end if;
    if v_owner_status<>'verified' then
      raise exception 'verified_evidence_requires_verified_owner';
    end if;

    new.verification_status:='verified';
    new.status:='verified';
    new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'verified_at',coalesce(new.metadata->>'verified_at',now()::text),
      'verification_gate','tier-a-human-v0.74.1',
      'human_reviewed',true
    );
  end if;
  return new;
end;
$$;

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
    if v_evidence_id is null then
      raise exception 'verified_requirement_requires_evidence_record';
    end if;
    select exists(
      select 1
      from public.gi_evidence_records er
      where er.id=v_evidence_id
        and er.verification_status='verified'
        and er.status='verified'
        and coalesce(er.metadata->>'human_reviewed','false')='true'
        and (
          (er.subject_type='measure_requirement' and er.subject_id=new.id)
          or (er.subject_type='support_measure' and er.subject_id=new.measure_id)
        )
    ) into v_ok;
    if not v_ok then
      raise exception 'verified_requirement_requires_human_reviewed_evidence';
    end if;
  end if;
  return new;
end;
$$;

update public.gi_measure_requirements r
set evidence_status='manual_review',
    metadata=(coalesce(r.metadata,'{}'::jsonb)
      - 'verified_at'
      - 'verification_state'
      - 'verification_method')
      ||jsonb_build_object(
        'verification_state','machine_quote_match',
        'verification_method','tier_a_exact_quote_machine_match',
        'human_review_required',true,
        'machine_matched_at',now()
      ),
    updated_at=now()
where r.metadata->>'quote_origin'='ocr_candidate_not_human_verified'
  and r.evidence_status='verified';

update public.gi_evidence_records er
set verification_status='unverified',
    status='unverified',
    metadata=(coalesce(er.metadata,'{}'::jsonb)
      - 'verified_at'
      - 'verification_gate')
      ||jsonb_build_object(
        'verified_by','AI Factory exact-quote matcher',
        'human_reviewed',false,
        'machine_quote_match',true,
        'verification_method','tier_a_exact_quote_machine_match',
        'machine_matched_at',now()
      )
where er.subject_type='measure_requirement'
  and coalesce(er.metadata->>'human_reviewed','false')='true'
  and exists(
    select 1 from public.gi_measure_requirements r
    where r.id=er.subject_id
      and r.metadata->>'quote_origin'='ocr_candidate_not_human_verified'
  );

update public.gi_evidence_verification_queue q
set status='in_progress',
    assigned_to=null,
    reviewed_at=null,
    notes='Точная цитата найдена машиной в сохранённой Tier A версии. Требуется реальное решение эксперта.',
    result=coalesce(q.result,'{}'::jsonb)||jsonb_build_object(
      'verification_method','tier_a_exact_quote_machine_match',
      'human_reviewed',false,
      'human_review_required',true
    ),
    updated_at=now()
where q.task_code='apk_territory_scope_quote'
  and q.status='verified';

update public.gi_evidence_review_audit a
set review_mode='machine',
    notes='Автоматический bootstrap: точное совпадение цитаты найдено машиной; экспертное решение не выполнялось.',
    after_state=coalesce(a.after_state,'{}'::jsonb)||jsonb_build_object(
      'review_mode','machine',
      'human_reviewed',false,
      'correction','provenance_repaired_v0.74.1'
    )
where a.decision='verified'
  and a.notes like 'Первичное подтверждение v0.74:%';

create or replace function public.gi_review_evidence_task(
  p_task_id uuid,
  p_reviewer_telegram_id bigint,
  p_decision text,
  p_quote text default null,
  p_locator text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task record;
  v_before jsonb;
  v_after jsonb;
  v_evidence_id uuid;
  v_now timestamptz:=now();
begin
  if not exists(
    select 1 from public.gi_evidence_reviewers r
    where r.telegram_user_id=p_reviewer_telegram_id and r.active=true
  ) then
    raise exception 'evidence_reviewer_not_allowed';
  end if;

  if p_decision not in ('verified','rejected','blocked','reopened') then
    raise exception 'invalid_evidence_review_decision';
  end if;

  select
    q.*,
    req.expected_value,
    req.description as requirement_description,
    doc.evidence_tier,
    doc.owner_validation_status,
    doc.canonical_url,
    doc.title as document_title,
    ver.id as current_source_version_id,
    ver.extracted_text
  into v_task
  from public.gi_evidence_verification_queue q
  left join public.gi_measure_requirements req on req.id=q.requirement_id
  left join public.gi_source_documents doc on doc.id=coalesce(
    q.source_document_id,
    case
      when coalesce(req.metadata->>'source_document_id','') ~* '^[0-9a-f-]{36}$'
        then (req.metadata->>'source_document_id')::uuid
      else null
    end
  )
  left join lateral (
    select v.*
    from public.gi_source_versions v
    where v.document_id=doc.id
    order by v.version_no desc,v.checked_at desc
    limit 1
  ) ver on true
  where q.id=p_task_id
  for update of q;

  if not found then raise exception 'evidence_review_task_not_found'; end if;
  v_before:=to_jsonb(v_task);

  if p_decision='verified' then
    if v_task.task_type<>'quote_locator' or v_task.requirement_id is null then
      raise exception 'only_requirement_quote_tasks_can_verify_evidence';
    end if;
    if v_task.evidence_tier<>'A' then raise exception 'verification_requires_tier_a_document'; end if;
    if v_task.owner_validation_status<>'verified' then raise exception 'verification_requires_verified_source_owner'; end if;
    if v_task.current_source_version_id is null or length(coalesce(v_task.extracted_text,''))<20 then
      raise exception 'verification_requires_extracted_source_version';
    end if;
    if length(btrim(coalesce(p_quote,'')))<40 then raise exception 'verification_requires_exact_quote'; end if;
    if length(btrim(coalesce(p_locator,'')))<8 then raise exception 'verification_requires_locator'; end if;
    if strpos(
      public.gi_normalize_evidence_text(v_task.extracted_text),
      public.gi_normalize_evidence_text(p_quote)
    )=0 then
      raise exception 'quote_not_found_in_source_version';
    end if;

    select er.id into v_evidence_id
    from public.gi_evidence_records er
    where er.subject_type='measure_requirement'
      and er.subject_id=v_task.requirement_id
      and coalesce(er.source_version_id,er.version_id)=v_task.current_source_version_id
    order by er.created_at desc
    limit 1;

    if v_evidence_id is null then
      insert into public.gi_evidence_records(
        version_id,source_version_id,evidence_type,subject_type,subject_id,
        source_locator,locator,quote,extracted_value,verification_status,status,metadata
      ) values (
        v_task.current_source_version_id,v_task.current_source_version_id,
        'legal_requirement','measure_requirement',v_task.requirement_id,
        btrim(p_locator),btrim(p_locator),btrim(p_quote),
        jsonb_build_object(
          'expected_value',v_task.expected_value,
          'document_title',v_task.document_title,
          'canonical_url',v_task.canonical_url
        ),
        'verified','verified',jsonb_build_object(
          'verified_by','telegram:'||p_reviewer_telegram_id::text,
          'reviewer_telegram_user_id',p_reviewer_telegram_id,
          'verification_method','tier_a_exact_quote_human_review',
          'human_reviewed',true,
          'machine_quote_match',true,
          'review_notes',nullif(btrim(coalesce(p_notes,'')),'')
        )
      ) returning id into v_evidence_id;
    else
      update public.gi_evidence_records er
      set source_locator=btrim(p_locator),locator=btrim(p_locator),quote=btrim(p_quote),
          verification_status='verified',status='verified',
          extracted_value=jsonb_build_object(
            'expected_value',v_task.expected_value,
            'document_title',v_task.document_title,
            'canonical_url',v_task.canonical_url
          ),
          metadata=coalesce(er.metadata,'{}'::jsonb)||jsonb_build_object(
            'verified_by','telegram:'||p_reviewer_telegram_id::text,
            'reviewer_telegram_user_id',p_reviewer_telegram_id,
            'verification_method','tier_a_exact_quote_human_review',
            'human_reviewed',true,
            'machine_quote_match',true,
            'review_notes',nullif(btrim(coalesce(p_notes,'')),'')
          )
      where er.id=v_evidence_id;
    end if;

    update public.gi_measure_requirements req
    set evidence_status='verified',
        evidence_quote=btrim(p_quote),
        source_locator=btrim(p_locator),
        metadata=coalesce(req.metadata,'{}'::jsonb)||jsonb_build_object(
          'evidence_record_id',v_evidence_id,
          'verification_state','human_verified',
          'verification_method','tier_a_exact_quote_human_review',
          'human_reviewed',true,
          'verified_at',v_now
        ),
        updated_at=v_now
    where req.id=v_task.requirement_id;

    update public.gi_evidence_verification_queue q
    set status='verified',assigned_to='telegram:'||p_reviewer_telegram_id::text,
        reviewed_at=v_now,notes=nullif(btrim(coalesce(p_notes,'')),''),
        result=jsonb_build_object(
          'evidence_record_id',v_evidence_id,
          'source_version_id',v_task.current_source_version_id,
          'verification_method','tier_a_exact_quote_human_review',
          'human_reviewed',true
        ),updated_at=v_now
    where q.id=p_task_id;
  elsif p_decision='reopened' then
    update public.gi_evidence_verification_queue q
    set status='pending',assigned_to=null,reviewed_at=null,
        notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=v_now
    where q.id=p_task_id;
  else
    update public.gi_evidence_verification_queue q
    set status=p_decision,assigned_to='telegram:'||p_reviewer_telegram_id::text,
        reviewed_at=v_now,notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=v_now
    where q.id=p_task_id;
  end if;

  select to_jsonb(q.*) into v_after
  from public.gi_evidence_verification_queue q where q.id=p_task_id;

  insert into public.gi_evidence_review_audit(
    task_id,evidence_record_id,reviewer_telegram_user_id,decision,
    before_state,after_state,notes,review_mode
  ) values (
    p_task_id,v_evidence_id,p_reviewer_telegram_id,p_decision,
    v_before,v_after,nullif(btrim(coalesce(p_notes,'')),''),'human'
  );

  return jsonb_build_object(
    'task_id',p_task_id,
    'decision',p_decision,
    'evidence_record_id',v_evidence_id,
    'reviewed_at',v_now,
    'review_mode','human'
  );
end;
$$;

revoke all on function public.gi_review_evidence_task(uuid,bigint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.gi_review_evidence_task(uuid,bigint,text,text,text,text) to service_role,postgres;

commit;
