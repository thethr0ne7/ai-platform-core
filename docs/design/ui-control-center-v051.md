# AI Platform Control Center UI v0.51

## Objective

Turn the current project workspace into a product-level control center backed by live Supabase data without breaking the existing Telegram project workflow.

## Factory design inputs

Confirmed GitHub sources already discussed with the user:

- https://github.com/bradtraversy/design-resources-for-developers
- https://github.com/excalidraw/excalidraw
- https://github.com/Payoss/UIUX-high-taste-skill
- https://github.com/DevvGwardo/impeccable

These sources are not copied wholesale. The factory extracts reusable patterns only:

- information hierarchy;
- high-signal dashboard composition;
- anti-template / anti-slop checks;
- deliberate typography and spacing;
- diagram and evidence-graph interaction patterns;
- restrained motion and state transitions;
- accessibility and responsive behavior.

## UI Taste Gate

Every screen must pass:

1. Clear primary action within 3 seconds.
2. One dominant visual hierarchy, not a grid of equal cards.
3. Real data or explicit empty/loading/error states.
4. No decorative metrics without operational meaning.
5. Motion only for continuity, feedback, and state change.
6. Mobile-first Telegram Mini App ergonomics.
7. Keyboard focus, contrast, and reduced-motion support.
8. No fabricated status: every value must come from Supabase, runtime API, or build metadata.

## Product architecture

### 1. Home / Overview

- system state;
- active project summary;
- critical blockers;
- latest government signals;
- primary actions: create project, continue project, run analysis.

### 2. Live Dashboard

Supabase-backed metrics:

- official sources;
- source documents and versions;
- active signals;
- ingestion queue by status;
- failed/retry jobs;
- project checks and reports;
- learning events and skills after the learning core is integrated.

### 3. Search and routing

Search targets:

- projects;
- support measures;
- official sources;
- source documents;
- signals;
- institutions and programs where applicable.

Routes must be shareable and preserve selected entity context.

### 4. Government Intelligence

- source health;
- document/version timeline;
- change events;
- signals with confidence and evidence;
- support measures with official links and verification status.

### 5. AI Factory / System Health

- CI/build/deploy status;
- ingestion queues and failures;
- evidence coverage;
- source health;
- factory runs;
- learning state when PR #61 is safely integrated.

### 6. Visual polish

Only after real data flows and routes work:

- motion transitions;
- skeletons;
- progressive disclosure;
- chart/graph polish;
- micro-interactions;
- final typography and spacing pass.

## Delivery sequence

1. Preserve current Telegram authentication and project CRUD.
2. Introduce a new navigation shell.
3. Add live dashboard queries.
4. Add search and entity routing.
5. Add Government Intelligence screen.
6. Add Factory / System Health screen.
7. Run UI Taste Gate and accessibility checks.
8. Deploy Vercel preview and merge only after green CI.

## Definition of done

- Existing project save/upload/analyze flow remains functional.
- Dashboard contains live Supabase data, not hardcoded counters.
- Search returns real entities and opens stable routes.
- Government Intelligence exposes sources, documents, signals, and evidence.
- System Health exposes real queue/source/factory state.
- Mobile and desktop layouts pass the UI Taste Gate.
- Web CI, typecheck, build, and Vercel preview are green.
