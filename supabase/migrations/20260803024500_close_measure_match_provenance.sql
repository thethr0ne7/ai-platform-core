begin;

-- P10 repair: preview evaluations may calculate results, but persisted matches
-- must always belong to an exact project check.
do $repair$
declare
  v_orphan_count integer;
  v_known_orphan_count integer;
  v_duplicate_count integer;
  v_deleted_count integer;
  v_function_definition text;
  v_null_branch_start integer;
  v_else_relative integer;
  v_null_branch text;
  v_rewritten_definition text;
  v_orphan_ids constant uuid[] := array[
    '80c271b2-2074-4522-b34f-ab7caae0edf0'::uuid,
    '596349eb-fe0a-47b4-b593-ec2ccebd37f7'::uuid,
    '8c2ecd82-4f84-4e75-9cb8-95b6c9bdfa94'::uuid,
    '470842a6-48c9-463e-a26a-2b230af9789b'::uuid
  ];
begin
  select count(*) into v_orphan_count
  from public.gi_project_measure_matches
  where check_id is null;

  select count(*) into v_known_orphan_count
  from public.gi_project_measure_matches
  where check_id is null
    and id = any(v_orphan_ids);

  if v_orphan_count <> 4 or v_known_orphan_count <> 4 then
    raise exception
      'P10 precondition failed: expected exactly four known orphan matches, found total %, known %',
      v_orphan_count,
      v_known_orphan_count;
  end if;

  select count(*) into v_duplicate_count
  from public.gi_project_measure_matches orphan
  where orphan.check_id is null
    and orphan.id = any(v_orphan_ids)
    and exists (
      select 1
      from public.gi_project_measure_matches linked
      where linked.check_id is not null
        and linked.project_id = orphan.project_id
        and linked.measure_id = orphan.measure_id
        and linked.telegram_user_id = orphan.telegram_user_id
        and linked.eligibility_status = orphan.eligibility_status
        and linked.score is not distinct from orphan.score
        and linked.matched_requirements = orphan.matched_requirements
        and linked.blockers = orphan.blockers
        and linked.missing_data = orphan.missing_data
        and linked.rationale = orphan.rationale
    );

  if v_duplicate_count <> 4 then
    raise exception
      'P10 precondition failed: only % of four orphan rows have a semantic check-linked duplicate',
      v_duplicate_count;
  end if;

  select pg_get_functiondef(p.oid)
  into v_function_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'gi_evaluate_project_measures'
    and pg_get_function_identity_arguments(p.oid) =
      'p_project_id uuid, p_telegram_user_id bigint, p_check_id uuid';

  if v_function_definition is null then
    raise exception 'P10 precondition failed: gi_evaluate_project_measures definition not found';
  end if;

  v_null_branch_start := strpos(
    v_function_definition,
    E'    if p_check_id is null then\n'
  );

  if v_null_branch_start = 0 then
    raise exception 'P10 precondition failed: expected null-check branch not found';
  end if;

  v_else_relative := strpos(
    substring(v_function_definition from v_null_branch_start),
    E'    else\n'
  );

  if v_else_relative = 0 then
    raise exception 'P10 precondition failed: persistence branch boundary not found';
  end if;

  v_null_branch := substring(
    v_function_definition
    from v_null_branch_start
    for v_else_relative - 1
  );

  if strpos(v_null_branch, 'insert into public.gi_project_measure_matches') = 0 then
    raise exception 'P10 precondition failed: null branch no longer matches the known persistence defect';
  end if;

  -- Preserve calculation semantics for preview mode but perform no persistence.
  v_rewritten_definition :=
    substring(v_function_definition from 1 for v_null_branch_start - 1)
    || E'    if p_check_id is null then\n      v_match_id := null;\n'
    || substring(
      v_function_definition
      from v_null_branch_start + v_else_relative - 1
    );

  execute v_rewritten_definition;

  delete from public.gi_project_measure_matches orphan
  where orphan.check_id is null
    and orphan.id = any(v_orphan_ids)
    and exists (
      select 1
      from public.gi_project_measure_matches linked
      where linked.check_id is not null
        and linked.project_id = orphan.project_id
        and linked.measure_id = orphan.measure_id
        and linked.telegram_user_id = orphan.telegram_user_id
        and linked.eligibility_status = orphan.eligibility_status
        and linked.score is not distinct from orphan.score
        and linked.matched_requirements = orphan.matched_requirements
        and linked.blockers = orphan.blockers
        and linked.missing_data = orphan.missing_data
        and linked.rationale = orphan.rationale
    );

  get diagnostics v_deleted_count = row_count;

  if v_deleted_count <> 4 then
    raise exception
      'P10 cleanup failed: expected to delete four proven orphan duplicates, deleted %',
      v_deleted_count;
  end if;
end;
$repair$;

alter table public.gi_project_measure_matches
  alter column check_id set not null;

comment on column public.gi_project_measure_matches.check_id is
  'Required provenance link. Preview eligibility evaluation returns calculated rows without persisting them.';

do $postcheck$
declare
  v_null_count integer;
  v_is_nullable text;
  v_function_definition text;
begin
  select count(*) into v_null_count
  from public.gi_project_measure_matches
  where check_id is null;

  if v_null_count <> 0 then
    raise exception 'P10 postcondition failed: % persisted matches still lack check_id', v_null_count;
  end if;

  select is_nullable into v_is_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'gi_project_measure_matches'
    and column_name = 'check_id';

  if v_is_nullable is distinct from 'NO' then
    raise exception 'P10 postcondition failed: check_id is still nullable';
  end if;

  select pg_get_functiondef(p.oid)
  into v_function_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'gi_evaluate_project_measures'
    and pg_get_function_identity_arguments(p.oid) =
      'p_project_id uuid, p_telegram_user_id bigint, p_check_id uuid';

  if strpos(
    v_function_definition,
    E'    if p_check_id is null then\n      v_match_id := null;\n    else\n'
  ) = 0 then
    raise exception 'P10 postcondition failed: preview branch is not read-only';
  end if;
end;
$postcheck$;

commit;
