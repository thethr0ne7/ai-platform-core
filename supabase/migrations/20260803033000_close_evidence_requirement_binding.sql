begin;

-- Gate B / #112: bind every measure to source provenance, invalidate human
-- verification when a newer source version appears, and expose reviewer
-- backlog age/blocker/readiness without weakening the human-review gate.
do $precheck$
declare
  v_missing_measure_sources integer;
  v_rural_measure_count integer;
  v_rural_source_count integer;
begin
  select count(*) into v_missing_measure_sources
  from public.gi_support_measures
  where source_document_id is null;

  if v_missing_measure_sources <> 1 then
    raise exception
      'Gate B precondition failed: expected one measure without source_document_id, found %',
      v_missing_measure_sources;
  end if;

  select count(*) into v_rural_measure_count
  from public.gi_support_measures
  where code='FED_RURAL_TERRITORIES_INFRASTRUCTURE'
    and source_document_id is null;

  if v_rural_measure_count <> 1 then
    raise exception
      'Gate B precondition failed: expected one unbound rural measure, found %',
      v_rural_measure_count;
  end if;

  select count(*) into v_rural_source_count
  from public.gi_source_documents
  where canonical_url='https://government.ru/rugovclassifier/878/'
    and owner_validation_status='verified';

  if v_rural_source_count <> 1 then
    raise exception
      'Gate B precondition failed: expected one verified official rural programme source, found %',
      v_rural_source_count;
  end if;
end;
$precheck$;

with source_document as (
  select id
  from public.gi_source_documents
  where canonical_url='https://government.ru/rugovclassifier/878/'
    and owner_validation_status='verified'
)
update public.gi_support_measures m
set source_document_id=source_document.id,
    metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object(
      'source_binding','official_government_programme_page',
      'source_binding_at',now(),
      'source_tier','B',
      'tier_a_required_for_verification',true,
      'verification_state','source_bound_unverified'
    ),
    updated_at=now()
from source_document
where m.code='FED_RURAL_TERRITORIES_INFRASTRUCTURE'
  and m.source_document_id is null;

update public.gi_measure_requirements r
set metadata=coalesce(r.metadata,'{}'::jsonb)||jsonb_build_object(
      'source_document_id',m.source_document_id::text,
      'source_binding','official_government_programme_page',
      'tier_a_required_for_verification',true
    ),
    updated_at=now()
from public.gi_support_measures m
where r.measure_id=m.id
  and m.code='FED_RURAL_TERRITORIES_INFRASTRUCTURE';

update public.gi_evidence_verification_queue q
set source_document_id=m.source_document_id,
    result=coalesce(q.result,'{}'::jsonb)||jsonb_build_object(
      'source_binding','official_government_programme_page',
      'blocker_reason','source_tier_not_a',
      'tier_a_required',true
    ),
    notes=case
      when q.status='blocked' then coalesce(q.notes,'')
      else coalesce(
        q.notes,
        'Официальная страница программы привязана; для human verification требуется Tier A публикация и сохранённая версия.'
      )
    end,
    updated_at=now()
from public.gi_support_measures m
where q.measure_id=m.id
  and m.code='FED_RURAL_TERRITORIES_INFRASTRUCTURE'
  and q.source_document_id is null;

alter table public.gi_support_measures
  alter column source_document_id set not null;

comment on column public.gi_support_measures.source_document_id is
  'Required source provenance. Evidence may remain unverified until a Tier A version is available and human-reviewed.';

create table if not exists public.gi_evidence_invalidation_audit(
  id uuid primary key default gen_random_uuid(),
  evidence_record_id uuid not null references public.gi_evidence_records(id) on delete restrict,
  measure_id uuid references public.gi_support_measures(id) on delete restrict,
  requirement_id uuid references public.gi_measure_requirements(id) on delete restrict,
  source_document_id uuid not null references public.gi_source_documents(id) on delete restrict,
  previous_source_version_id uuid not null references public.gi_source_versions(id) on delete restrict,
  replacement_source_version_id uuid not null references public.gi_source_versions(id) on delete restrict,
  reason text not null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(evidence_record_id,replacement_source_version_id)
);

create index if not exists gi_evidence_invalidation_audit_requirement_idx
  on public.gi_evidence_invalidation_audit(requirement_id,created_at desc)
  where requirement_id is not null;

create index if not exists gi_evidence_invalidation_audit_document_idx
  on public.gi_evidence_invalidation_audit(source_document_id,created_at desc);

create or replace function public.gi_invalidate_verified_evidence_on_source_version()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_previous_version record;
  v_evidence record;
  v_measure_id uuid;
  v_requirement_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_task_code text;
  v_task_updated integer;
begin
  select v.id,v.version_no,v.content_hash
  into v_previous_version
  from public.gi_source_versions v
  where v.document_id=new.document_id
    and v.id<>new.id
    and v.version_no<new.version_no
  order by v.version_no desc,v.checked_at desc
  limit 1;

  if not found then
    return new;
  end if;

  -- Do not invalidate on historical backfill or an identical snapshot.
  if exists(
    select 1
    from public.gi_source_versions v
    where v.document_id=new.document_id
      and v.version_no>new.version_no
  ) or new.content_hash is not distinct from v_previous_version.content_hash then
    return new;
  end if;

  for v_evidence in
    select
      er.*,
      req.id as bound_requirement_id,
      req.measure_id as requirement_measure_id
    from public.gi_evidence_records er
    join public.gi_source_versions oldv
      on oldv.id=coalesce(er.source_version_id,er.version_id)
    left join public.gi_measure_requirements req
      on er.subject_type='measure_requirement'
     and req.id=er.subject_id
    where oldv.document_id=new.document_id
      and oldv.version_no<new.version_no
      and er.verification_status='verified'
      and er.status='verified'
  loop
    v_requirement_id:=v_evidence.bound_requirement_id;
    v_measure_id:=case
      when v_requirement_id is not null then v_evidence.requirement_measure_id
      when v_evidence.subject_type='support_measure' then v_evidence.subject_id
      else null
    end;

    v_before:=to_jsonb(v_evidence);

    update public.gi_evidence_records er
    set verification_status='unverified',
        status='unverified',
        metadata=coalesce(er.metadata,'{}'::jsonb)||jsonb_build_object(
          'verification_invalidated',true,
          'invalidation_reason','source_version_changed',
          'invalidated_at',now(),
          'invalidated_by_source_version_id',new.id,
          'previous_source_version_id',coalesce(er.source_version_id,er.version_id),
          'requires_human_reverification',true
        )
    where er.id=v_evidence.id
    returning to_jsonb(er.*) into v_after;

    if v_requirement_id is not null then
      update public.gi_measure_requirements req
      set evidence_status='manual_review',
          metadata=(coalesce(req.metadata,'{}'::jsonb)-'verified_at')||jsonb_build_object(
            'verification_state','source_version_changed',
            'human_review_required',true,
            'invalidated_at',now(),
            'invalidated_by_source_version_id',new.id,
            'previous_evidence_record_id',v_evidence.id
          ),
          updated_at=now()
      where req.id=v_requirement_id;
    end if;

    if v_measure_id is not null then
      update public.gi_support_measures m
      set metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object(
            'evidence_status','manual_review',
            'verification_state','source_version_changed',
            'human_review_required',true,
            'invalidated_at',now(),
            'invalidated_by_source_version_id',new.id
          ),
          updated_at=now()
      where m.id=v_measure_id;
    end if;

    v_task_updated:=0;
    if v_requirement_id is not null then
      update public.gi_evidence_verification_queue q
      set source_document_id=new.document_id,
          status='in_progress',
          assigned_to=null,
          reviewed_at=null,
          notes='Новая версия официального документа инвалидировала прежнее подтверждение. Требуется повторная human verification.',
          result=coalesce(q.result,'{}'::jsonb)||jsonb_build_object(
            'blocker_reason','source_version_changed',
            'previous_evidence_record_id',v_evidence.id,
            'previous_source_version_id',coalesce(v_evidence.source_version_id,v_evidence.version_id),
            'replacement_source_version_id',new.id,
            'human_review_required',true
          ),
          updated_at=now()
      where q.requirement_id=v_requirement_id;

      get diagnostics v_task_updated=row_count;

      if v_task_updated=0 then
        v_task_code:='reverify_'||replace(v_requirement_id::text,'-','');
        insert into public.gi_evidence_verification_queue(
          measure_id,requirement_id,source_document_id,task_code,task_type,title,
          target_url,expected_document,status,priority,result,notes
        )
        select
          req.measure_id,req.id,new.document_id,v_task_code,'quote_locator',
          'Повторно проверить требование после новой версии источника',
          doc.canonical_url,doc.title,'in_progress',10,
          jsonb_build_object(
            'blocker_reason','source_version_changed',
            'previous_evidence_record_id',v_evidence.id,
            'replacement_source_version_id',new.id,
            'human_review_required',true
          ),
          'Новая версия официального документа требует повторной human verification.'
        from public.gi_measure_requirements req
        join public.gi_source_documents doc on doc.id=new.document_id
        where req.id=v_requirement_id
        on conflict(measure_id,task_code) do update set
          source_document_id=excluded.source_document_id,
          status='in_progress',
          assigned_to=null,
          reviewed_at=null,
          result=public.gi_evidence_verification_queue.result||excluded.result,
          notes=excluded.notes,
          updated_at=now();
      end if;
    end if;

    insert into public.gi_evidence_invalidation_audit(
      evidence_record_id,measure_id,requirement_id,source_document_id,
      previous_source_version_id,replacement_source_version_id,reason,
      before_state,after_state
    ) values (
      v_evidence.id,v_measure_id,v_requirement_id,new.document_id,
      coalesce(v_evidence.source_version_id,v_evidence.version_id),new.id,
      'source_version_changed',v_before,v_after
    ) on conflict(evidence_record_id,replacement_source_version_id) do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists gi_00_evidence_invalidation_on_source_version
  on public.gi_source_versions;
create trigger gi_00_evidence_invalidation_on_source_version
after insert on public.gi_source_versions
for each row execute function public.gi_invalidate_verified_evidence_on_source_version();

-- Replace the reviewer-list RPC with an additive result contract. The Edge
-- Function forwards rows as JSON, so existing consumers remain compatible.
drop function if exists public.gi_list_evidence_review_tasks(bigint,integer);

create function public.gi_list_evidence_review_tasks(
  p_reviewer_telegram_id bigint,
  p_limit integer default 50
)
returns table(
  task_id uuid,
  task_code text,
  task_type text,
  task_title text,
  task_status text,
  priority integer,
  task_notes text,
  measure_code text,
  measure_title text,
  requirement_code text,
  requirement_description text,
  expected_value jsonb,
  candidate_quote text,
  candidate_locator text,
  document_title text,
  canonical_url text,
  evidence_tier text,
  owner_validation_status text,
  source_version_id uuid,
  source_text_excerpt text,
  created_at timestamptz,
  age_seconds bigint,
  blocker_reason text,
  source_ready boolean
)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not exists(
    select 1
    from public.gi_evidence_reviewers r
    where r.telegram_user_id=p_reviewer_telegram_id
      and r.active=true
  ) then
    raise exception 'evidence_reviewer_not_allowed';
  end if;

  return query
  select
    q.id,
    q.task_code,
    q.task_type,
    q.title,
    q.status,
    q.priority,
    q.notes,
    m.code,
    m.title,
    req.requirement_code,
    req.description,
    req.expected_value,
    req.evidence_quote,
    coalesce(req.source_locator,m.source_locator,q.expected_document),
    doc.title,
    doc.canonical_url,
    doc.evidence_tier,
    doc.owner_validation_status,
    ver.id,
    left(coalesce(ver.extracted_text,''),6000),
    q.created_at,
    greatest(0,extract(epoch from (now()-q.created_at))::bigint),
    case
      when q.status='blocked' and nullif(btrim(coalesce(q.notes,'')),'') is not null then q.notes
      when doc.id is null then 'source_document_missing'
      when doc.evidence_tier is distinct from 'A' then 'source_tier_not_a'
      when doc.owner_validation_status is distinct from 'verified' then 'source_owner_not_verified'
      when ver.id is null then 'source_version_missing'
      when length(coalesce(ver.extracted_text,''))<20 then 'source_text_missing'
      when q.task_type='quote_locator'
       and length(btrim(coalesce(req.evidence_quote,'')))<40 then 'candidate_quote_missing'
      when q.task_type='quote_locator'
       and length(btrim(coalesce(req.source_locator,m.source_locator,q.expected_document,'')))<8 then 'candidate_locator_missing'
      else null
    end,
    (
      doc.id is not null
      and doc.evidence_tier='A'
      and doc.owner_validation_status='verified'
      and ver.id is not null
      and length(coalesce(ver.extracted_text,''))>=20
    )
  from public.gi_evidence_verification_queue q
  join public.gi_support_measures m on m.id=q.measure_id
  left join public.gi_measure_requirements req on req.id=q.requirement_id
  left join public.gi_source_documents doc on doc.id=coalesce(
    q.source_document_id,
    case
      when coalesce(req.metadata->>'source_document_id','') ~* '^[0-9a-f-]{36}$'
        then (req.metadata->>'source_document_id')::uuid
      else null
    end,
    m.source_document_id
  )
  left join lateral (
    select v.*
    from public.gi_source_versions v
    where v.document_id=doc.id
    order by v.version_no desc,v.checked_at desc
    limit 1
  ) ver on true
  where q.status in ('pending','in_progress','blocked','rejected')
  order by
    case q.status when 'in_progress' then 0 when 'pending' then 1 when 'blocked' then 2 else 3 end,
    q.priority,
    q.created_at
  limit greatest(1,least(coalesce(p_limit,50),100));
end;
$$;

revoke all on function public.gi_list_evidence_review_tasks(bigint,integer)
  from public,anon,authenticated;
grant execute on function public.gi_list_evidence_review_tasks(bigint,integer)
  to service_role,postgres;

comment on function public.gi_list_evidence_review_tasks(bigint,integer) is
  'Reviewer backlog with age, blocker reason and source readiness. Machine candidates are never verification decisions.';

do $postcheck$
declare
  v_missing_sources integer;
  v_trigger_count integer;
  v_rpc_definition text;
  v_match_definition text;
begin
  select count(*) into v_missing_sources
  from public.gi_support_measures
  where source_document_id is null;

  if v_missing_sources<>0 then
    raise exception
      'Gate B postcondition failed: % measures still lack source_document_id',
      v_missing_sources;
  end if;

  select count(*) into v_trigger_count
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal
    and n.nspname='public'
    and c.relname='gi_source_versions'
    and t.tgname='gi_00_evidence_invalidation_on_source_version';

  if v_trigger_count<>1 then
    raise exception 'Gate B postcondition failed: source-version invalidation trigger missing';
  end if;

  select pg_get_functiondef(p.oid) into v_rpc_definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='gi_list_evidence_review_tasks'
    and pg_get_function_identity_arguments(p.oid)=
      'p_reviewer_telegram_id bigint, p_limit integer';

  if position('age_seconds bigint' in v_rpc_definition)=0
     or position('blocker_reason text' in v_rpc_definition)=0
     or position('source_ready boolean' in v_rpc_definition)=0 then
    raise exception 'Gate B postcondition failed: backlog telemetry contract incomplete';
  end if;

  select pg_get_functiondef(p.oid) into v_match_definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='gi_evaluate_project_measures'
    and pg_get_function_identity_arguments(p.oid)=
      'p_project_id uuid, p_telegram_user_id bigint, p_check_id uuid';

  if position(E'when v_has_unverified then ''manual_review''' in v_match_definition)=0 then
    raise exception 'Gate B postcondition failed: unverified requirements are not fail-closed';
  end if;
end;
$postcheck$;

commit;
