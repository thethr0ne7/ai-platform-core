import assert from "node:assert/strict";
import test from "node:test";
import type { PersistentMaiSliceResult } from "../src/supabase-persistence.js";
import {
  loadProiduMaiWorkerConfig,
  runProiduMaiWorker
} from "../src/proidu-mai-worker.js";

const environment = {
  SUPABASE_URL: "https://project.supabase.co/",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
  PROIDU_MAI_QUERY: "программная инженерия"
};

test("worker validates required server-side configuration", () => {
  assert.throws(
    () => loadProiduMaiWorkerConfig({ SUPABASE_SERVICE_ROLE_KEY: "key" }),
    /SUPABASE_URL is required/
  );
  assert.throws(
    () => loadProiduMaiWorkerConfig({ SUPABASE_URL: "http:\/\/project.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "key" }),
    /must use HTTPS/
  );
  assert.throws(
    () => loadProiduMaiWorkerConfig({ SUPABASE_URL: "https:\/\/project.supabase.co" }),
    /SUPABASE_SERVICE_ROLE_KEY is required/
  );
});

test("worker fetches the official source and invokes the persistent pipeline once", async () => {
  const now = new Date("2026-07-20T00:17:00.000Z");
  let fetchedUrl = "";
  let executions = 0;
  let observedSecret = "";

  const summary = await runProiduMaiWorker(environment, {
    now: () => now,
    async fetchHtml(url) {
      fetchedUrl = url;
      return "<html><body>official fixture</body></html>";
    },
    async execute(input): Promise<PersistentMaiSliceResult> {
      executions += 1;
      observedSecret = input.config.serviceRoleKey;
      assert.equal(input.query, "программная инженерия");
      assert.equal(input.job.sourceId, "proidu.mai.programs-2026");
      assert.equal(input.job.scheduledFor, "2026-07-20T00:00:00.000Z");
      assert.equal(input.html.includes("official fixture"), true);
      return {
        job: input.job,
        duplicate: false,
        persistentDuplicate: false,
        parsedCount: 2,
        quarantinedCount: 1,
        versions: [],
        persistedCount: 2,
        searchResults: []
      };
    }
  });

  assert.equal(fetchedUrl, "https://priem.mai.ru/base/programs/");
  assert.equal(executions, 1);
  assert.equal(observedSecret, "service-role-secret");
  assert.equal(summary.status, "succeeded");
  assert.equal(summary.persistedCount, 2);
  assert.equal(summary.completedAt, now.toISOString());
  assert.equal(JSON.stringify(summary).includes("service-role-secret"), false);
  assert.equal(JSON.stringify(summary).includes("project.supabase.co"), false);
});

test("worker returns a bounded duplicate summary without leaking credentials", async () => {
  const summary = await runProiduMaiWorker(environment, {
    now: () => new Date("2026-07-20T06:05:00.000Z"),
    async fetchHtml() {
      return "<html></html>";
    },
    async execute(input): Promise<PersistentMaiSliceResult> {
      return {
        job: input.job,
        duplicate: true,
        persistentDuplicate: true,
        parsedCount: 0,
        quarantinedCount: 0,
        versions: [],
        persistedCount: 2,
        searchResults: []
      };
    }
  });

  assert.equal(summary.status, "duplicate");
  assert.equal(summary.scheduledFor, "2026-07-20T06:00:00.000Z");
  assert.equal(Object.keys(summary).includes("serviceRoleKey"), false);
  assert.equal(Object.keys(summary).includes("supabaseUrl"), false);
});
