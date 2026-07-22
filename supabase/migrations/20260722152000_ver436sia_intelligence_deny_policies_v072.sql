begin;

create policy gi_signal_registry_deny_client_access
on public.gi_signal_registry
for all
to anon,authenticated
using (false)
with check (false);

create policy gi_intelligence_runs_deny_client_access
on public.gi_intelligence_runs
for all
to anon,authenticated
using (false)
with check (false);

create policy gi_entities_deny_client_access
on public.gi_entities
for all
to anon,authenticated
using (false)
with check (false);

create policy gi_claims_deny_client_access
on public.gi_claims
for all
to anon,authenticated
using (false)
with check (false);

create policy gi_events_deny_client_access
on public.gi_events
for all
to anon,authenticated
using (false)
with check (false);

create policy gi_relations_deny_client_access
on public.gi_relations
for all
to anon,authenticated
using (false)
with check (false);

create policy gi_trajectories_deny_client_access
on public.gi_trajectories
for all
to anon,authenticated
using (false)
with check (false);

create policy gi_narratives_deny_client_access
on public.gi_narratives
for all
to anon,authenticated
using (false)
with check (false);

create policy gi_forecasts_deny_client_access
on public.gi_forecasts
for all
to anon,authenticated
using (false)
with check (false);

create policy gi_decision_cards_deny_client_access
on public.gi_decision_cards
for all
to anon,authenticated
using (false)
with check (false);

create policy gi_analytic_signals_deny_client_access
on public.gi_analytic_signals
for all
to anon,authenticated
using (false)
with check (false);

create policy gi_signal_evidence_deny_client_access
on public.gi_signal_evidence
for all
to anon,authenticated
using (false)
with check (false);

commit;
