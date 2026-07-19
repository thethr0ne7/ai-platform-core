# PROIDU × MAI scheduled worker v0.13

This worker turns the persistent MAI ingestion slice into a bounded scheduled process.

## Runtime path

`GitHub Actions cron/manual dispatch → config validation → live official fetch → atomic Supabase claim → persistent MAI pipeline → JSON summary`

## Schedule

The workflow runs at minute 17 every six hours:

```text
17 0,6,12,18 * * * UTC
```

The non-zero minute avoids the busiest top-of-hour GitHub Actions window. GitHub schedules are best-effort, so the persistent idempotency key—not exact launch time—is the correctness boundary.

## Required GitHub environment and secrets

Create a GitHub Actions environment named `production` and add:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The service-role key is server-only. Never expose it to a browser, Telegram Mini App, Vercel public environment variable, log, fixture, or client bundle.

## Database setup

Apply:

```text
supabase/migrations/0001_proidu_ingestion.sql
```

before enabling scheduled runs.

## Manual run

The workflow supports `workflow_dispatch` from the GitHub Actions page.

For a trusted local/server environment:

```bash
npm ci
npm run verify
npm run build
SUPABASE_URL="https://<project>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<server-only-key>" \
npm run worker:proidu-mai
```

## Output

Success:

```json
{
  "event": "proidu.mai.worker.completed",
  "status": "succeeded",
  "sourceId": "proidu.mai.programs-2026",
  "scheduledFor": "2026-07-20T00:00:00.000Z",
  "jobId": "...",
  "parsedCount": 2,
  "quarantinedCount": 1,
  "persistedCount": 2,
  "searchResultCount": 1,
  "completedAt": "..."
}
```

A repeated run in the same six-hour window returns `status: "duplicate"` and does not republish versions.

Failure returns exit code `1` and a bounded JSON error message. Secrets and Supabase URLs are not included in the normal summary.

## Safety controls

- workflow concurrency group prevents overlapping scheduled runs;
- `cancel-in-progress: false` avoids killing a valid active ingestion;
- job timeout is 10 minutes;
- source HTTP timeout is 15 seconds per attempt;
- source response is limited to 3 MB;
- redirects are rejected;
- only the fixed official MAI URL is fetched;
- atomic Postgres claim prevents duplicate publication across workers;
- CI tests inject dependencies and never call the public internet.

## Current limits

- GitHub Actions is the scheduler, not a durable queue worker fleet;
- schedules may start late;
- only one official MAI source is supported;
- live HTML changes may quarantine or fail records until the parser is repaired;
- the search index is rebuilt in-process from persisted versions;
- no notification/alert channel is included yet.

## Next reality gate

After secrets and migration are configured, run one manual production dispatch and inspect:

1. workflow JSON output;
2. `ingestion_jobs` status;
3. `data_versions` rows;
4. `evidence_records` rows;
5. `source_checkpoints` status and counts.

Only after a successful manual live run should the scheduled workflow be treated as active production automation.
