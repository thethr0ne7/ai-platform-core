# AI Platform Core — Remediation Plan v1

Date: 2026-08-02  
Baseline commit: `c6e6fa35a485b7809b538feef44777df5371fdaf`  
Parent issue: #93

## 1. Objective

Move AI Platform Core from a functional limited beta to a reproducible production system without weakening the fail-closed Truth Gate and without mixing legacy «Проиду» cleanup with current Government Intelligence delivery.

This document is a rollout contract. It does not authorize direct production changes.

## 2. Verified production baseline

- Vercel production deployment is READY and built from `c6e6fa3`.
- Vercel uses Node 24 but currently installs with `npm install`.
- The latest build reports 12 high-severity npm advisories.
- Supabase has 21 ACTIVE Edge Functions; 10 are declared in `supabase/config.toml`.
- Five `SECURITY DEFINER` overview RPCs are executable by `anon` and `authenticated`.
- `useGovernmentIntelligence()` calls `get_government_intelligence_overview()` directly from the public Supabase client.
- 86 public tables have RLS enabled; 65 have no policies and therefore deny all direct client access.
- Admission queues contain more than 17,000 stalled records with no observed movement after 2026-07-05.
- Government crawl jobs: 9 succeeded, 28 dead-letter.
- Analytic signals: 1,862; signal-evidence relations: 0.
- Active support measures: 2; structured directions: 16; machine candidates: 12.
- Existing Decision Cards remain fail-closed with zero verified evidence/requirements.

## 3. Release invariants

1. Add a replacement path before removing the old path.
2. Every production change is versioned in GitHub.
3. One risk domain per PR.
4. Every PR contains acceptance checks and rollback steps.
5. No production function/table/queue is deleted without usage evidence and an export/restore plan.
6. Machine extraction or matching never becomes human verification.
7. Signal, trend, forecast and narrative never support eligibility.
8. No `npm audit fix --force`.

## 4. Mandatory PR order

| Order | PR package | Issue | Production effect |
|---:|---|---:|---|
| 1A | Protected reviewer API and client switch | #94 | additive Edge Function/web change |
| 1B | Revoke reviewer RPC from public roles | #94 | security grant migration |
| 2 | Edge Function inventory and drift gate | #95 | non-destructive |
| 3A | Unified CI | #96 | CI only |
| 3B | Pinned Supabase CLI and controlled migrations | #96 | deployment process |
| 3C | Vercel Install Command `npm ci` | #96 | project configuration + redeploy |
| 4 | Admission restore/isolate/retire ADR | #97 | no delete in first PR |
| 5A | Ingestion observability semantics | #98 | additive schema/UI |
| 5B | Bounded dead-letter recovery | #98 | feature-flagged worker/RPC |
| 6A | Evidence lifecycle schema | #99 | additive constraints/statuses |
| 6B | Signal producer evidence links | #99 | runtime change |
| 6C | Bounded zero-evidence backfill | #99 | controlled data migration |
| 7 | Narrow verified catalogue vertical | #100 | staged catalogue growth |
| 8 | Telegram/reviewer/Truth Gate E2E | #101 | test/release gate |
| 9 | Schema/RPC/index hardening | #102 | bounded domain migrations |
| 10 | Single release truth | #103 | metadata/release tooling |

## 5. PR 1A — protected reviewer API

### New Edge Function

`supabase/functions/reviewer-intelligence-api/index.ts`

Request contract:

```json
{
  "action": "overview",
  "initData": "<Telegram Mini App initData>"
}
```

Processing:

```text
validate method and body
→ authenticate initData through telegram-project-api
→ require fresh auth_date and valid HMAC
→ query active gi_evidence_reviewers row
→ reject non-reviewer with 403
→ execute service-role-only overview RPC
→ return bounded typed payload with no-store
```

Required controls:

- explicit origin allowlist;
- no wildcard CORS;
- bounded actions and request size;
- structured error codes;
- no raw database errors;
- version/build metadata in logs;
- `verify_jwt=false` only because custom Telegram authentication is mandatory.

### Web change

Replace direct call in:

`apps/web/hooks/useGovernmentIntelligence.ts`

with the protected Edge Function call carrying Telegram initData. `AccessGate` remains defense-in-depth, not the data boundary.

### CORS cleanup

Audit every `Access-Control-Allow-Origin: *` in Edge Functions. Browser-facing custom-auth functions use an allowlist. Scheduler/OIDC/internal functions should not advertise public browser CORS.

### Acceptance

- valid reviewer: 200;
- valid non-reviewer: 403;
- missing/forged/stale initData: 401;
- no reviewer payload in prerendered HTML;
- Vercel preview READY;
- current direct RPC remains temporarily available only until PR 1B.

### Rollback

Revert web to direct RPC only before PR 1B. After PR 1B, rollback requires the explicit temporary grant migration described below.

## 6. PR 1B — RPC grant migration

Apply only after PR 1A is live and smoke-tested.

```sql
begin;

revoke execute
on function public.get_government_intelligence_overview()
from public, anon, authenticated;

grant execute
on function public.get_government_intelligence_overview()
to service_role;

commit;
```

Do not revoke the other four overview RPCs in the same migration. Classify them individually as public-safe or internal/reviewer-only.

Acceptance query:

```sql
select
  has_function_privilege('anon', 'public.get_government_intelligence_overview()', 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', 'public.get_government_intelligence_overview()', 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', 'public.get_government_intelligence_overview()', 'EXECUTE') as service_execute;
```

Expected: `false / false / true`.

Rollback migration, emergency only:

```sql
grant execute
on function public.get_government_intelligence_overview()
to anon, authenticated;
```

Any rollback grant is time-bounded and tracked as a security incident.

## 7. PR 2 — production Edge Function truth

Artifacts:

- `ops/edge-functions.inventory.json`
- `docs/operations/EDGE_FUNCTION_INVENTORY.md`
- inventory verification script

The verification script compares repository folders, `supabase/config.toml` and a captured live inventory. It fails on missing owner/auth/source metadata.

No function deletion in PR 2.

## 8. PR 3 — reproducible CI and deployment

- retain one authoritative web workflow;
- Node 24 everywhere;
- `npm ci` everywhere;
- root tests + web check/lint/test/build;
- pin Supabase CLI to a tested version;
- use a protected/manual production migration job with an explicit migration list;
- set Vercel Install Command to `npm ci` and record the setting in a runbook;
- classify all 12 npm advisories by reachability and available fix.

## 9. PR 4 — admission decision

No destructive code before an ADR selects one outcome:

- restore with owner, SLO and bounded canary;
- isolate to a dedicated Supabase project/repository;
- retire after caller removal, export and retention window.

The first PR freezes ambiguity, not data.

## 10. PR 5 — government ingestion recovery

Separate health layers:

```text
endpoint reachable
→ fetch successful
→ content extracted
→ version persisted
→ evidence produced
```

Classify all current dead letters. Retry policy is deterministic by error class, bounded by attempts and feature-flagged. Recovery canaries are limited to three sources per adapter/error class.

## 11. PR 6 — evidence graph closure

Target lifecycle:

```text
DETECTED
→ UNVERIFIED_CANDIDATE
→ EVIDENCE_LINKED
→ CORROBORATED
→ TRAJECTORY_READY
→ EXPIRED / REJECTED
```

Database invariants:

- zero evidence cannot be active or trajectory-ready;
- duplicate evidence links are rejected;
- evidence count matches relation rows;
- trajectory-ready requires two independent evidence links unless a documented exception policy applies;
- current 1,862 records are reclassified in bounded batches without fabricated evidence.

## 12. PR 7 — narrow verified catalogue

First bounded vertical: KBR/APK/agrotourism and adjacent financing instruments.

Release gate:

- 10 real structured mechanisms;
- at least 3 fully human-verified measures in the first bounded release;
- every mandatory requirement has exact quote, locator, persisted Tier A version and named reviewer;
- one positive and one negative deterministic E2E case;
- machine candidates remain non-authoritative.

Progress continues toward #83 target of 30 structured and 10 verified measures.

## 13. PR 8 — Web E2E

Mandatory scenarios include missing/forged/stale Telegram initData, reviewer denial, valid reviewer protected API, project create/reopen, upload/deduplication, step navigation, outage errors, Truth Gate negative path, machine-vs-human verification and mobile overflow.

CI never writes to production.

## 14. PR 9 — bounded database hardening

- classify all public tables and `SECURITY DEFINER` RPCs;
- document intentional deny-all RLS;
- move service-only domains out of exposed schemas in bounded releases;
- remove only proven exact duplicate indexes;
- collect 7–14 days of index usage before deleting unused indexes;
- add FK indexes only for real query/delete/update paths.

## 15. PR 10 — version sync

Create one authoritative release descriptor and validate:

- root package;
- web package;
- platform manifest;
- README release block;
- build SHA;
- migration head;
- Edge Function inventory revision;
- capability status.

## 16. Universal merge checklist

- [ ] one issue and one bounded risk domain;
- [ ] `npm ci` succeeds;
- [ ] root tests green;
- [ ] web typecheck/lint/tests/build green;
- [ ] migration reviewed and reversible;
- [ ] Supabase Advisor delta reviewed;
- [ ] Vercel Preview READY;
- [ ] protected API negative tests green;
- [ ] production smoke steps written;
- [ ] rollback steps written;
- [ ] no capability claim exceeds production evidence.

## 17. Production freeze

Until #94 PR 1B and #95 inventory are complete:

- no new public Control Center data;
- no legacy function deletion;
- no bulk queue mutation;
- no broad catalogue claim;
- no automatic signal promotion;
- no database schema big-bang move.
