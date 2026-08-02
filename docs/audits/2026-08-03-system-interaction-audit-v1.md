# System Interaction Audit v1

**Control point:** 2026-08-03 01:41 UTC+3  
**Repository:** `thethr0ne7/ai-platform-core`  
**Epic:** #109  
**Production commit:** `6695250fb5272e7268227bac39277dfdd64e441a`  
**Scope:** read-only proof of state transfer across Telegram, Vercel, Supabase, ingestion, evidence, intelligence and UX layers.

## Executive verdict

AI Platform Core is a functional limited beta.

The transactional user path works through project reports and tasks. The evidence and intelligence paths are not closed, so the system cannot yet emit a traceable confirmed eligibility decision or forecast.

Baseline probe result:

| Status | Count |
|---|---:|
| PASS | 11 |
| PARTIAL | 2 |
| FAIL | 10 |
| SKIP | 1 |

Release gates:

| Gate | Status | Reason |
|---|---|---|
| A — Transactional Core | **FAIL** | Four measure matches are not bound to a valid check. |
| B — Evidence Core | **FAIL** | Zero verified evidence, zero verified requirements, one measure without source document. |
| C — Intelligence Core | **FAIL** | Zero signal-evidence links; 36 Decision Cards lack evidence; zero Truth Gate passes. |
| D — Forecast Core | **BLOCKED** | Correctly disabled while Gates B and C fail. |

## Safety contract

This audit PR does not change production.

The probe runner is read-only by construction:

- allowed network methods: `GET`, `HEAD`, `OPTIONS`;
- no SQL mutation;
- no storage upload;
- no Telegram webhook or menu changes;
- no retry execution;
- no evidence-review decisions;
- no service-role credentials in client code.

Write-required transitions are evaluated from existing production traces, row relationships and static contracts. A future synthetic E2E test requires an isolated test project and separate authorization.

## System map

```text
Telegram
  → Vercel Web
  → telegram-project-api
  → Telegram HMAC
  → Projects
  → Storage / Documents
  → Parser / Chunks
  → Fact Candidates
  → Verified Project Facts
  → Project Check
  → Measure Matching
  → Report
  → Tasks

Official Sources
  → Source Documents
  → Source Versions
  → Evidence Records
  → Evidence Review
  → Verified Requirements
  → Measures
  → Signal-Evidence Graph
  → Analytic Signals
  → Decision Cards
  → Truth Gate
  → Forecasts
```

The first chain is substantially operational. The second chain breaks after evidence extraction.

## Production baseline

### Transactional layer

- 2 projects, both `ready`;
- 14 documents, all `parsed`;
- 11 fact candidates, all `confirmed`;
- 16 project facts, all `verified`;
- 58 project checks: 51 `completed`, 7 `partial`;
- 51 completed reports;
- 306 project tasks;
- recent `telegram-project-api` requests return 200;
- `project-document-processor` and `evidence-source-processor` return 202;
- Vercel production is `READY`;
- no Vercel runtime error cluster was observed.

### Evidence layer

- 221 source documents;
- 1,399 source versions;
- 1,423 evidence records;
- evidence records have quote and locator fields;
- verified evidence records: **0**;
- verified requirements: **0**;
- one support measure has no `source_document_id`.

### Intelligence layer

- 2,097 analytic signals;
- `gi_signal_evidence`: **0 rows**;
- 36 Decision Cards;
- 36 Decision Cards without `evidence_id`;
- 36 Truth Gate failures;
- 0 Truth Gate passes;
- 0 forecasts.

### Recovery and legacy

- 28 crawl jobs remain `dead_letter`;
- government ingestion continues to produce completed runs;
- legacy admissions has 11,190 pending queue rows and 6,008 queued jobs;
- legacy admissions remains in the shared production project.

## Probe results

| Probe | Status | Finding |
|---|---|---|
| P01 Telegram initData → profile | PARTIAL | Transport, CORS and persisted profiles are proven; read-only runner does not replay HMAC. |
| P02 Profile → project | PASS | Existing profiles have ready projects. |
| P03 Project → signed upload URL | PARTIAL | Contract exists; generating a token is intentionally not executed. |
| P04 Upload → document registration | PASS | Registered documents retain storage paths. |
| P05 Registration → processor | PASS | Documents reached parsed state and processor traces exist. |
| P06 Processor → chunks | PASS | Parsed documents produced chunks. |
| P07 Chunks → fact candidates | PASS | Fact candidates exist. |
| P08 Review → verified project facts | PASS | Confirmed candidates produced verified facts. |
| P09 Facts → project check | PASS | Checks are persisted. |
| P10 Check → measure matching | **FAIL** | Four matches lack a valid check relationship. |
| P11 Check → report | PASS | Completed reports are bound to checks. |
| P12 Report → tasks | PASS | Reports produced tasks without observed report orphans. |
| P13 Source → version | PASS | Official documents have version snapshots. |
| P14 Version → evidence | PASS | Evidence contains quotes and locators. |
| P15 Review → verified evidence | **FAIL** | No verified evidence exists. |
| P16 Evidence → verified requirement | **FAIL** | No verified requirements; one measure lacks a source document. |
| P17 Evidence → signal link | **FAIL** | `gi_signal_evidence` is empty. |
| P18 Signal → Decision Card | **FAIL** | All Decision Cards lack evidence references. |
| P19 Decision Card → Truth Gate | PASS | Gate executes deterministically and fails closed. |
| P20 Truth Gate → publishable result | **FAIL** | No controlled card passes. |
| P21 Verified signals → forecast | SKIP | Forecasting is correctly disabled. |
| P22 Dead letter recovery | **FAIL** | 28 jobs have no observed recovery state. |
| P23 Admissions isolation | **FAIL** | Frozen legacy workload remains in shared production. |
| P24 Meniscus → backend readiness | **FAIL** | Meniscus changes DOM visibility/hash only; it does not consume backend stage state. |

## Release-gate requirements

### Gate A — Transactional Core

Required chain:

```text
Telegram → project → document → parser → fact → check → report → task
```

Current blocker:

- repair or explicitly migrate the four measure matches without a valid check reference.

Before Gate A passes, add:

- per-transition request/correlation ID;
- stale timeout rules;
- retry state visibility;
- idempotency keys for write transitions;
- an isolated synthetic test project.

### Gate B — Evidence Core

Required chain:

```text
official source → source version → quote/locator → verified evidence
→ verified requirement → measure
```

Current blockers:

- no verified evidence;
- no verified requirements;
- one measure without a source document;
- no automatic invalidation contract when source versions change.

### Gate C — Intelligence Core

Required chain:

```text
verified evidence → gi_signal_evidence → signal
→ Decision Card → Truth Gate → publishable result
```

Current blockers:

- empty signal-evidence graph;
- Decision Cards have no evidence reference;
- no controlled Truth Gate pass;
- analytic signals must remain non-eligibility inputs until linked.

### Gate D — Forecast Core

Forecasting remains disabled.

It may be enabled only when:

- Gate B passes;
- Gate C passes;
- forecasts contain evidence IDs;
- assumptions and falsification conditions are populated;
- engine version and input snapshot are retained.

## Hard restrictions

Until Gates B and C pass:

- do not increase analytic-signal production;
- do not generate additional production Decision Cards;
- do not enable forecasts;
- do not label results as confirmed;
- do not use readiness score as proof of eligibility.

## Repair order

1. Automated interaction probes and CI execution.
2. Repair P10 relational integrity.
3. Verified evidence workflow.
4. Verified evidence → requirement binding.
5. Signal ↔ evidence graph.
6. Decision Card traceability.
7. Controlled Truth Gate fixture.
8. Dead-letter recovery.
9. Meniscus backend state contract.
10. Legacy admissions isolation.
11. Forecast activation.

## Artifacts

- `ops/e2e/system-interaction-matrix.v1.json`
- `ops/e2e/probes/run.ts`
- `ops/e2e/probes/README.md`
- `ops/e2e/baselines/2026-08-03.production.json`

## Acceptance criteria for this audit PR

- all 24 probes exist in the machine-readable matrix;
- baseline gives every probe PASS/PARTIAL/FAIL/SKIP;
- runner performs no writes;
- Gates A–D are calculated from results;
- production configuration and data are unchanged;
- failed blocker/high probes are converted into repair issues before the epic closes.
