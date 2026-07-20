# ADR 0008: Intelligence Lens Engine

## Status

Accepted.

## Context

Government Support Intelligence must reason about a project through more than grant eligibility. A useful decision depends on strategy, territory, economics, finance, law, support rules, production, logistics, market demand, clients, evidence, documents, risks and forecasts.

The platform must not implement these categories as independent agents. That would duplicate context, fragment evidence and create multi-agent theatre.

## Decision

Adopt one typed `Intelligence Lens Engine` over a shared claim and evidence graph.

Runtime:

`PROJECT + SUPPORT MEASURE + EVIDENCE → INTELLIGENCE LENSES → GAPS / BLOCKERS / OPPORTUNITIES → DECISION BRIEF`

Each claim records:

- lens;
- fact, interpretation or hypothesis level;
- evidence references;
- confidence;
- falsification criteria;
- optional operational tags.

Facts require verified evidence. Interpretations and hypotheses require falsification criteria. A project cannot receive a decision-ready result when critical legal, support, financial, economic, market, evidence, document or risk coverage is missing.

## Canonical lenses

- Strategic Intelligence
- Territorial Intelligence
- Economic Intelligence
- Financial Intelligence
- Legal Intelligence
- Support Intelligence
- Production Intelligence
- Logistics Intelligence
- Market Intelligence
- Client Intelligence
- Evidence Intelligence
- Document Intelligence
- Risk Intelligence
- Forecast Intelligence

## Critical lenses

The first production gate treats economic, financial, legal, support, market, evidence, document and risk lenses as critical.

Missing critical evidence blocks the decision. Partial evidence creates a warning and a next evidence-gathering action.

## Evidence semantics

Project plans, calculations and customer documents may prove planning assumptions, demand signals or calculations. They do not prove current legal or grant conditions. Official rules require a verified official-document snapshot.

The engine must preserve this distinction even when a project document contains confident statements about government programs.

## KBR agroservice application

The initial deterministic scenario demonstrates the intended behavior:

- territorial lens identifies the Baksan cluster as a priority according to the supplied profitability map;
- production lens identifies repeatable orchard operations;
- logistics lens identifies travel and routing pressure;
- client lens treats letters of intent and hectare-operation registers as demand evidence;
- market lens recommends structured customer interviews;
- financial lens requires supplier quotes and cash-flow validation;
- legal and support lenses remain incomplete until current regional official rules are captured;
- risk lens exposes margin loss from long-distance equipment movement.

The result is `needs-evidence`, not an unsupported grant recommendation.

## Boundaries

- No separate agent per lens.
- No claim becomes a fact because it appears in a business plan.
- No high confidence without evidence coverage.
- No forecast without falsification criteria.
- No automatic legal conclusion.
- No single opaque score replacing blockers, opportunities, warnings and next actions.

## Consequences

The platform can now produce project intelligence briefs that explain what is known, what is inferred, what is missing and what evidence should be collected next. Future ingestion, recommendation and forecasting modules must emit claims compatible with this contract.