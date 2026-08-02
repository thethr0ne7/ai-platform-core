-- System Interaction Audit v1
-- READ-ONLY ONLY: this file intentionally contains SELECT statements only.
-- Expected operator: Supabase SQL editor or psql against production with read access.

with checks as (
  select 'P02_projects_without_profile' as check_id, count(*)::bigint as failures
  from public.gi_projects p
  left join public.gi_telegram_profiles tp on tp.telegram_user_id = p.telegram_user_id
  where p.telegram_user_id is null or tp.telegram_user_id is null

  union all
  select 'P04_documents_without_project', count(*)::bigint
  from public.gi_project_documents d
  left join public.gi_projects p on p.id = d.project_id
  where d.project_id is null or p.id is null

  union all
  select 'P06_chunks_without_document', count(*)::bigint
  from public.gi_project_document_chunks c
  left join public.gi_project_documents d on d.id = c.document_id
  where c.document_id is null or d.id is null

  union all
  select 'P06_chunks_project_mismatch', count(*)::bigint
  from public.gi_project_document_chunks c
  join public.gi_project_documents d on d.id = c.document_id
  where c.project_id is distinct from d.project_id

  union all
  select 'P07_candidates_without_document', count(*)::bigint
  from public.gi_project_fact_candidates fc
  left join public.gi_project_documents d on d.id = fc.document_id
  where fc.document_id is null or d.id is null

  union all
  select 'P07_candidates_project_mismatch', count(*)::bigint
  from public.gi_project_fact_candidates fc
  join public.gi_project_documents d on d.id = fc.document_id
  where fc.project_id is distinct from d.project_id

  union all
  select 'P08_facts_without_project', count(*)::bigint
  from public.gi_project_facts f
  left join public.gi_projects p on p.id = f.project_id
  where f.project_id is null or p.id is null

  union all
  select 'P08_facts_without_source_document', count(*)::bigint
  from public.gi_project_facts f
  left join public.gi_project_documents d on d.id = f.source_document_id
  where f.source_document_id is not null and d.id is null

  union all
  select 'P09_checks_without_project', count(*)::bigint
  from public.gi_project_checks c
  left join public.gi_projects p on p.id = c.project_id
  where c.project_id is null or p.id is null

  union all
  select 'P10_matches_without_check', count(*)::bigint
  from public.gi_project_measure_matches m
  left join public.gi_project_checks c on c.id = m.check_id
  where m.check_id is null or c.id is null

  union all
  select 'P10_matches_without_measure', count(*)::bigint
  from public.gi_project_measure_matches m
  left join public.gi_support_measures sm on sm.id = m.measure_id
  where m.measure_id is null or sm.id is null

  union all
  select 'P11_reports_without_check', count(*)::bigint
  from public.gi_project_reports r
  left join public.gi_project_checks c on c.id = r.check_id
  where r.check_id is null or c.id is null

  union all
  select 'P11_reports_project_mismatch', count(*)::bigint
  from public.gi_project_reports r
  join public.gi_project_checks c on c.id = r.check_id
  where r.project_id is distinct from c.project_id

  union all
  select 'P12_tasks_without_report', count(*)::bigint
  from public.gi_project_tasks t
  left join public.gi_project_reports r on r.id = t.report_id
  where t.report_id is null or r.id is null

  union all
  select 'P12_tasks_project_mismatch', count(*)::bigint
  from public.gi_project_tasks t
  join public.gi_project_reports r on r.id = t.report_id
  where t.project_id is distinct from r.project_id

  union all
  select 'P14_evidence_without_source_version', count(*)::bigint
  from public.gi_evidence_records e
  left join public.gi_source_versions sv on sv.id = coalesce(e.source_version_id, e.version_id)
  where coalesce(e.source_version_id, e.version_id) is null or sv.id is null

  union all
  select 'P16_requirements_without_measure', count(*)::bigint
  from public.gi_measure_requirements mr
  left join public.gi_support_measures sm on sm.id = mr.measure_id
  where mr.measure_id is null or sm.id is null

  union all
  select 'P16_measures_without_source_document', count(*)::bigint
  from public.gi_support_measures sm
  left join public.gi_source_documents sd on sd.id = sm.source_document_id
  where sm.source_document_id is null or sd.id is null

  union all
  select 'P17_signal_evidence_without_signal', count(*)::bigint
  from public.gi_signal_evidence se
  left join public.gi_analytic_signals s on s.id = se.signal_id
  where se.signal_id is null or s.id is null

  union all
  select 'P17_signal_evidence_without_evidence', count(*)::bigint
  from public.gi_signal_evidence se
  left join public.gi_evidence_records e on e.id = se.evidence_id
  where se.evidence_id is null or e.id is null

  union all
  select 'P18_decision_cards_without_evidence', count(*)::bigint
  from public.gi_decision_cards dc
  left join public.gi_evidence_records e on e.id = dc.evidence_id
  where dc.evidence_id is null or e.id is null
)
select check_id, failures,
       case when failures = 0 then 'PASS' else 'FAIL' end as status
from checks
order by check_id;
