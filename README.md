# AI Platform Core

Production monorepo for a **project government-support operating system**.

The public product promise is deliberately narrow:

> Upload a project and its documents, find relevant support measures, expose blockers, ground every conclusion in official evidence, and build a route toward application.

The repository may contain reusable platform capabilities, but they exist to serve this product path rather than to present several unrelated products to the user.

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
Application route
  ↓
Source-change monitoring
```

## Truth Gate

The platform must not convert source availability or keyword matches into a confident recommendation.

```text
NO VERIFIED QUOTE
→ NO VERIFIED REQUIREMENT

NO VERIFIED REQUIREMENTS
→ NO "MATCH" VERDICT
```

The report exposes separate indices for:

- project data;
- document readiness;
- legal readiness;
- financial readiness;
- eligibility;
- evidence coverage;
- application readiness.

When verified evidence, parsed documents, or evaluated eligibility rules are missing, the result is explicitly labelled **preliminary** and the total score is capped.

## Current production scope

Active:

- Telegram-authenticated project workspace;
- project and file storage in Supabase;
- monitored official-source registry;
- source snapshots, versions, changes, and evidence records;
- preliminary support-measure matching;
- evidence-aware project report;
- Supabase Edge Functions and Vercel deployment.

Not yet complete:

- full document parsing pipeline;
- broad verified federal and KBR support-measure catalogue;
- complete deterministic eligibility rules;
- application workspace and deadline tracking;
- human review for complex legal conclusions.

These incomplete capabilities must not be presented as active.

## Architecture truth

```text
AI Platform Core
│
├── apps/
│   └── web                    # Telegram Mini App and web interfaces
│
├── packages/
│   ├── core                   # reusable platform contracts
│   ├── schemas                # shared data contracts
│   ├── runtime                # runtime components
│   └── observability          # metrics and controls
│
├── supabase/
│   ├── functions              # authenticated APIs and ingestion workers
│   └── migrations             # data plane, evidence, truth and security gates
│
├── src/                       # bounded root platform API
├── test/                      # deterministic core tests
└── .github/workflows          # root + deployed-web verification
```

## Runtime flow

```text
Request
  ↓
Authentication / authorization
  ↓
Project facts and documents
  ↓
Source ingestion / evidence
  ↓
Eligibility and readiness gates
  ↓
Truth Gate
  ↓
Report / next actions
```

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
- deployed web typecheck;
- deployed web production build;
- migration review;
- Supabase security review;
- evidence and source-owner checks;
- Vercel preview verification.

Run locally:

```bash
npm ci
npm run platform:verify
```

## Deployment

```text
GitHub pull request
  ↓
GitHub Actions
  ↓
Vercel Preview
  ↓
Production

Supabase
  ↓
Database + Storage + Edge Functions + Intelligence Data
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
AI Platform Core v0.50.0
Truth Gate v0.60
```
