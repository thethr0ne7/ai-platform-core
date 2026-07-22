# AI Platform Core

Production monorepo for a **project government-support operating system**.

> Upload a project and its documents, find relevant support measures, expose blockers, ground every conclusion in official evidence, build a route toward application and analyse government dynamics without confusing signals with legal facts.

AI Platform Core is the only product and production repository. The former `VER436SIA` Python prototype has been absorbed as the internal **Government Intelligence Engine**; it is not a second application or service.

## Product path

```text
Project
  ↓
Form facts + uploaded documents
  ↓
Legal / financial / territorial readiness
  ↓
Verified support measures
  ↓
Requirement matrix
  ↓
Blockers + missing documents
  ↓
Truth-gated Decision Cards
  ↓
Application route
  ↓
Source-change monitoring + controlled forecast
```

## Production report sequence

```text
PROJECT REPORT
  → ENRICHMENT
  → PRE-TRUTH INTELLIGENCE
  → DETERMINISTIC ELIGIBILITY
  → TRUTH GATE
  → FINAL REPORT
  → DECISION CARDS + CONTROLLED FORECAST
  → PERSISTENCE
```

Government Intelligence is non-authoritative. Its failure is visible, but it cannot weaken or replace deterministic eligibility and the Truth Gate.

## Truth Gate

The platform must not convert source availability, keyword matches, trends or narratives into a confident recommendation.

```text
NO VERIFIED QUOTE
→ NO VERIFIED REQUIREMENT

NO VERIFIED REQUIREMENTS
→ NO "MATCH" VERDICT

SIGNAL ≠ FACT
TREND ≠ REQUIREMENT
FORECAST ≠ ELIGIBILITY
NARRATIVE ≠ LEGAL BASIS
```

A Decision Card may be published only when:

- eligibility is `match`;
- at least one requirement is verified;
- at least one evidence record is verified;
- the Truth Gate has passed.

Otherwise the card remains `manual_review` or `draft`.

## Government Intelligence Engine

The v0.72 engine contains:

- deterministic entity extraction;
- canonical intelligence claims;
- extensible government signal registry;
- event memory in PostgreSQL;
- temporal trajectory detection;
- PostgreSQL relationship graph;
- bounded narrative analysis;
- evidence-scoped Decision Cards;
- controlled forecasts with assumptions and falsification conditions.

Production storage:

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

Every analytical record carries provenance, confidence, epistemic status and engine version. Signals, events, relations, trajectories, narratives and forecasts are structurally prohibited from supporting eligibility.

## Current production scope

Active:

- Telegram-authenticated project workspace;
- project and file storage in Supabase;
- monitored official-source registry;
- source snapshots, versions, changes and evidence records;
- Russian OCR with manual legal review;
- deterministic eligibility rules;
- measure-scoped Truth Gate;
- final report persistence;
- Government Intelligence Engine v0.72 data model and runtime;
- Supabase Edge Functions and Vercel deployment.

Still incomplete:

- broad verified federal and KBR support-measure catalogue;
- full manual verification of OCR legal citations;
- application workspace and deadline tracking;
- production UI for graph, trajectories and Decision Cards;
- human review for complex legal conclusions.

Incomplete capabilities must not be presented as active.

## Architecture truth

```text
AI Platform Core
│
├── Product Layer
│   ├── Telegram Mini App
│   ├── Web Control Center
│   ├── Project Workspace
│   └── Application Route
│
├── Government Data Plane
│   ├── Official Sources
│   ├── Source Snapshots
│   ├── Version Changes
│   ├── Legal Documents
│   └── Support Measures
│
├── Evidence & Truth Layer
│   ├── Authority Tiers
│   ├── Verified Quotes
│   ├── Eligibility Rules
│   ├── Evidence Coverage
│   └── Truth Gate
│
└── Government Intelligence Engine
    ├── Entity Extraction
    ├── Canonical Representation
    ├── Signal Detection
    ├── Event Memory
    ├── State Dynamics
    ├── Narrative Analysis
    ├── Relationship Graph
    ├── Trajectory Detection
    ├── Decision Cards
    └── Controlled Forecasting
```

Repository structure:

```text
apps/web/                                  product interfaces
packages/schemas/                          shared contracts
supabase/functions/_shared/intelligence/   intelligence runtime
supabase/functions/government-opportunity-api/
supabase/migrations/                       data, evidence, truth and intelligence gates
docs/adr/                                  permanent architectural decisions
archive/ver436sia-python-reference/         migration boundary only
```

## Rejected legacy runtime

The following VER436SIA parts are not production components:

- separate FastAPI service;
- old static UI;
- wildcard CORS;
- in-memory `StateTracker`;
- NetworkX as the primary store;
- hard-coded T1/T2/T3;
- incomplete `RealityPipeline.match()`;
- eigenvector conclusions without evidence;
- automatic source-free forecasts;
- confident conclusions from one coincidence.

See `docs/adr/0006-ver436sia-intelligence-merge.md`.

## Source authority tiers

| Tier | Source | Permitted use |
|---|---|---|
| A | Legal act, official selection document, official register | eligibility, deadlines, amounts, legal conclusions |
| B | Official authority or operator website | programme description, official links, discovery |
| C | Verified official communication channel | early signals and notifications only |
| D | Media or aggregator | candidate discovery only |
| E | Unverified publication | do not publish without confirmation |

## Quality gates

Before merge or production release:

- strict TypeScript checks;
- core tests;
- deployed web typecheck and production build;
- migration review;
- Supabase security review;
- evidence and source-owner checks;
- Vercel preview verification;
- provenance checks for intelligence records;
- no published Decision Card without Truth Gate;
- no forecast without explicit hypothesis and falsification conditions.

```bash
npm ci
npm run platform:verify
```

## Deployment

```text
GitHub pull request
  → GitHub Actions
  → Vercel Preview
  → Production

Supabase
  → PostgreSQL + Storage + Edge Functions
  → Evidence + Truth + Government Intelligence
```

## Core principles

- Evidence before conclusions.
- Project depth before catalogue breadth.
- Source health is not evidence quality.
- Communication channels are not legal primary sources.
- Controlled learning instead of uncontrolled self-modification.
- Versioned contracts and reproducible builds.
- No feature is described as active unless it is active on `main` and production.

## Repository version

```text
AI Platform Core v0.72.0
Codename: VER436SIA Intelligence Merge
Government Intelligence Engine v0.72
Truth Gate v0.64
Deterministic Eligibility v0.70
```
