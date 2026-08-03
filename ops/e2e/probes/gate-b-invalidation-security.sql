-- Read-only post-deploy probe for the Gate B invalidation security boundary.
with state as (
  select
    coalesce((
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public'
        and c.relname='gi_evidence_invalidation_audit'
    ),false) as rls_enabled,
    has_table_privilege('anon','public.gi_evidence_invalidation_audit','SELECT') as anon_select,
    has_table_privilege('anon','public.gi_evidence_invalidation_audit','INSERT') as anon_insert,
    has_table_privilege('authenticated','public.gi_evidence_invalidation_audit','SELECT') as authenticated_select,
    has_table_privilege('authenticated','public.gi_evidence_invalidation_audit','INSERT') as authenticated_insert,
    has_table_privilege('service_role','public.gi_evidence_invalidation_audit','SELECT') as service_select,
    has_table_privilege('service_role','public.gi_evidence_invalidation_audit','INSERT') as service_insert,
    has_function_privilege(
      'anon',
      'public.gi_invalidate_verified_evidence_on_source_version()',
      'EXECUTE'
    ) as anon_execute,
    has_function_privilege(
      'authenticated',
      'public.gi_invalidate_verified_evidence_on_source_version()',
      'EXECUTE'
    ) as authenticated_execute,
    has_function_privilege(
      'service_role',
      'public.gi_invalidate_verified_evidence_on_source_version()',
      'EXECUTE'
    ) as service_execute,
    (
      select count(*)
      from pg_trigger t
      join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
      where not t.tgisinternal
        and n.nspname='public'
        and c.relname='gi_source_versions'
        and t.tgfoid='public.gi_invalidate_verified_evidence_on_source_version()'::regprocedure
    ) as trigger_count
)
select
  check_name,
  case when passed then 'PASS' else 'FAIL' end as result,
  detail
from state
cross join lateral (
  values
    ('audit_table_rls',rls_enabled,'RLS must be enabled'),
    ('anon_table_access',not anon_select and not anon_insert,'anon must have no read/write access'),
    ('authenticated_table_access',not authenticated_select and not authenticated_insert,'authenticated must have no read/write access'),
    ('service_role_read_only',service_select and not service_insert,'service_role must be SELECT-only'),
    ('anon_function_execute',not anon_execute,'anon must not call the trigger function'),
    ('authenticated_function_execute',not authenticated_execute,'authenticated must not call the trigger function'),
    ('service_role_function_execute',not service_execute,'service_role must not call the trigger function directly'),
    ('trigger_attached',trigger_count=1,'internal source-version trigger must remain attached')
) checks(check_name,passed,detail)
order by check_name;
