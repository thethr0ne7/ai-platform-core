begin;

alter table public.gi_project_checks
  add column if not exists engine_version text not null default 'legacy-unverified',
  add column if not exists source_snapshot_ids uuid[] not null default '{}'::uuid[],
  add column if not exists truth_gate_status text not null default 'unverified',
  add column if not exists created_by text not null default 'legacy',
  add column if not exists check_kind text not null default 'legacy';

alter table public.gi_project_checks
  drop constraint if exists gi_project_checks_truth_gate_status_check,
  add constraint gi_project_checks_truth_gate_status_check
    check (truth_gate_status in ('unverified','preliminary','verified','failed')),
  drop constraint if exists gi_project_checks_check_kind_check,
  add constraint gi_project_checks_check_kind_check
    check (check_kind in ('legacy','government_opportunity'));

-- Project checks are server-owned truth artifacts. Browser clients may read their
-- own rows, but all mutations must pass through the authenticated Edge pipeline.
drop policy if exists gi_checks_insert_own on public.gi_project_checks;
drop policy if exists gi_checks_update_own on public.gi_project_checks;
drop policy if exists gi_checks_delete_own on public.gi_project_checks;

revoke insert, update, delete, truncate, references, trigger
  on table public.gi_project_checks from authenticated;
grant select on table public.gi_project_checks to authenticated;

comment on column public.gi_project_checks.engine_version is
  'Version of the server-side engine that created the check.';
comment on column public.gi_project_checks.source_snapshot_ids is
  'Immutable source snapshots that support persisted intelligence outputs.';
comment on column public.gi_project_checks.truth_gate_status is
  'Result of the measure-scoped truth gate: unverified, preliminary, verified, or failed.';
comment on column public.gi_project_checks.created_by is
  'Trusted server component that created and finalized the check.';
comment on column public.gi_project_checks.check_kind is
  'Controlled check type. Legacy checks cannot feed enrichment or Decision Cards.';

commit;
