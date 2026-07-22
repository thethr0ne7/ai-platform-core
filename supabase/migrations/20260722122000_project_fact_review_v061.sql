begin;

alter table public.gi_project_facts
  add column if not exists source_quote text,
  add column if not exists source_locator text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_method text;

create or replace function public.gi_review_project_fact_candidate(
  p_candidate_id uuid,
  p_telegram_user_id bigint,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_candidate public.gi_project_fact_candidates;
  v_fact_id uuid;
begin
  if p_decision not in ('confirmed','rejected') then
    raise exception 'invalid_decision';
  end if;

  select * into v_candidate
  from public.gi_project_fact_candidates
  where id=p_candidate_id
    and telegram_user_id=p_telegram_user_id
  for update;

  if v_candidate.id is null then raise exception 'candidate_not_found'; end if;
  if v_candidate.status not in ('pending_confirmation','confirmed','rejected') then
    raise exception 'candidate_not_reviewable';
  end if;

  update public.gi_project_fact_candidates
  set status=p_decision,
      confirmed_at=case when p_decision='confirmed' then now() else null end,
      updated_at=now()
  where id=v_candidate.id;

  if p_decision='confirmed' then
    insert into public.gi_project_facts(
      project_id,telegram_user_id,fact_code,fact_type,value,source_type,
      source_document_id,confidence,verification_status,source_quote,
      source_locator,reviewed_at,review_method,updated_at
    ) values (
      v_candidate.project_id,v_candidate.telegram_user_id,v_candidate.fact_code,
      v_candidate.fact_type,v_candidate.value,'document',v_candidate.document_id,
      v_candidate.confidence,'verified',v_candidate.quote,v_candidate.locator,
      now(),'telegram_user_confirmation',now()
    )
    on conflict(project_id,fact_code,source_type,source_document_id)
    do update set
      fact_type=excluded.fact_type,
      value=excluded.value,
      confidence=excluded.confidence,
      verification_status='verified',
      source_quote=excluded.source_quote,
      source_locator=excluded.source_locator,
      reviewed_at=excluded.reviewed_at,
      review_method=excluded.review_method,
      updated_at=now()
    returning id into v_fact_id;
  else
    update public.gi_project_facts
    set verification_status='rejected',reviewed_at=now(),review_method='telegram_user_rejection',updated_at=now()
    where project_id=v_candidate.project_id
      and fact_code=v_candidate.fact_code
      and source_type='document'
      and source_document_id=v_candidate.document_id;
  end if;

  return jsonb_build_object(
    'candidate_id',v_candidate.id,
    'decision',p_decision,
    'fact_id',v_fact_id,
    'project_id',v_candidate.project_id
  );
end;
$$;

revoke all on function public.gi_review_project_fact_candidate(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.gi_review_project_fact_candidate(uuid,bigint,text) to service_role,postgres;

commit;
