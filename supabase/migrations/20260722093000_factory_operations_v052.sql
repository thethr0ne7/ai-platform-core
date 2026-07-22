begin;

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  project_key text not null default 'ai-platform-core',
  workflow_key text not null,
  stage text not null check (stage in (
    'clarify', 'plan', 'architect', 'produce', 'validate',
    'repair', 'observe', 'save', 'ship', 'learn'
  )),
  status text not null default 'queued' check (status in (
    'queued', 'running', 'blocked', 'failed', 'completed', 'cancelled'
  )),
  progress smallint not null default 0 check (progress between 0 and 100),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_runs_project_created_idx
  on public.workflow_runs (project_key, created_at desc);
create index if not exists workflow_runs_status_stage_idx
  on public.workflow_runs (status, stage);

create table if not exists public.ui_reviews (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  component_path text not null,
  status text not null default 'pending' check (status in ('pending', 'pass', 'warning', 'fail')),
  score numeric(5,2) check (score between 0 and 100),
  findings jsonb not null default '[]'::jsonb,
  reviewer text not null default 'ui-quality-gate',
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists ui_reviews_component_reviewed_idx
  on public.ui_reviews (component_path, reviewed_at desc);
create index if not exists ui_reviews_status_idx
  on public.ui_reviews (status);

create table if not exists public.production_artifacts (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  artifact_type text not null,
  storage_uri text,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists production_artifacts_run_created_idx
  on public.production_artifacts (workflow_run_id, created_at desc);
create index if not exists production_artifacts_type_idx
  on public.production_artifacts (artifact_type);

create table if not exists public.factory_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_key text not null default 'ai-platform-core',
  status text not null check (status in ('healthy', 'degraded', 'critical', 'unknown')),
  checks jsonb not null default '{}'::jsonb,
  source text not null default 'factory-health-gate',
  created_at timestamptz not null default now()
);

create index if not exists factory_health_project_created_idx
  on public.factory_health_snapshots (project_key, created_at desc);

alter table public.workflow_runs enable row level security;
alter table public.ui_reviews enable row level security;
alter table public.production_artifacts enable row level security;
alter table public.factory_health_snapshots enable row level security;

drop policy if exists "authenticated_read_workflow_runs" on public.workflow_runs;
create policy "authenticated_read_workflow_runs"
  on public.workflow_runs for select
  to authenticated
  using (true);

drop policy if exists "authenticated_read_ui_reviews" on public.ui_reviews;
create policy "authenticated_read_ui_reviews"
  on public.ui_reviews for select
  to authenticated
  using (true);

drop policy if exists "authenticated_read_production_artifacts" on public.production_artifacts;
create policy "authenticated_read_production_artifacts"
  on public.production_artifacts for select
  to authenticated
  using (true);

drop policy if exists "authenticated_read_factory_health" on public.factory_health_snapshots;
create policy "authenticated_read_factory_health"
  on public.factory_health_snapshots for select
  to authenticated
  using (true);

comment on table public.workflow_runs is 'Stateful AI Factory workflow executions.';
comment on table public.ui_reviews is 'UI quality-gate results for components and pages.';
comment on table public.production_artifacts is 'Versioned artifacts produced by factory workflows.';
comment on table public.factory_health_snapshots is 'Point-in-time operational health snapshots.';

commit;
