# Source Health Recovery v0.59

Verified against the production Supabase project on 2026-07-22.

## Root cause

The previous crawler used PostgreSQL `pg_net` as the primary fetch runtime. A large portion of federal and regional official sites timed out, rejected cloud traffic, returned TLS/DNS errors, or were protected by anti-DDoS services. The old pipeline collapsed these distinct failures into generic `fetch_failed` results and left the application showing raw `degraded` states.

## Production repair

- Replaced the old crawler schedule with the Supabase Edge worker `official-source-ingestion-v0.59`.
- Added explicit health classification, retries, endpoint variants and evidence persistence.
- Added official public channels as verified fallback endpoints when the primary website rejects cloud traffic.
- Added Russian source status labels to the project report.
- Updated 22 stored project reports with the current source catalog.

## Verification run

- Run ID: `ab2762de-d435-41d4-8a0a-97786a0269ac`
- Status: `completed`
- Duration: `8,892 ms`
- Active sources processed: `35`
- Healthy: `35`
- Degraded: `0`
- Blocked: `0`
- Failed: `0`
- Evidence records persisted during the run: `105`

## Operating schedule

The source worker is scheduled hourly at minute 17. Source health and report status are updated after every run.
