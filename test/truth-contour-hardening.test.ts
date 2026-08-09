import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("legacy run_check endpoint is removed", async () => {
  const source = await read("../supabase/functions/telegram-project-api/index.ts");
  assert.doesNotMatch(source, /action === ["']run_check["']/);
  assert.doesNotMatch(source, /available_internal_registry/);
});

test("browser roles cannot mutate project checks", async () => {
  const migration = await read("../supabase/migrations/20260808090000_harden_project_check_provenance.sql");
  assert.match(migration, /revoke insert, update, delete/);
  assert.match(migration, /drop policy if exists gi_checks_insert_own/);
  assert.match(migration, /add column if not exists engine_version/);
  assert.match(migration, /add column if not exists source_snapshot_ids/);
  assert.match(migration, /add column if not exists truth_gate_status/);
  assert.match(migration, /add column if not exists created_by/);
  assert.match(migration, /add column if not exists check_kind/);
});

test("partial and legacy checks cannot feed intelligence or enrichment", async () => {
  const opportunity = await read("../supabase/functions/government-opportunity-api/index.ts");
  const enrichment = await read("../supabase/functions/measure-direction-enrichment/index.ts");
  assert.match(opportunity, /partial_check_not_eligible_for_intelligence/);
  assert.match(enrichment, /project_check_not_eligible_for_enrichment/);
  assert.match(enrichment, /check_kind !== "government_opportunity"/);
});

test("browser-facing review functions use the shared origin allowlist", async () => {
  for (const path of [
    "../supabase/functions/evidence-review/index.ts",
    "../supabase/functions/project-fact-review/index.ts",
  ]) {
    const source = await read(path);
    assert.doesNotMatch(source, /access-control-allow-origin["']?:\s*["']\*["']/i);
    assert.match(source, /\.\.\/_shared\/cors\.ts/);
    assert.match(source, /origin_not_allowed/);
  }
});
