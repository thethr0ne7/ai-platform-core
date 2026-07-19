# PROIDU Supabase persistence v0.12

This stage keeps the proven MAI ingestion workflow and replaces process-local idempotency/version state with Supabase/Postgres persistence.

## Path

`scheduled job → atomic claim → existing MAI workflow → persist versions/evidence → checkpoint source → complete job`

## Apply migration

Run `supabase/migrations/0001_proidu_ingestion.sql` in the Supabase SQL editor or through the Supabase CLI.

The migration creates:

- `ingestion_jobs`
- `data_versions`
- `evidence_records`
- `source_checkpoints`
- atomic RPC function `claim_ingestion_job`

RLS is enabled. The claim RPC is executable only by the Supabase `service_role` role.

## Runtime environment

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_KEY
```

The service-role key must never be exposed to a browser, Telegram Mini App client or public Vercel environment variable. It belongs only in a trusted server/worker runtime.

## Usage

```ts
const client = new SupabasePostgrestClient({
  url: process.env.SUPABASE_URL!,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!
});

const result = await runPersistentMaiVerticalSlice({
  job,
  html,
  query: "программная инженерия",
  now: new Date(),
  ledger: new SupabaseIngestionLedger(client),
  versions: new SupabaseVersionStore(client),
  checkpoints: new SupabaseSourceCheckpointStore(client)
});
```

## Guarantees proved in tests

1. A job is claimed atomically through one RPC call.
2. Completed idempotency keys cannot publish duplicate versions after adapter recreation.
3. Version rows and evidence use conflict-safe inserts.
4. Persisted versions can rebuild the in-memory retrieval index after restart.
5. Successful runs update an active source checkpoint.
6. Failed runs mark the job failed and source checkpoint degraded.
7. CI uses an injected deterministic fake PostgREST backend and never calls the public internet.

## Remaining limitations

- The scheduler itself is not deployed yet.
- Retrieval is rebuilt into the v0.8 in-memory lexical provider; the search index is not persistent.
- The first migration assumes one trusted server-side worker using the service-role key.
- There is no lease expiry/recovery for a worker that dies after claiming a job.
- There is no dead-letter transition or retry scheduler yet.
- Only the MAI source is integrated.

## Next reality gate

Deploy one scheduled server-side run, execute the migration against a real Supabase project, then prove:

1. first run inserts job/version/evidence/checkpoint rows;
2. process restart occurs;
3. second run receives the same scheduling-window idempotency key;
4. the database rejects duplicate execution;
5. persisted versions rebuild searchable MAI results.
