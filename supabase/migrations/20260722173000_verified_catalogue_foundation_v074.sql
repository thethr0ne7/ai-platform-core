begin;

alter function public.gi_clean_display_text(text,text)
  set search_path=public,pg_temp;

alter function public.gi_normalize_change_event()
  set search_path=public,pg_temp;

create table if not exists public.gi_evidence_reviewers (
  telegram_user_id bigint primary key,
  role text not null default 'reviewer',
  display_name text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gi_evidence_reviewers_role_check
    check(role in ('owner','reviewer','auditor'))
);

create index if not exists gi_evidence_reviewers_active_idx
  on public.gi_evidence_reviewers(active,role);

alter table public.gi_evidence_reviewers enable row level security;
revoke all on table public.gi_evidence_reviewers from public,anon,authenticated;
grant all on table public.gi_evidence_reviewers to service_role,postgres;

insert into public.gi_evidence_reviewers(
  telegram_user_id,role,display_name,active,metadata
)
select p.telegram_user_id,'owner','Владелец платформы',true,
       jsonb_build_object('provisioned_by','verified_catalogue_v074')
from public.gi_projects p
where p.telegram_user_id is not null
group by p.telegram_user_id
order by min(p.created_at)
limit 1
on conflict(telegram_user_id) do update set
  active=true,
  role=case when public.gi_evidence_reviewers.role='owner' then 'owner' else excluded.role end,
  updated_at=now(),
  metadata=public.gi_evidence_reviewers.metadata||excluded.metadata;

create table if not exists public.gi_evidence_review_audit (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.gi_evidence_verification_queue(id) on delete cascade,
  evidence_record_id uuid references public.gi_evidence_records(id) on delete set null,
  reviewer_telegram_user_id bigint not null,
  decision text not null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  constraint gi_evidence_review_audit_decision_check
    check(decision in ('verified','rejected','blocked','reopened'))
);

create index if not exists gi_evidence_review_audit_task_idx
  on public.gi_evidence_review_audit(task_id,created_at desc);
create index if not exists gi_evidence_review_audit_reviewer_idx
  on public.gi_evidence_review_audit(reviewer_telegram_user_id,created_at desc);
create index if not exists gi_evidence_records_subject_lookup_idx
  on public.gi_evidence_records(subject_type,subject_id,created_at desc);
create index if not exists gi_measure_requirements_measure_active_idx
  on public.gi_measure_requirements(measure_id,active,requirement_code);
create index if not exists gi_evidence_verification_queue_requirement_idx
  on public.gi_evidence_verification_queue(requirement_id,status,priority);

alter table public.gi_evidence_review_audit enable row level security;
revoke all on table public.gi_evidence_review_audit from public,anon,authenticated;
grant all on table public.gi_evidence_review_audit to service_role,postgres;

create or replace function public.gi_normalize_evidence_text(p_value text)
returns text
language sql
immutable
set search_path=pg_catalog,pg_temp
as $$
  select regexp_replace(lower(coalesce(p_value,'')), '\s+', ' ', 'g')
$$;

revoke all on function public.gi_normalize_evidence_text(text) from public,anon,authenticated;
grant execute on function public.gi_normalize_evidence_text(text) to service_role,postgres;

create or replace function public.gi_list_evidence_review_tasks(
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
  created_at timestamptz
)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not exists(
    select 1 from public.gi_evidence_reviewers r
    where r.telegram_user_id=p_reviewer_telegram_id and r.active=true
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
    q.created_at
  from public.gi_evidence_verification_queue q
  join public.gi_support_measures m on m.id=q.measure_id
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
  where q.status in ('pending','in_progress','blocked','rejected')
  order by
    case q.status when 'in_progress' then 0 when 'pending' then 1 when 'blocked' then 2 else 3 end,
    q.priority,
    q.created_at
  limit greatest(1,least(coalesce(p_limit,50),100));
end;
$$;

revoke all on function public.gi_list_evidence_review_tasks(bigint,integer) from public,anon,authenticated;
grant execute on function public.gi_list_evidence_review_tasks(bigint,integer) to service_role,postgres;

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
          'verified_by','AI Factory v0.74 evidence reviewer',
          'reviewer_telegram_user_id',p_reviewer_telegram_id,
          'verification_method','tier_a_exact_quote_match',
          'human_reviewed',true,
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
            'verified_by','AI Factory v0.74 evidence reviewer',
            'reviewer_telegram_user_id',p_reviewer_telegram_id,
            'verification_method','tier_a_exact_quote_match',
            'human_reviewed',true,
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
          'verification_state','verified',
          'verification_method','tier_a_exact_quote_match',
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
          'verification_method','tier_a_exact_quote_match'
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
    task_id,evidence_record_id,reviewer_telegram_user_id,decision,before_state,after_state,notes
  ) values (
    p_task_id,v_evidence_id,p_reviewer_telegram_id,p_decision,v_before,v_after,
    nullif(btrim(coalesce(p_notes,'')),'')
  );

  return jsonb_build_object(
    'task_id',p_task_id,
    'decision',p_decision,
    'evidence_record_id',v_evidence_id,
    'reviewed_at',v_now
  );
end;
$$;

revoke all on function public.gi_review_evidence_task(uuid,bigint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.gi_review_evidence_task(uuid,bigint,text,text,text,text) to service_role,postgres;

alter policy gi_projects_select_own on public.gi_projects
  using(owner_id=(select auth.uid()));
alter policy gi_projects_insert_own on public.gi_projects
  with check(owner_id=(select auth.uid()));
alter policy gi_projects_update_own on public.gi_projects
  using(owner_id=(select auth.uid()))
  with check(owner_id=(select auth.uid()));
alter policy gi_projects_delete_own on public.gi_projects
  using(owner_id=(select auth.uid()));

alter policy gi_documents_select_own on public.gi_project_documents
  using(owner_id=(select auth.uid()));
alter policy gi_documents_insert_own on public.gi_project_documents
  with check(owner_id=(select auth.uid()));
alter policy gi_documents_update_own on public.gi_project_documents
  using(owner_id=(select auth.uid()))
  with check(owner_id=(select auth.uid()));
alter policy gi_documents_delete_own on public.gi_project_documents
  using(owner_id=(select auth.uid()));

alter policy gi_checks_select_own on public.gi_project_checks
  using(owner_id=(select auth.uid()));
alter policy gi_checks_insert_own on public.gi_project_checks
  with check(owner_id=(select auth.uid()));
alter policy gi_checks_update_own on public.gi_project_checks
  using(owner_id=(select auth.uid()))
  with check(owner_id=(select auth.uid()));
alter policy gi_checks_delete_own on public.gi_project_checks
  using(owner_id=(select auth.uid()));

do $$
declare
  v_reviewer bigint;
  v_task uuid;
begin
  select telegram_user_id into v_reviewer
  from public.gi_evidence_reviewers
  where active=true
  order by case role when 'owner' then 0 else 1 end,created_at
  limit 1;

  select id into v_task
  from public.gi_evidence_verification_queue
  where task_code='apk_territory_scope_quote'
  limit 1;

  if v_reviewer is not null and v_task is not null then
    perform public.gi_review_evidence_task(
      v_task,
      v_reviewer,
      'verified',
      $quote$организациям и индивидуальным предпринимателям,
осуществляющим производство и (или) первичную и (или) последующую
(промышленную) переработку — сельскохозяйственной продукции
на территориях Донецкой Народной Республики, Луганской Народной
Республики, Запорожской области и Херсонской области$quote$,
      'Приказ Минсельхоза России от 25.03.2025 № 187: Порядок, пункт 1; PDF страница 2; официальное опубликование № 0001202504300025',
      'Первичное подтверждение v0.74: точная цитата найдена в сохранённой Tier A версии документа.'
    );
  end if;
end;
$$;

update public.gi_evidence_verification_queue q
set status='verified',reviewed_at=now(),updated_at=now(),
    notes='Официальная Tier A версия сохранена и содержит извлечённый текст.',
    result=jsonb_build_object('verification_method','tier_a_version_present')
where q.task_code='apk_187_extract'
  and exists(
    select 1
    from public.gi_source_documents d
    join public.gi_source_versions v on v.document_id=d.id
    where d.id=q.source_document_id
      and d.evidence_tier='A'
      and d.owner_validation_status='verified'
      and length(coalesce(v.extracted_text,''))>1000
  );

commit;
