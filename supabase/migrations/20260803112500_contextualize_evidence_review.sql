begin;

-- Incident repair: reviewer cards must never receive the same arbitrary
-- first 6000 characters for unrelated requirements. Quote tasks expose only
-- a bounded context around an exact candidate quote. Missing or unmatched
-- candidates fail closed.
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
  source_ready boolean,
  source_text_total_length bigint,
  source_excerpt_start bigint,
  source_excerpt_end bigint,
  source_excerpt_strategy text,
  candidate_quote_found boolean,
  verification_ready boolean
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
  with task_source as (
    select
      q.id,
      q.task_code,
      q.task_type,
      q.title,
      q.status,
      q.priority,
      q.notes,
      q.created_at,
      m.code as measure_code,
      m.title as measure_title,
      req.requirement_code,
      req.description as requirement_description,
      req.expected_value,
      req.evidence_quote,
      coalesce(req.source_locator,m.source_locator,q.expected_document) as source_locator,
      doc.id as document_id,
      doc.title as document_title,
      doc.canonical_url,
      doc.evidence_tier,
      doc.owner_validation_status,
      ver.id as version_id,
      coalesce(ver.extracted_text,'') as extracted_text,
      length(coalesce(ver.extracted_text,''))::bigint as total_length,
      case
        when length(btrim(coalesce(req.evidence_quote,'')))>=40
          then strpos(coalesce(ver.extracted_text,''),req.evidence_quote)::bigint
        else 0::bigint
      end as quote_position,
      length(coalesce(req.evidence_quote,''))::bigint as quote_length
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
  ), contextualized as (
    select
      s.*,
      case
        when s.task_type='quote_locator' and s.quote_position>0
          then greatest(1::bigint,s.quote_position-900)
        when s.task_type<>'quote_locator' and s.total_length>=20
          then 1::bigint
        else null::bigint
      end as excerpt_start,
      case
        when s.task_type='quote_locator' and s.quote_position>0
          then least(s.total_length,s.quote_position+s.quote_length+1800)
        when s.task_type<>'quote_locator' and s.total_length>=20
          then least(s.total_length,2000::bigint)
        else null::bigint
      end as excerpt_end
    from task_source s
  )
  select
    c.id,
    c.task_code,
    c.task_type,
    c.title,
    c.status,
    c.priority,
    c.notes,
    c.measure_code,
    c.measure_title,
    c.requirement_code,
    c.requirement_description,
    c.expected_value,
    nullif(c.evidence_quote,''),
    nullif(c.source_locator,''),
    c.document_title,
    c.canonical_url,
    c.evidence_tier,
    c.owner_validation_status,
    c.version_id,
    case
      when c.excerpt_start is not null and c.excerpt_end is not null
        then substring(
          c.extracted_text
          from c.excerpt_start::integer
          for greatest(0,(c.excerpt_end-c.excerpt_start+1))::integer
        )
      else ''::text
    end,
    c.created_at,
    greatest(0,extract(epoch from (now()-c.created_at))::bigint),
    case
      when c.status='blocked' and nullif(btrim(coalesce(c.notes,'')),'') is not null then c.notes
      when c.document_id is null then 'source_document_missing'
      when c.evidence_tier is distinct from 'A' then 'source_tier_not_a'
      when c.owner_validation_status is distinct from 'verified' then 'source_owner_not_verified'
      when c.version_id is null then 'source_version_missing'
      when c.total_length<20 then 'source_text_missing'
      when c.task_type='quote_locator'
       and length(btrim(coalesce(c.evidence_quote,'')))<40 then 'candidate_quote_missing'
      when c.task_type='quote_locator'
       and c.quote_position=0 then 'candidate_quote_not_found'
      when c.task_type='quote_locator'
       and length(btrim(coalesce(c.source_locator,'')))<8 then 'candidate_locator_missing'
      else null
    end,
    (
      c.document_id is not null
      and c.evidence_tier='A'
      and c.owner_validation_status='verified'
      and c.version_id is not null
      and c.total_length>=20
    ),
    c.total_length,
    c.excerpt_start,
    c.excerpt_end,
    case
      when c.task_type='quote_locator' and c.quote_position>0 then 'candidate_quote_context'
      when c.task_type='quote_locator' then 'withheld_until_candidate_quote_matches'
      when c.excerpt_start is not null then 'source_task_preview'
      else 'no_saved_source_text'
    end,
    (c.task_type='quote_locator' and c.quote_position>0),
    (
      c.task_type='quote_locator'
      and c.document_id is not null
      and c.evidence_tier='A'
      and c.owner_validation_status='verified'
      and c.version_id is not null
      and c.total_length>=20
      and length(btrim(coalesce(c.evidence_quote,'')))>=40
      and c.quote_position>0
      and length(btrim(coalesce(c.source_locator,'')))>=8
    )
  from contextualized c
  order by
    case c.status when 'in_progress' then 0 when 'pending' then 1 when 'blocked' then 2 else 3 end,
    c.priority,
    c.created_at
  limit greatest(1,least(coalesce(p_limit,50),100));
end;
$$;

revoke all on function public.gi_list_evidence_review_tasks(bigint,integer)
  from public,anon,authenticated;
grant execute on function public.gi_list_evidence_review_tasks(bigint,integer)
  to service_role,postgres;

comment on function public.gi_list_evidence_review_tasks(bigint,integer) is
  'Reviewer backlog with quote-specific source context. Quote tasks fail closed when the candidate quote or locator is missing or the quote is not found in the saved version.';

do $postcheck$
declare
  v_definition text;
  v_territory_excerpt text;
  v_territory_quote text;
  v_territory_ready boolean;
  v_missing_quote_excerpts integer;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='gi_list_evidence_review_tasks'
    and pg_get_function_identity_arguments(p.oid)=
      'p_reviewer_telegram_id bigint, p_limit integer';

  if position('verification_ready boolean' in v_definition)=0
     or position('candidate_quote_found boolean' in v_definition)=0
     or position('left(coalesce(ver.extracted_text,''''),6000)' in v_definition)>0 then
    raise exception 'Reviewer context contract was not installed correctly';
  end if;

  select
    t.source_text_excerpt,
    t.candidate_quote,
    t.verification_ready
  into v_territory_excerpt,v_territory_quote,v_territory_ready
  from public.gi_evidence_reviewers r
  cross join lateral public.gi_list_evidence_review_tasks(r.telegram_user_id,100) t
  where r.active=true
    and t.task_code='apk_territory_scope_quote'
  limit 1;

  if v_territory_quote is not null then
    if position(v_territory_quote in coalesce(v_territory_excerpt,''))=0 then
      raise exception 'Territory quote context does not contain its candidate quote';
    end if;
    if v_territory_ready is distinct from true then
      raise exception 'Territory quote should be verification-ready';
    end if;
  end if;

  select count(*) into v_missing_quote_excerpts
  from public.gi_evidence_reviewers r
  cross join lateral public.gi_list_evidence_review_tasks(r.telegram_user_id,100) t
  where r.active=true
    and t.task_type='quote_locator'
    and length(btrim(coalesce(t.candidate_quote,'')))<40
    and length(coalesce(t.source_text_excerpt,''))>0;

  if v_missing_quote_excerpts<>0 then
    raise exception 'Quote tasks without candidates still expose source text';
  end if;
end;
$postcheck$;

commit;
