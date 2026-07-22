create or replace function public.gi_trigger_official_source_ingestion(
  p_max_sources integer default 50,
  p_max_items_per_source integer default 3
)
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, pg_temp
as $$
declare
  v_token text;
  v_request_id bigint;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'gi_scheduler_token';

  if v_token is null then
    raise exception 'Scheduler token is not configured';
  end if;

  select net.http_post(
    url := 'https://hgivyjjethjwswjrvroy.supabase.co/functions/v1/official-source-ingestion',
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-scheduler-token',v_token
    ),
    body := jsonb_build_object(
      'trigger','manual',
      'max_sources',least(greatest(coalesce(p_max_sources,50),1),100),
      'max_items_per_source',least(greatest(coalesce(p_max_items_per_source,3),1),6)
    ),
    timeout_milliseconds := 150000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.gi_trigger_official_source_ingestion(integer,integer) from public, anon, authenticated;
grant execute on function public.gi_trigger_official_source_ingestion(integer,integer) to postgres, service_role;
