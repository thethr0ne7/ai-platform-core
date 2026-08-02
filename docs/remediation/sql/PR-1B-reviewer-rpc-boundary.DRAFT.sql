-- DRAFT ONLY — DO NOT MOVE INTO supabase/migrations OR APPLY BEFORE PR #94 PHASE 1A IS LIVE.
-- Purpose: remove public-role execution of reviewer-only Government Intelligence overview.
-- Production project: hgivyjjethjwswjrvroy
-- Parent issue: #94

-- -----------------------------------------------------------------------------
-- PRECHECKS
-- -----------------------------------------------------------------------------

select
  has_function_privilege('anon', 'public.get_government_intelligence_overview()', 'EXECUTE') as anon_execute_before,
  has_function_privilege('authenticated', 'public.get_government_intelligence_overview()', 'EXECUTE') as authenticated_execute_before,
  has_function_privilege('service_role', 'public.get_government_intelligence_overview()', 'EXECUTE') as service_execute_before;

select
  p.oid::regprocedure as function_signature,
  p.prosecdef as security_definer,
  p.proconfig as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_government_intelligence_overview';

-- Required non-SQL preconditions:
-- 1. reviewer-intelligence-api is deployed and ACTIVE.
-- 2. Vercel production client calls reviewer-intelligence-api, not supabase.rpc directly.
-- 3. Valid reviewer smoke test = 200.
-- 4. Valid non-reviewer smoke test = 403.
-- 5. Missing/forged/stale Telegram initData = 401.

-- -----------------------------------------------------------------------------
-- UP MIGRATION
-- -----------------------------------------------------------------------------

begin;

revoke execute
on function public.get_government_intelligence_overview()
from public, anon, authenticated;

grant execute
on function public.get_government_intelligence_overview()
to service_role;

commit;

-- -----------------------------------------------------------------------------
-- POSTCHECKS
-- Expected: false / false / true
-- -----------------------------------------------------------------------------

select
  has_function_privilege('anon', 'public.get_government_intelligence_overview()', 'EXECUTE') as anon_execute_after,
  has_function_privilege('authenticated', 'public.get_government_intelligence_overview()', 'EXECUTE') as authenticated_execute_after,
  has_function_privilege('service_role', 'public.get_government_intelligence_overview()', 'EXECUTE') as service_execute_after;

-- Verify that no PUBLIC grant remains.
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'get_government_intelligence_overview'
order by grantee, privilege_type;

-- -----------------------------------------------------------------------------
-- EMERGENCY DOWN MIGRATION
-- Time-bounded only. Record as security incident and remove after recovery.
-- -----------------------------------------------------------------------------

-- grant execute
-- on function public.get_government_intelligence_overview()
-- to anon, authenticated;

-- Do not revoke or modify the other four overview RPCs in this migration.
-- They require individual public-safe/internal classification under issues #94/#102.
