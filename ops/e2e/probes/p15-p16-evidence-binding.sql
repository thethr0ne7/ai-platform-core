-- Read-only Gate B verification for P15/P16.
with function_defs as (
  select
    max(pg_get_functiondef(p.oid)) filter (
      where p.proname='gi_list_evidence_review_tasks'
    ) as review_list_definition,
    max(pg_get_functiondef(p.oid)) filter (
      where p.proname='gi_evaluate_project_measures'
    ) as matching_definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in ('gi_list_evidence_review_tasks','gi_evaluate_project_measures')
), checks as (
  select
    'P16_active_measures_without_source_document'::text as check_id,
    count(*)::bigint as failures
  from public.gi_support_measures
  where source_document_id is null

  union all

  select
    'P15_verified_evidence_without_human_trace',
    count(*)::bigint
  from public.gi_evidence_records er
  where er.verification_status='verified'
    and er.status='verified'
    and not exists(
      select 1
      from public.gi_evidence_review_audit a
      where a.evidence_record_id=er.id
        and a.decision='verified'
        and a.review_mode='human'
    )

  union all

  select
    'P16_verified_requirements_without_verified_evidence',
    count(*)::bigint
  from public.gi_measure_requirements req
  left join public.gi_evidence_records er
    on er.id=case
      when coalesce(req.metadata->>'evidence_record_id','') ~* '^[0-9a-f-]{36}$'
        then (req.metadata->>'evidence_record_id')::uuid
      else null
    end
  where req.evidence_status='verified'
    and (
      er.id is null
      or er.verification_status<>'verified'
      or er.status<>'verified'
      or coalesce(er.metadata->>'human_reviewed','false')<>'true'
    )

  union all

  select
    'P16_source_version_invalidation_trigger_missing',
    case when exists(
      select 1
      from pg_trigger t
      join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
      where not t.tgisinternal
        and n.nspname='public'
        and c.relname='gi_source_versions'
        and t.tgname='gi_00_evidence_invalidation_on_source_version'
    ) then 0 else 1 end

  union all

  select
    'P15_backlog_telemetry_contract_missing',
    case
      when position('age_seconds bigint' in review_list_definition)>0
       and position('blocker_reason text' in review_list_definition)>0
       and position('source_ready boolean' in review_list_definition)>0
      then 0 else 1
    end
  from function_defs

  union all

  select
    'P16_unverified_matching_not_fail_closed',
    case
      when position(E'when v_has_unverified then ''manual_review''' in matching_definition)>0
      then 0 else 1
    end
  from function_defs

  union all

  select
    'P15_controlled_human_verified_trace_missing',
    case when exists(
      select 1
      from public.gi_measure_requirements req
      join public.gi_evidence_records er
        on er.id=case
          when coalesce(req.metadata->>'evidence_record_id','') ~* '^[0-9a-f-]{36}$'
            then (req.metadata->>'evidence_record_id')::uuid
          else null
        end
      join public.gi_evidence_review_audit a
        on a.evidence_record_id=er.id
       and a.decision='verified'
       and a.review_mode='human'
      where req.evidence_status='verified'
        and er.verification_status='verified'
        and er.status='verified'
        and coalesce(er.metadata->>'human_reviewed','false')='true'
    ) then 0 else 1 end
)
select
  check_id,
  failures,
  case when failures=0 then 'PASS' else 'FAIL' end as status
from checks
order by check_id;
