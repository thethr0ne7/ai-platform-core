# P10 — Measure Match Provenance Repair

**Parent:** #111  
**Audit:** #109 / PR #110  
**Branch:** `repair/p10-measure-match-provenance`

## Defect

`public.gi_evaluate_project_measures(project_id, telegram_user_id, check_id)` persisted rows with `check_id = NULL` whenever it was called without a check identifier.

The table already had a unique index on `(project_id, measure_id, check_id)`, but PostgreSQL treats `NULL` values as distinct. Repeated preview evaluations therefore created provenance-free duplicates.

## Production evidence

The pre-repair snapshot contains exactly four persisted matches without `check_id`:

- `80c271b2-2074-4522-b34f-ab7caae0edf0`
- `596349eb-fe0a-47b4-b593-ec2ccebd37f7`
- `8c2ecd82-4f84-4e75-9cb8-95b6c9bdfa94`
- `470842a6-48c9-463e-a26a-2b230af9789b`

For each orphan, production contains 20 check-linked rows with identical:

- project;
- measure;
- Telegram user;
- eligibility status and score;
- matched requirements;
- blockers;
- missing data;
- rationale.

There is no unique check to which an orphan can be backfilled. Assigning one would invent provenance. The four rows are therefore removed as proven semantic duplicates.

No foreign key in the current schema references `gi_project_measure_matches.id`.

## Repair behavior

The migration:

1. aborts unless the database contains exactly the four known orphan IDs;
2. aborts unless every orphan has a semantic check-linked duplicate;
3. rewrites only the null-check branch of `gi_evaluate_project_measures`;
4. keeps preview calculation but sets `v_match_id := NULL` and performs no insert;
5. deletes the four proven duplicates;
6. changes `check_id` to `NOT NULL`;
7. verifies zero persisted orphan matches and the read-only preview branch.

The normal path with a real `check_id` remains the existing idempotent upsert.

## Safety

- no guessed backfill;
- no report, task, check, measure or evidence rows are changed;
- migration is transactional;
- any failed precondition or postcondition rolls back the entire migration;
- API compatibility is preserved: preview evaluation still returns calculated match objects, but their transient `id` is `null`.

## Verification

Run after deployment:

```sql
\i ops/e2e/probes/p10-measure-match-provenance.sql
```

All rows must report `PASS`.

## Emergency rollback

A rollback must be explicit because restoring nullable persistence recreates the defect.

1. Drop `NOT NULL` from `gi_project_measure_matches.check_id`.
2. Restore the previous `gi_evaluate_project_measures` definition from migration `20260722153000_apk_territorial_scope_v070.sql` only if the old behavior is deliberately required.
3. Do not restore the four removed rows: they were proven duplicates and carried no unique provenance.
