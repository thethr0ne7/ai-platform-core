begin;

create or replace function public.gi_url_owner_key(p_url text)
returns text
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  v_normalized text := public.gi_normalize_source_url(p_url);
  v_channel text;
begin
  if public.gi_url_host(v_normalized) in ('t.me','telegram.me') then
    v_channel := substring(v_normalized from '(?i)^https://t\.me/s/([^/]+)');
    if v_channel is not null then return 't.me:' || lower(v_channel); end if;
  end if;
  return public.gi_url_host(v_normalized);
end;
$$;

create or replace function public.gi_source_owns_url(p_source_id uuid,p_url text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.gi_official_sources s
    where s.id=p_source_id
      and public.gi_url_owner_key(s.base_url)=public.gi_url_owner_key(p_url)
  ) or exists(
    select 1
    from public.gi_source_endpoints e
    where e.source_id=p_source_id
      and e.active=true
      and public.gi_url_owner_key(e.url)=public.gi_url_owner_key(p_url)
  );
$$;

create or replace function public.gi_guard_source_document_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.normalized_url:=public.gi_normalize_source_url(new.canonical_url);
  new.evidence_tier:=case
    when public.gi_url_host(new.canonical_url) in ('publication.pravo.gov.ru','regulation.gov.ru','promote.budget.gov.ru') then 'A'
    when public.gi_url_host(new.canonical_url) in ('t.me','telegram.me') then 'C'
    else 'B'
  end;

  if not public.gi_source_owns_url(new.source_id,new.canonical_url) then
    new.owner_validation_status:='rejected';
    raise exception 'source_owner_conflict: source % does not own %',new.source_id,new.canonical_url;
  end if;

  new.owner_validation_status:='verified';
  return new;
end;
$$;

drop trigger if exists gi_source_document_owner_guard on public.gi_source_documents;
create trigger gi_source_document_owner_guard
before insert or update of source_id,canonical_url on public.gi_source_documents
for each row execute function public.gi_guard_source_document_owner();

update public.gi_source_documents d
set owner_validation_status=case when public.gi_source_owns_url(d.source_id,d.canonical_url) then 'verified' else 'needs_review' end;

revoke all on function public.gi_url_owner_key(text) from public,anon,authenticated;
revoke all on function public.gi_source_owns_url(uuid,text) from public,anon,authenticated;
revoke all on function public.gi_guard_source_document_owner() from public,anon,authenticated;
grant execute on function public.gi_url_owner_key(text) to service_role,postgres;
grant execute on function public.gi_source_owns_url(uuid,text) to service_role,postgres;
grant execute on function public.gi_guard_source_document_owner() to service_role,postgres;

commit;
