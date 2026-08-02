# System Interaction Audit v1 — read-only probes

This runner inspects existing production state. It cannot create projects, upload files, mutate rows, retry jobs, review evidence or change Telegram/Vercel configuration.

## Safety boundary

Allowed network methods are:

- `GET`
- `HEAD`
- `OPTIONS`

The runner contains no generic request helper and no `POST`, `PUT`, `PATCH` or `DELETE` path.

Operator credentials are used only for PostgREST `select` visibility. Never expose the service-role key in a browser, Vercel client bundle, logs or issue comments.

## Environment

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<operator-secret>"
export PRODUCTION_ORIGIN="https://ai-platform-core.vercel.app"
```

## Run

```bash
npx tsx ops/e2e/probes/run.ts \
  > ops/e2e/baselines/$(date -u +%F).production.json
```

A non-zero exit code means at least one probe is `FAIL`. `SKIP` means a layer is intentionally disabled or cannot be proved without a write-capable test fixture.

## Interpretation

- `PASS` — existing state and contract prove the transition.
- `PARTIAL` — transport or contract exists, but a read-only probe cannot prove the full transition.
- `FAIL` — a required relationship, verified record or recovery path is absent.
- `SKIP` — intentionally disabled or blocked by prerequisites.

## What this does not prove

Existing rows show that a transition has worked before. They do not prove repeatability, latency, retry behavior or idempotency under a fresh synthetic transaction. Those properties require a separate isolated test project and explicit write authorization.
