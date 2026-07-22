begin;

create table if not exists public.gi_legal_ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  evidence_task_id uuid not null references public.gi_evidence_verification_queue(id) on delete cascade,
  source_document_id uuid not null references public.gi_source_documents(id) on delete cascade,
  canonical_url text not null,
  acquisition_url text,
  file_url text not null,
  language text not null default 'rus+eng',
  status text not null default 'pending',
  priority integer not null default 100,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  engine text,
  page_count integer,
  extracted_text text,
  page_text jsonb not null default '[]'::jsonb,
  confidence numeric,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(evidence_task_id),
  constraint gi_legal_ocr_jobs_status_check
    check(status in ('pending','processing','completed','failed','manual_review')),
  constraint gi_legal_ocr_jobs_attempts_check
    check(attempts>=0 and max_attempts between 1 and 10)
);

create index if not exists gi_legal_ocr_jobs_work_idx
  on public.gi_legal_ocr_jobs(status,priority,created_at);

alter table public.gi_legal_ocr_jobs enable row level security;
revoke all on table public.gi_legal_ocr_jobs from anon,authenticated;
grant all on table public.gi_legal_ocr_jobs to service_role,postgres;

create or replace function public.gi_enqueue_legal_ocr_job()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_file_url text;
  v_canonical_url text;
  v_acquisition_url text;
begin
  if new.result->>'capture_status'<>'needs_ocr' then
    return new;
  end if;

  v_file_url:=nullif(new.result->>'extraction_url','');
  v_canonical_url:=nullif(new.result->>'canonical_official_url','');
  v_acquisition_url:=nullif(new.result->>'acquisition_url','');

  if v_file_url is null or new.source_document_id is null then
    return new;
  end if;

  insert into public.gi_legal_ocr_jobs(
    evidence_task_id,source_document_id,canonical_url,acquisition_url,file_url,
    language,status,priority,metadata,updated_at
  ) values (
    new.id,new.source_document_id,coalesce(v_canonical_url,v_file_url),v_acquisition_url,v_file_url,
    'rus+eng','pending',new.priority,
    jsonb_build_object(
      'source_capture',new.result,
      'verification_policy','OCR creates draft text only; exact quote verification remains manual',
      'requested_at',now()
    ),now()
  )
  on conflict(evidence_task_id) do update set
    source_document_id=excluded.source_document_id,
    canonical_url=excluded.canonical_url,
    acquisition_url=excluded.acquisition_url,
    file_url=excluded.file_url,
    status=case when public.gi_legal_ocr_jobs.status='completed' then public.gi_legal_ocr_jobs.status else 'pending' end,
    error_message=null,
    metadata=public.gi_legal_ocr_jobs.metadata||excluded.metadata,
    updated_at=now();

  return new;
end;
$$;

drop trigger if exists gi_enqueue_legal_ocr_job on public.gi_evidence_verification_queue;
create trigger gi_enqueue_legal_ocr_job
after insert or update of result,status
on public.gi_evidence_verification_queue
for each row execute function public.gi_enqueue_legal_ocr_job();

insert into public.gi_legal_ocr_jobs(
  evidence_task_id,source_document_id,canonical_url,acquisition_url,file_url,
  language,status,priority,metadata
)
select
  q.id,q.source_document_id,
  coalesce(nullif(q.result->>'canonical_official_url',''),d.canonical_url),
  nullif(q.result->>'acquisition_url',''),
  q.result->>'extraction_url',
  'rus+eng','pending',q.priority,
  jsonb_build_object(
    'source_capture',q.result,
    'verification_policy','OCR creates draft text only; exact quote verification remains manual',
    'backfilled_at',now()
  )
from public.gi_evidence_verification_queue q
join public.gi_source_documents d on d.id=q.source_document_id
where q.result->>'capture_status'='needs_ocr'
  and nullif(q.result->>'extraction_url','') is not null
on conflict(evidence_task_id) do update set
  file_url=excluded.file_url,
  acquisition_url=excluded.acquisition_url,
  metadata=public.gi_legal_ocr_jobs.metadata||excluded.metadata,
  updated_at=now();

revoke all on function public.gi_enqueue_legal_ocr_job() from public,anon,authenticated;
grant execute on function public.gi_enqueue_legal_ocr_job() to service_role,postgres;

commit;
