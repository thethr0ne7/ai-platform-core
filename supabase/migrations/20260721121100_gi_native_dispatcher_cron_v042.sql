begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.gi_dispatch_crawl_jobs(p_limit integer default 5)
returns integer
language plpgsql
security definer
set search_path=public,net
as $$
declare r record; v_request_id bigint; v_count integer:=0;
begin
  for r in
    select j.id,e.url
    from public.gi_crawl_jobs j
    join public.gi_source_endpoints e on e.id=j.endpoint_id and e.active=true
    where j.status in ('pending','retry') and j.scheduled_at<=now()
      and j.attempts<j.max_attempts
      and (j.locked_at is null or j.locked_at<now()-interval '20 minutes')
    order by j.priority,j.scheduled_at,j.created_at
    for update of j skip locked
    limit greatest(1,least(coalesce(p_limit,5),20))
  loop
    v_request_id:=net.http_get(
      url:=r.url,
      headers:=jsonb_build_object('User-Agent','GovernmentIntelligenceBot/0.42','Accept','text/html,text/plain,application/json;q=0.9,*/*;q=0.1'),
      timeout_milliseconds:=45000
    );
    update public.gi_crawl_jobs
    set status='running',attempts=attempts+1,locked_at=now(),locked_by='pg_net_native_worker',
        started_at=coalesce(started_at,now()),
        payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object('request_id',v_request_id,'endpoint_url',r.url,'dispatched_at',now()),
        updated_at=now()
    where id=r.id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.gi_collect_crawl_results(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path=public,net
as $$
declare r record; v_done integer:=0;
begin
  for r in
    select j.id
    from public.gi_crawl_jobs j
    join net._http_response h on h.id=(j.payload->>'request_id')::bigint
    where j.status='running'
    order by h.created
    limit greatest(1,least(coalesce(p_limit,20),100))
  loop
    perform public.gi_process_crawl_response_basic(r.id);
    v_done:=v_done+1;
  end loop;
  return jsonb_build_object('processed',v_done);
end;
$$;

create or replace function public.gi_recover_stale_crawl_jobs()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_count integer;
begin
  update public.gi_crawl_jobs
  set status=case when attempts>=max_attempts then 'dead_letter' else 'retry' end,
      last_error=coalesce(last_error,'stale_worker_lock'),scheduled_at=now()+interval '15 minutes',
      locked_at=null,locked_by=null,updated_at=now()
  where status='running' and locked_at<now()-interval '30 minutes';
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function public.gi_reschedule_due_crawl_jobs()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_count integer;
begin
  update public.gi_crawl_jobs j
  set status='pending',scheduled_at=now(),started_at=null,finished_at=null,
      locked_at=null,locked_by=null,last_error=null,updated_at=now()
  from public.gi_official_sources s
  where s.id=j.source_id and j.status='succeeded' and j.finished_at is not null
    and j.finished_at+make_interval(mins=>greatest(15,coalesce(s.cadence_minutes,1440)))<=now();
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.gi_dispatch_crawl_jobs(integer) from public,anon,authenticated;
revoke all on function public.gi_collect_crawl_results(integer) from public,anon,authenticated;
revoke all on function public.gi_recover_stale_crawl_jobs() from public,anon,authenticated;
revoke all on function public.gi_reschedule_due_crawl_jobs() from public,anon,authenticated;
grant execute on function public.gi_dispatch_crawl_jobs(integer) to service_role,postgres;
grant execute on function public.gi_collect_crawl_results(integer) to service_role,postgres;
grant execute on function public.gi_recover_stale_crawl_jobs() to service_role,postgres;
grant execute on function public.gi_reschedule_due_crawl_jobs() to service_role,postgres;

update public.gi_crawl_jobs j
set priority=s.priority+case s.level when 'federal' then 0 when 'regional' then 1000 else 2000 end,updated_at=now()
from public.gi_official_sources s
where s.id=j.source_id;

select cron.schedule('gi-dispatch-crawl-v042','*/5 * * * *',$cron$select public.gi_dispatch_crawl_jobs(5);$cron$);
select cron.schedule('gi-collect-crawl-v042','*/2 * * * *',$cron$select public.gi_collect_crawl_results(25);$cron$);
select cron.schedule('gi-recover-stale-v042','*/15 * * * *',$cron$select public.gi_recover_stale_crawl_jobs();$cron$);
select cron.schedule('gi-reschedule-due-v042','*/15 * * * *',$cron$select public.gi_reschedule_due_crawl_jobs();$cron$);
commit;
