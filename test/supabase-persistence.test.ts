import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createIngestionJob } from "../src/autonomous-data.js";
import { PROIDU_MAI_SOURCE } from "../src/proidu-mai.js";
import {
  SupabaseIngestionLedger,
  SupabasePostgrestClient,
  SupabaseSourceCheckpointStore,
  SupabaseVersionStore,
  runPersistentMaiVerticalSlice
} from "../src/supabase-persistence.js";

interface FakeState {
  jobs: Map<string, Record<string, unknown>>;
  versions: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  checkpoints: Map<string, Record<string, unknown>>;
  requests: Array<{ url: string; method: string; headers: Headers }>;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(value === undefined ? null : JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function bodyOf(init: RequestInit | undefined): Record<string, unknown> | Array<Record<string, unknown>> {
  return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> | Array<Record<string, unknown>>;
}

function fakeSupabase(state: FakeState): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    state.requests.push({ url: url.toString(), method, headers });

    if (url.pathname.endsWith("/rpc/claim_ingestion_job") && method === "POST") {
      const body = bodyOf(init) as Record<string, unknown>;
      const key = String(body.p_idempotency_key);
      const existing = state.jobs.get(key);
      if (existing) return jsonResponse([{ claimed: false, job_status: existing.status }]);
      state.jobs.set(key, {
        id: body.p_id,
        idempotency_key: key,
        source_id: body.p_source_id,
        status: "running"
      });
      return jsonResponse([{ claimed: true, job_status: "running" }]);
    }

    if (url.pathname.endsWith("/ingestion_jobs") && method === "PATCH") {
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const body = bodyOf(init) as Record<string, unknown>;
      const entry = [...state.jobs.entries()].find(([, job]) => job.id === id);
      if (entry) state.jobs.set(entry[0], { ...entry[1], ...body });
      return jsonResponse(undefined, 204);
    }

    if (url.pathname.endsWith("/data_versions") && method === "POST") {
      const body = bodyOf(init) as Record<string, unknown>;
      const duplicate = state.versions.some((row) =>
        row.namespace === body.namespace && row.record_id === body.record_id && row.content_hash === body.content_hash
      );
      if (!duplicate) state.versions.push(structuredClone(body));
      return jsonResponse(undefined, 201);
    }

    if (url.pathname.endsWith("/data_versions") && method === "GET") {
      const namespace = url.searchParams.get("namespace")?.replace(/^eq\./, "");
      const rows = state.versions
        .filter((row) => row.namespace === namespace)
        .sort((left, right) => String(left.subject).localeCompare(String(right.subject)));
      return jsonResponse(rows);
    }

    if (url.pathname.endsWith("/evidence_records") && method === "POST") {
      const rows = bodyOf(init);
      const items = Array.isArray(rows) ? rows : [rows];
      for (const row of items) {
        if (!state.evidence.some((item) => item.evidence_id === row.evidence_id)) {
          state.evidence.push(structuredClone(row));
        }
      }
      return jsonResponse(undefined, 201);
    }

    if (url.pathname.endsWith("/source_checkpoints") && method === "POST") {
      const body = bodyOf(init) as Record<string, unknown>;
      state.checkpoints.set(String(body.source_id), structuredClone(body));
      return jsonResponse(undefined, 201);
    }

    return jsonResponse({ message: `Unhandled fake route: ${method} ${url.pathname}` }, 500);
  };
}

function adapters(state: FakeState) {
  const client = new SupabasePostgrestClient(
    { url: "https://project.supabase.co", serviceRoleKey: "test-service-role" },
    fakeSupabase(state)
  );
  return {
    ledger: new SupabaseIngestionLedger(client),
    versions: new SupabaseVersionStore(client),
    checkpoints: new SupabaseSourceCheckpointStore(client)
  };
}

function newState(): FakeState {
  return {
    jobs: new Map(),
    versions: [],
    evidence: [],
    checkpoints: new Map(),
    requests: []
  };
}

test("persistent MAI ingestion survives adapter restart and rejects duplicate publication", async () => {
  const html = await readFile(new URL("./fixtures/mai-programs-2026.html", import.meta.url), "utf8");
  const now = new Date("2026-07-19T18:00:00.000Z");
  const job = createIngestionJob(PROIDU_MAI_SOURCE, now);
  const state = newState();

  const first = await runPersistentMaiVerticalSlice({
    job,
    html,
    query: "программная инженерия",
    now,
    ...adapters(state)
  });

  assert.equal(first.persistentDuplicate, false);
  assert.equal(first.persistedCount, 2);
  assert.equal(state.versions.length, 2);
  assert.equal(state.evidence.length, 2);
  assert.equal(state.jobs.get(job.idempotencyKey)?.status, "succeeded");
  assert.equal(state.checkpoints.get(job.sourceId)?.status, "active");

  const second = await runPersistentMaiVerticalSlice({
    job,
    html,
    query: "программная инженерия",
    now,
    ...adapters(state)
  });

  assert.equal(second.persistentDuplicate, true);
  assert.equal(second.persistedCount, 2);
  assert.equal(state.versions.length, 2);
  assert.equal(state.evidence.length, 2);
  assert.equal(second.searchResults[0]?.content.includes("Программная инженерия"), true);

  const firstRequest = state.requests[0];
  assert.equal(firstRequest?.headers.get("apikey"), "test-service-role");
  assert.equal(firstRequest?.headers.get("authorization"), "Bearer test-service-role");
});

test("persistent MAI ingestion marks failed jobs and degraded source checkpoints", async () => {
  const now = new Date("2026-07-19T19:00:00.000Z");
  const job = createIngestionJob(PROIDU_MAI_SOURCE, now);
  const state = newState();

  await assert.rejects(
    runPersistentMaiVerticalSlice({
      job,
      html: "<html><body><h3>Broken source</h3></body></html>",
      query: "программа",
      now,
      ...adapters(state)
    }),
    /produced no valid records/
  );

  assert.equal(state.jobs.get(job.idempotencyKey)?.status, "failed");
  assert.equal(state.checkpoints.get(job.sourceId)?.status, "degraded");
  assert.match(String(state.jobs.get(job.idempotencyKey)?.error), /produced no valid records/);
});

test("Supabase persistence validates URL and service key before network access", () => {
  assert.throws(
    () => new SupabasePostgrestClient({ url: "http://project.supabase.co", serviceRoleKey: "key" }),
    /must use HTTPS/
  );
  assert.throws(
    () => new SupabasePostgrestClient({ url: "https://project.supabase.co", serviceRoleKey: "" }),
    /service role key is required/
  );
});
