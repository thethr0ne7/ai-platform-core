# ADR 0006 — VER436SIA Intelligence Merge

- **Status:** Accepted
- **Version:** AI Platform Core v0.72
- **Codename:** VER436SIA Intelligence Merge
- **Date:** 2026-07-22

## Decision

`thethr0ne7/ai-platform-core` remains the only active production product and repository.

`thethr0ne7/ver436sia` is not merged as a second application. Its useful analytical concepts are absorbed into AI Platform Core as the internal **Government Intelligence Engine**. After the reference mechanisms have been transferred and verified, the old repository becomes an archived migration source.

## Production ownership

| Repository | Status | Role |
|---|---|---|
| `thethr0ne7/ai-platform-core` | ACTIVE / PRIMARY / PRODUCTION | Product, data plane, evidence, eligibility, Truth Gate and Government Intelligence Engine |
| `thethr0ne7/ver436sia` | REFERENCE / MIGRATION SOURCE | Historical Python prototype used only to recover bounded analytical ideas |

## Target flow

```text
OFFICIAL SOURCES + PROJECT DOCUMENTS
  → INGESTION
  → DOCUMENT PARSING
  → EVIDENCE EXTRACTION
  → ENTITY + CANONICAL EXTRACTION
  → EVENTS + SIGNALS + RELATIONS
  → TEMPORAL / GRAPH / NARRATIVE ANALYSIS
  → SUPPORT-MEASURE ELIGIBILITY
  → TRUTH GATE
  → DECISION CARDS
  → APPLICATION ROUTE
  → CONTROLLED FORECAST
```

The existing production report sequence remains authoritative:

```text
PROJECT REPORT
  → ELIGIBILITY
  → ENRICHMENT
  → TRUTH GATE
  → FINAL REPORT
  → PERSISTENCE
```

The intelligence engine enriches this sequence but cannot bypass eligibility or evidence controls.

## Concepts transferred

- entity extraction;
- canonical intelligence claims;
- extensible signal detection;
- event memory in PostgreSQL;
- temporal dynamics and trajectory detection;
- relationship graph in PostgreSQL;
- narrative analysis;
- evidence-scoped Decision Cards;
- controlled forecasting with explicit hypotheses and falsification conditions.

## Concepts rejected

The following VER436SIA implementation details are prohibited in production:

- a separate FastAPI service;
- the old static UI;
- wildcard CORS;
- in-memory `StateTracker` as the source of truth;
- NetworkX as the production graph store;
- hard-coded T1/T2/T3 trajectories;
- the incomplete `RealityPipeline.match()` path;
- eigenvector conclusions without evidence;
- automatic forecasts without sources;
- confident conclusions from a single keyword or coincidence.

The old orchestrator explicitly disabled the reality path when `RealityPipeline.match()` was absent. That fallback is retained only as historical evidence of technical debt and is not migrated as a runtime capability.

## Epistemic contract

```text
SIGNAL ≠ FACT
TREND ≠ REQUIREMENT
FORECAST ≠ ELIGIBILITY
NARRATIVE ≠ LEGAL BASIS
```

Every intelligence record carries provenance, confidence, epistemic status and engine version. Signals, trajectories, narratives and forecasts are structurally forbidden from supporting eligibility.

A Decision Card may be published only when:

- the underlying eligibility verdict is `match`;
- at least one requirement is verified;
- at least one evidence record is verified;
- the Truth Gate has passed.

Otherwise the card remains `manual_review` or `draft`.

## Storage decision

Supabase/PostgreSQL is the sole production memory and graph store. The v0.72 foundation adds or extends:

- `gi_intelligence_runs`;
- `gi_entities`;
- `gi_claims`;
- `gi_events`;
- `gi_analytic_signals` and `gi_signal_evidence`;
- `gi_relations`;
- `gi_trajectories`;
- `gi_narratives`;
- `gi_forecasts`;
- `gi_decision_cards`;
- `gi_signal_registry`.

## Consequences

The product remains one coherent application. Analytical depth increases without importing the old prototype's runtime, UI, mutable in-memory state or unsupported confidence claims. This ADR is the permanent cross-chat record of the merge decision.