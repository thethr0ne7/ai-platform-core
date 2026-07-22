begin;

drop index if exists public.gi_measure_requirements_measure_active_idx;

create index if not exists gi_evidence_review_audit_evidence_idx
on public.gi_evidence_review_audit(evidence_record_id)
where evidence_record_id is not null;

create index if not exists gi_evidence_verification_queue_source_document_idx
on public.gi_evidence_verification_queue(source_document_id)
where source_document_id is not null;

create index if not exists gi_evidence_records_version_idx
on public.gi_evidence_records(version_id)
where version_id is not null;

commit;
