create or replace function public.get_government_intelligence_overview()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'engine_version', 'ver436sia-intelligence-v0.72',
    'epistemic_contract', jsonb_build_object(
      'signal_is_fact', false,
      'trend_is_requirement', false,
      'forecast_is_eligibility', false,
      'narrative_is_legal_basis', false
    ),
    'totals', jsonb_build_object(
      'runs', (select count(*) from public.gi_intelligence_runs),
      'projects', (select count(distinct project_id) from public.gi_intelligence_runs),
      'entities', (select count(*) from public.gi_entities),
      'claims', (select count(*) from public.gi_claims),
      'events', (select count(*) from public.gi_events),
      'signals', (select count(*) from public.gi_analytic_signals where intelligence_run_id is not null),
      'relations', (select count(*) from public.gi_relations),
      'trajectories', (select count(*) from public.gi_trajectories),
      'narratives', (select count(*) from public.gi_narratives),
      'forecasts', (select count(*) from public.gi_forecasts),
      'decision_cards', (select count(*) from public.gi_decision_cards),
      'published_decision_cards', (select count(*) from public.gi_decision_cards where publish_status = 'published')
    ),
    'run_statuses', coalesce((
      select jsonb_agg(jsonb_build_object('status', status, 'count', count) order by status)
      from (
        select status, count(*)::integer as count
        from public.gi_intelligence_runs
        group by status
      ) grouped
    ), '[]'::jsonb),
    'entity_types', coalesce((
      select jsonb_agg(jsonb_build_object('type', entity_type, 'count', count) order by count desc, entity_type)
      from (
        select entity_type, count(*)::integer as count
        from public.gi_entities
        group by entity_type
      ) grouped
    ), '[]'::jsonb),
    'signal_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', signal_type,
        'stage', signal_stage,
        'actionability', actionability_status,
        'count', count,
        'average_confidence', average_confidence
      ) order by count desc, signal_type)
      from (
        select signal_type, signal_stage, actionability_status,
               count(*)::integer as count,
               round(avg(confidence)::numeric, 3) as average_confidence
        from public.gi_analytic_signals
        where intelligence_run_id is not null
        group by signal_type, signal_stage, actionability_status
      ) grouped
    ), '[]'::jsonb),
    'relation_types', coalesce((
      select jsonb_agg(jsonb_build_object('predicate', predicate, 'count', count) order by count desc, predicate)
      from (
        select predicate, count(*)::integer as count
        from public.gi_relations
        group by predicate
      ) grouped
    ), '[]'::jsonb),
    'trajectories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'signal_type', signal_type,
        'direction', direction,
        'count', count,
        'average_confidence', average_confidence
      ) order by count desc, signal_type)
      from (
        select signal_type, direction, count(*)::integer as count,
               round(avg(confidence)::numeric, 3) as average_confidence
        from public.gi_trajectories
        group by signal_type, direction
      ) grouped
    ), '[]'::jsonb),
    'narratives', coalesce((
      select jsonb_agg(jsonb_build_object(
        'theme', theme,
        'transition_stage', transition_stage,
        'count', count,
        'average_confidence', average_confidence
      ) order by count desc, theme)
      from (
        select theme, transition_stage, count(*)::integer as count,
               round(avg(confidence)::numeric, 3) as average_confidence
        from public.gi_narratives
        group by theme, transition_stage
      ) grouped
    ), '[]'::jsonb),
    'forecasts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'forecast_type', forecast_type,
        'status', status,
        'count', count,
        'average_probability', average_probability
      ) order by count desc, forecast_type)
      from (
        select forecast_type, status, count(*)::integer as count,
               round(avg(probability)::numeric, 3) as average_probability
        from public.gi_forecasts
        group by forecast_type, status
      ) grouped
    ), '[]'::jsonb),
    'decision_cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'publish_status', publish_status,
        'eligibility_status', eligibility_status,
        'truth_gate_passed', truth_gate_passed,
        'count', count
      ) order by publish_status, eligibility_status)
      from (
        select publish_status, eligibility_status, truth_gate_passed, count(*)::integer as count
        from public.gi_decision_cards
        group by publish_status, eligibility_status, truth_gate_passed
      ) grouped
    ), '[]'::jsonb),
    'latest_runs', coalesce((
      select jsonb_agg(to_jsonb(run_row) order by run_row.created_at desc)
      from (
        select input_kind, status, engine_version, metrics, started_at, finished_at, created_at
        from public.gi_intelligence_runs
        order by created_at desc
        limit 10
      ) run_row
    ), '[]'::jsonb),
    'generated_at', now()
  );
$$;

revoke all on function public.get_government_intelligence_overview() from public;
grant execute on function public.get_government_intelligence_overview() to anon, authenticated;
