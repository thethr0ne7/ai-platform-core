# ADR-0004: Government Support Intelligence is one product

## Status
Accepted

## Decision

Government Intelligence Core, Support Inspector, Forecast Engine and Recommendation Engine are not separate products. They are four capabilities of one product: **Government Support Intelligence**.

The product exists to inspect, trace and explain state-support measures and grants from official evidence through to a project-specific decision.

## Product path

```text
official sources
→ capture and normalize
→ immutable versions
→ material diff
→ support-measure trace
→ bounded forecast signals
→ project recommendation
→ evidence-locked output
```

## Capabilities

### Government intelligence
Collects official laws, decrees, programs, budgets, competition notices, guidance and implementation documents. Every assertion must retain source URL, capture time, quote and verification status.

### Support inspection
Represents a measure as an inspectable object: authority, instrument, jurisdiction, sector, applicant, eligible cost, financing condition, dates, exclusions and evidence. A measure must be traceable to all documents that define or change it.

### Forecasting
Forecasts are derived from changes and cross-source signals. The engine must explicitly classify each output as observation, interpretation or hypothesis. Hypotheses require confidence, horizon and falsification criteria. They must never be displayed as established facts.

### Recommendation
A project profile is matched against explicit eligibility, region, sector, objective, cost, amount and cofinancing rules. The result contains fit score, matched criteria, blockers, uncertainty and evidence. It is decision support, not a legal guarantee.

## First vertical slice

The first deterministic slice uses an agriculture project in Kabardino-Balkaria:

- berry cultivation;
- equipment;
- processing facilities;
- agritourism infrastructure;
- KFH/individual entrepreneur/company applicant forms.

The fixture is synthetic but shaped like an official program document. CI does not claim that this fixture is a currently active support measure. Live official-source ingestion will be added only after source-specific parsers and evidence gates are proven.

## Boundaries

- PROIDU is not the platform's priority and does not define this domain model.
- No autonomous legal conclusions.
- No grant or subsidy claim without official evidence.
- No black-box forecast without falsification criteria.
- No recommendation that hides blockers or uncertainty.
- No multi-agent orchestration until the single-process vertical slice proves operational value.

## Consequences

All following work should strengthen one vertical product loop rather than creating four repositories or four disconnected services. Persistence, ingestion, search, graph, forecasting and recommendation may be separate technical components, but they share one domain model and one evidence protocol.
