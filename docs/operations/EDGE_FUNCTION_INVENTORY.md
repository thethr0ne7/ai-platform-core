# Production Edge Function Inventory

Captured: 2026-08-02  
Supabase project: `hgivyjjethjwswjrvroy`  
Baseline commit: `c6e6fa35a485b7809b538feef44777df5371fdaf`  
Tracking issue: #95

## Summary

| Group | Count | Current action |
|---|---:|---|
| AI Platform Core, repository-managed | 10 | keep; harden where listed |
| Legacy «Проиду» candidates, unmanaged | 9 | investigate, then isolate/retire/restore |
| Unclassified Telegram runtime, unmanaged | 2 | identify owner/source before decision |
| **Total ACTIVE in production** | **21** | no deletion authorized |

## Managed AI Platform Core functions

| Function | Version | JWT gate | Custom auth | Decision |
|---|---:|---:|---|---|
| `telegram-project-api` | 4 | false | Telegram initData HMAC | keep |
| `government-opportunity-api` | 10 | false | Telegram initData HMAC | keep |
| `official-source-ingestion` | 3 | false | internal scheduler token | keep |
| `project-document-processor` | 2 | false | internal scheduler/service contract | keep |
| `project-fact-review` | 2 | false | Telegram initData HMAC | keep |
| `evidence-source-processor` | 4 | false | internal scheduler/service contract | keep |
| `legal-ocr-broker` | 3 | false | GitHub OIDC RS256 | keep |
| `evidence-review` | 3 | false | Telegram HMAC + reviewer allowlist | keep; remove wildcard CORS |
| `measure-direction-enrichment` | 2 | false | Telegram initData HMAC | keep |
| `catalogue-control` | 2 | false | Telegram HMAC + reviewer allowlist | keep |

All ten have source folders under `supabase/functions/` and entries in `supabase/config.toml`.

## Legacy «Проиду» candidates

| Function | Version | JWT gate | Auth status | Initial decision |
|---|---:|---:|---|---|
| `university-ingest` | 10 | true | Supabase JWT | investigate isolate/retire/restore |
| `search` | 6 | false | unknown custom auth | investigate isolate/retire |
| `route` | 6 | false | unknown custom auth | investigate isolate/retire |
| `monitoring-ingest` | 6 | true | Supabase JWT | investigate isolate/retire |
| `monitoring-preview` | 5 | true | Supabase JWT | investigate isolate/retire |
| `federal-source-bootstrap` | 3 | false | unknown custom auth | investigate isolate/retire |
| `coverage` | 3 | false | unknown custom auth | investigate isolate/retire |
| `university-request` | 3 | false | unknown custom auth | investigate isolate/retire |
| `telegram-payments` | 4 | false | Telegram webhook/custom unknown | investigate isolate/retire |

These functions are ACTIVE but absent from the current repository/config deployment truth. They must not be deleted until callers, logs, schedules, queues, secrets and data dependencies are mapped under #97.

## Unclassified Telegram functions

| Function | Version | JWT gate | Decision |
|---|---:|---:|---|
| `telegram-bot-runtime` | 1 | false | identify product owner, source and auth contract |
| `telegram-bot-bootstrap` | 1 | false | identify product owner, source and auth contract |

These are not automatically classified as legacy. Their creation dates suggest they may belong to the current platform or a shared bot layer. Treating them as legacy without source inspection would be unsafe.

## Required inventory completion fields

Before any lifecycle decision, each function must record:

- source repository and path;
- responsible product and owner;
- deployment workflow;
- verified auth implementation;
- secret names used;
- CORS policy;
- known callers;
- database/storage resources touched;
- last observed invocation and error distribution;
- rollback owner;
- final decision and sunset/migration date.

## Drift gate design

A future audit workflow should compare:

```text
live Supabase functions
↔ supabase/functions/*
↔ supabase/config.toml
↔ ops/edge-functions.inventory.json
```

The check fails when:

- a live function is absent from inventory;
- a repository function is absent from config;
- a config entry has no source folder;
- a new function has no owner/auth/decision metadata;
- production version/hash differs from the expected deployment without an emergency record.

## Safety rule

This inventory is descriptive. It does not authorize deletion, secret rotation, redeployment or migration. Those actions require separate reviewed PRs and production evidence.
