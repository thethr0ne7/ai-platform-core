-- Read-only post-deploy verification for P10.
with function_state as (
  select pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'gi_evaluate_project_measures'
    and pg_get_function_identity_arguments(p.oid) =
      'p_project_id uuid, p_telegram_user_id bigint, p_check_id uuid'
), checks as (
  select
    'P10_persisted_matches_without_check'::text as check_id,
    count(*)::bigint as failures
  from public.gi_project_measure_matches
  where check_id is null

  union all

  select
    'P10_check_id_nullable',
    case when c.is_nullable = 'NO' then 0 else 1 end
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'gi_project_measure_matches'
    and c.column_name = 'check_id'

  union all

  select
    'P10_preview_branch_persists',
    case
      when position(
        E'    if p_check_id is null then\n      v_match_id := null;\n    else\n'
        in f.definition
      ) > 0 then 0
      else 1
    end
  from function_state f

  union all

  select
    'P10_linked_match_orphans',
    count(*)::bigint
  from public.gi_project_measure_matches m
  left join public.gi_project_checks c on c.id = m.check_id
  where c.id is null
)
select
  check_id,
  failures,
  case when failures = 0 then 'PASS' else 'FAIL' end as status
from checks
order by check_id;
