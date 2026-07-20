begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists supabase_vault with schema vault;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.gi_scheduler_tokens (
  id text primary key,
  token_hash text not null,
  active boolean not null default true,
  rotated_at timestamptz not null default now()
);

create table if not exists public.gi_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null check (trigger_type in ('scheduled', 'manual')),
  status text not null check (status in ('running', 'completed', 'completed_with_errors', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  sources_processed integer not null default 0,
  discovered_count integer not null default 0,
  persisted_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists gi_ingestion_runs_started_at_v038_idx
  on public.gi_ingestion_runs (started_at desc);

alter table public.gi_ingestion_runs enable row level security;
revoke all on table public.gi_ingestion_runs from anon, authenticated;
grant all on table public.gi_ingestion_runs to service_role;

create or replace function public.gi_verify_scheduler_token(p_token_hash text)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from private.gi_scheduler_tokens
    where id = 'official-source-ingestion'
      and active = true
      and token_hash = p_token_hash
  );
$$;

revoke all on function public.gi_verify_scheduler_token(text) from public, anon, authenticated;
grant execute on function public.gi_verify_scheduler_token(text) to service_role;

do $$
declare
  v_token text;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'gi_scheduler_token'
  order by created_at desc
  limit 1;

  if v_token is null then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(v_token, 'gi_scheduler_token', 'Internal token for official-source-ingestion cron');
  end if;

  insert into private.gi_scheduler_tokens (id, token_hash, active, rotated_at)
  values ('official-source-ingestion', encode(extensions.digest(v_token, 'sha256'), 'hex'), true, now())
  on conflict (id) do update set
    token_hash = excluded.token_hash,
    active = true,
    rotated_at = now();
end;
$$;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'gi_project_url') then
    perform vault.create_secret(
      'https://hgivyjjethjwswjrvroy.supabase.co',
      'gi_project_url',
      'Supabase project URL for internal cron invocations'
    );
  end if;

  if not exists (select 1 from vault.decrypted_secrets where name = 'gi_anon_jwt') then
    perform vault.create_secret(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnaXZ5ampldGhqd3N3anJ2cm95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNzg0MzQsImV4cCI6MjA5Nzg1NDQzNH0.i1m3RXOR00UMscuvjGiWxrGHbu3iT3KtgTOKbJ6P9FE',
      'gi_anon_jwt',
      'Public JWT used only to pass Edge Function gateway verification'
    );
  end if;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'official-source-ingestion-v038';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end;
$$;

select cron.schedule(
  'official-source-ingestion-v038',
  '17 */6 * * *',
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'gi_project_url' order by created_at desc limit 1
      ) || '/functions/v1/official-source-ingestion',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'gi_anon_jwt' order by created_at desc limit 1
        ),
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'gi_anon_jwt' order by created_at desc limit 1
        ),
        'x-scheduler-token', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'gi_scheduler_token' order by created_at desc limit 1
        )
      ),
      body := jsonb_build_object(
        'trigger', 'scheduled',
        'max_sources', 10,
        'max_items_per_source', 12,
        'scheduled_at', now()
      ),
      timeout_milliseconds := 10000
    ) as request_id;
  $cron$
);

commit;
