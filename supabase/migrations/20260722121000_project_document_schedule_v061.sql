begin;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='gi-project-document-processor-v061';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end $$;

select cron.schedule(
  'gi-project-document-processor-v061',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://hgivyjjethjwswjrvroy.supabase.co/functions/v1/project-document-processor',
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='gi_scheduler_token')
    ),
    body := jsonb_build_object('max_documents',4),
    timeout_milliseconds := 150000
  );
  $$
);

commit;
