begin;

create index if not exists gi_analytic_signals_run_idx on public.gi_analytic_signals(intelligence_run_id);
create index if not exists gi_analytic_signals_source_idx on public.gi_analytic_signals(source_id);
create index if not exists gi_analytic_signals_snapshot_idx on public.gi_analytic_signals(source_snapshot_id);
create index if not exists gi_analytic_signals_evidence_idx on public.gi_analytic_signals(evidence_id);

create index if not exists gi_claims_run_idx on public.gi_claims(intelligence_run_id);
create index if not exists gi_claims_source_idx on public.gi_claims(source_id);
create index if not exists gi_claims_snapshot_idx on public.gi_claims(source_snapshot_id);
create index if not exists gi_claims_evidence_idx on public.gi_claims(evidence_id);

create index if not exists gi_decision_cards_run_idx on public.gi_decision_cards(intelligence_run_id);
create index if not exists gi_decision_cards_check_idx on public.gi_decision_cards(project_check_id);
create index if not exists gi_decision_cards_measure_idx on public.gi_decision_cards(measure_id);
create index if not exists gi_decision_cards_source_idx on public.gi_decision_cards(source_id);
create index if not exists gi_decision_cards_snapshot_idx on public.gi_decision_cards(source_snapshot_id);
create index if not exists gi_decision_cards_evidence_idx on public.gi_decision_cards(evidence_id);

create index if not exists gi_entities_source_idx on public.gi_entities(source_id);
create index if not exists gi_entities_snapshot_idx on public.gi_entities(source_snapshot_id);
create index if not exists gi_entities_evidence_idx on public.gi_entities(evidence_id);

create index if not exists gi_events_run_idx on public.gi_events(intelligence_run_id);
create index if not exists gi_events_source_idx on public.gi_events(source_id);
create index if not exists gi_events_snapshot_idx on public.gi_events(source_snapshot_id);
create index if not exists gi_events_evidence_idx on public.gi_events(evidence_id);

create index if not exists gi_forecasts_run_idx on public.gi_forecasts(intelligence_run_id);
create index if not exists gi_forecasts_source_idx on public.gi_forecasts(source_id);
create index if not exists gi_forecasts_snapshot_idx on public.gi_forecasts(source_snapshot_id);
create index if not exists gi_forecasts_evidence_idx on public.gi_forecasts(evidence_id);

create index if not exists gi_intelligence_runs_check_idx on public.gi_intelligence_runs(project_check_id);
create index if not exists gi_intelligence_runs_source_idx on public.gi_intelligence_runs(source_id);
create index if not exists gi_intelligence_runs_snapshot_idx on public.gi_intelligence_runs(source_snapshot_id);
create index if not exists gi_intelligence_runs_evidence_idx on public.gi_intelligence_runs(evidence_id);

create index if not exists gi_narratives_run_idx on public.gi_narratives(intelligence_run_id);
create index if not exists gi_narratives_source_idx on public.gi_narratives(source_id);
create index if not exists gi_narratives_snapshot_idx on public.gi_narratives(source_snapshot_id);
create index if not exists gi_narratives_evidence_idx on public.gi_narratives(evidence_id);

create index if not exists gi_relations_run_idx on public.gi_relations(intelligence_run_id);
create index if not exists gi_relations_source_idx on public.gi_relations(source_id);
create index if not exists gi_relations_snapshot_idx on public.gi_relations(source_snapshot_id);
create index if not exists gi_relations_evidence_idx on public.gi_relations(evidence_id);
create index if not exists gi_relations_subject_entity_idx on public.gi_relations(subject_entity_id);
create index if not exists gi_relations_object_entity_idx on public.gi_relations(object_entity_id);

create index if not exists gi_trajectories_run_idx on public.gi_trajectories(intelligence_run_id);
create index if not exists gi_trajectories_source_idx on public.gi_trajectories(source_id);
create index if not exists gi_trajectories_snapshot_idx on public.gi_trajectories(source_snapshot_id);
create index if not exists gi_trajectories_evidence_idx on public.gi_trajectories(evidence_id);
create index if not exists gi_trajectories_signal_type_idx on public.gi_trajectories(signal_type);

create index if not exists gi_signal_evidence_evidence_idx on public.gi_signal_evidence(evidence_id);

commit;
