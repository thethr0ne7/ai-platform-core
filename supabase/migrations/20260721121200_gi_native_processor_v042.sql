begin;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.gi_clean_http_content(p_content text,p_content_type text)
returns text
language plpgsql
immutable
set search_path=public
as $$
declare v_text text;
begin
  v_text:=coalesce(p_content,'');
  if coalesce(p_content_type,'')~*'text/html' then
    v_text:=regexp_replace(v_text,'<br\s*/?>',E'\n','gi');
    v_text:=regexp_replace(v_text,'</(p|div|li|h[1-6]|tr|section|article)>',E'\n','gi');
    v_text:=regexp_replace(v_text,'<[^>]+>',' ','g');
  end if;
  v_text:=replace(replace(replace(replace(v_text,'&nbsp;',' '),'&amp;','&'),'&quot;','"'),'&#39;','''');
  v_text:=regexp_replace(v_text,'[\t\f\v ]+',' ','g');
  v_text:=regexp_replace(v_text,E' *\n *',E'\n','g');
  v_text:=regexp_replace(v_text,E'\n{3,}',E'\n\n','g');
  return btrim(v_text);
end;
$$;

create or replace function public.gi_extract_html_title(p_content text,p_fallback text)
returns text
language plpgsql
immutable
set search_path=public
as $$
declare v_title text;
begin
  v_title:=substring(regexp_replace(coalesce(p_content,''),'[\s\S]*?<title[^>]*>([\s\S]*?)</title>[\s\S]*','\1','i') for 500);
  if v_title is null or v_title='' or v_title=p_content then return p_fallback; end if;
  return public.gi_clean_http_content(v_title,'text/html');
end;
$$;

create or replace function public.gi_process_crawl_response_basic(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,net,extensions
as $$
declare r record; v_text text; v_hash text; v_saved jsonb; v_status text;
begin
  select j.id job_id,j.source_id,j.endpoint_id,j.attempts,j.max_attempts,
         s.source_key,s.name source_name,s.authority,
         e.url,h.status_code,h.content_type,h.content,h.timed_out,h.error_msg
  into r
  from public.gi_crawl_jobs j
  join public.gi_official_sources s on s.id=j.source_id
  left join public.gi_source_endpoints e on e.id=j.endpoint_id
  join net._http_response h on h.id=(j.payload->>'request_id')::bigint
  where j.id=p_job_id and j.status='running';

  if r.job_id is null then return jsonb_build_object('status','not_ready'); end if;

  begin
    if coalesce(r.timed_out,false) or r.error_msg is not null or r.status_code not between 200 and 299 then
      raise exception 'fetch_failed';
    end if;
    v_text:=public.gi_clean_http_content(r.content,r.content_type);
    if length(v_text)<100 then raise exception 'content_too_short'; end if;
    v_hash:=encode(extensions.digest(v_text,'sha256'),'hex');
    v_saved:=public.gi_persist_source_evidence(jsonb_build_object(
      'source_id',r.source_key,
      'canonical_url',r.url,
      'title',public.gi_extract_html_title(r.content,r.source_name),
      'authority',r.authority,
      'checked_at',now(),
      'content_hash',v_hash,
      'extracted_text',v_text,
      'extraction_method',case when r.content_type~*'text/html' then 'html_sql' else 'native_sql' end,
      'citations',jsonb_build_array(jsonb_build_object('locator','body','quote',left(v_text,700))),
      'metadata',jsonb_build_object('ingestion_runtime','supabase-native-worker-v0.42','http_status',r.status_code,'content_type',r.content_type,'crawl_job_id',r.job_id)
    ));
    update public.gi_crawl_jobs
    set status='succeeded',result=v_saved,finished_at=now(),locked_at=null,locked_by=null,last_error=null,updated_at=now()
    where id=p_job_id;
    update public.gi_source_endpoints set last_checked_at=now(),last_success_at=now(),updated_at=now() where id=r.endpoint_id;
    update public.gi_official_sources set last_checked_at=now(),last_success_at=now(),status='active',updated_at=now() where id=r.source_id;
    return v_saved||jsonb_build_object('status','succeeded');
  exception when others then
    v_status:=case when r.attempts>=r.max_attempts then 'dead_letter' else 'retry' end;
    update public.gi_crawl_jobs
    set status=v_status,last_error=left(sqlerrm,4000),scheduled_at=case when v_status='retry' then now()+interval '15 minutes' else scheduled_at end,
        finished_at=case when v_status='dead_letter' then now() else null end,locked_at=null,locked_by=null,updated_at=now()
    where id=p_job_id;
    update public.gi_official_sources set last_checked_at=now(),status='degraded',updated_at=now() where id=r.source_id;
    return jsonb_build_object('status',v_status,'error',sqlerrm);
  end;
end;
$$;

revoke all on function public.gi_clean_http_content(text,text) from public,anon,authenticated;
revoke all on function public.gi_extract_html_title(text,text) from public,anon,authenticated;
revoke all on function public.gi_process_crawl_response_basic(uuid) from public,anon,authenticated;
grant execute on function public.gi_clean_http_content(text,text) to service_role,postgres;
grant execute on function public.gi_extract_html_title(text,text) to service_role,postgres;
grant execute on function public.gi_process_crawl_response_basic(uuid) to service_role,postgres;
commit;
