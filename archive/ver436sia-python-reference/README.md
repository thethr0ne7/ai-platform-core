# VER436SIA Python Reference

This directory records the migration boundary for `thethr0ne7/ver436sia`.

The legacy repository is **not** a deployable component of AI Platform Core. It is a historical reference used to recover bounded analytical concepts while rejecting the prototype runtime and technical debt.

## Concept mapping

| VER436SIA reference | AI Platform Core v0.72 destination | Decision |
|---|---|---|
| `EntityExtractor` | `supabase/functions/_shared/intelligence/entity-extractor.ts` | Reimplemented as deterministic, dependency-light extraction with provenance |
| `build_canonical_form()` | `canonicalizer.ts` and `gi_claims` | Replaced with evidence-scoped canonical claims |
| hard-coded T1/T2/T3 | `gi_signal_registry` and `signal-engine.ts` | Removed and replaced with extensible government signal types |
| `StateTracker` | `gi_intelligence_runs`, events and source versions | In-memory state rejected |
| `TrajectoryEngine` | `trajectory-engine.ts` and `gi_trajectories` | Reimplemented on persisted signals and timestamps |
| `NarrativeEngine` | `narrative-engine.ts` and `gi_narratives` | Retained only as non-legal, non-eligibility analysis |
| `RealityGraphEngine` / NetworkX | `graph-engine.ts`, `gi_entities`, `gi_relations` | PostgreSQL is the production graph store |
| Decision Cards | `decision-card-engine.ts`, `gi_decision_cards` | Rebuilt behind eligibility and Truth Gate |
| eigenvector analysis | none | Rejected from production until evidence-backed research exists |
| `RealityPipeline.match()` | none | Removed; incomplete runtime path is not migrated |
| separate FastAPI server | none | Removed from production architecture |

## Non-negotiable contract

```text
SIGNAL ≠ FACT
TREND ≠ REQUIREMENT
FORECAST ≠ ELIGIBILITY
NARRATIVE ≠ LEGAL BASIS
```

Only `ai-platform-core` may be deployed. The legacy Python repository must not be connected to production data, Supabase service credentials, Vercel, Telegram or the application route.
