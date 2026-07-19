import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createIngestionJob, SourceRegistry } from "../src/autonomous-data.js";
import { InMemoryEvidenceProvider } from "../src/memory.js";
import { InMemoryLexicalRetrievalProvider } from "../src/retrieval.js";
import { executeWorkflow } from "../src/workflow.js";
import {
  fetchOfficialHtml,
  InMemoryIngestionLedger,
  parseMaiPrograms,
  PROIDU_MAI_REQUIREMENT,
  PROIDU_MAI_SOURCE,
  runMaiVerticalSlice,
  SourceFetchError
} from "../src/proidu-mai.js";

const fixtureUrl = new URL("./fixtures/mai-programs-2026.html", import.meta.url);

async function fixture(): Promise<string> {
  return readFile(fixtureUrl, "utf8");
}

test("parses official MAI 2026 fixture and quarantines malformed records", async () => {
  const result = parseMaiPrograms(await fixture());
  assert.equal(result.records.length, 2);
  assert.equal(result.quarantine.length, 1);
  const first = result.records[0];
  assert.ok(first);
  assert.equal(first.institution, "Московский авиационный институт");
  assert.equal(first.admissionYear, 2026);
  assert.equal(first.title, "Прикладная математика и информатика");
  assert.equal(first.code, "01.03.02");
  assert.equal(first.exams.includes("Математика"), true);
  assert.equal(first.exams.includes("Информатика или физика"), true);
  assert.equal(first.city, "Москва");
  assert.equal(first.studyForm, "Очная");
  assert.equal(first.budgetSeats, 125);
  assert.equal(first.paidSeats, 55);
  assert.equal(first.budgetPassingScore, 275);
  assert.equal(first.paidPassingScore, 220);
  assert.equal(first.sourceUrl, "https://priem.mai.ru/base/programs/");
});

test("runs requirement to version to index to grounded query without duplicates", async () => {
  const now = new Date("2026-07-19T18:15:00.000Z");
  const registry = new SourceRegistry([PROIDU_MAI_REQUIREMENT], [PROIDU_MAI_SOURCE]);
  const source = registry.getSource(PROIDU_MAI_SOURCE.id);
  assert.ok(source);
  const job = createIngestionJob(source, now);
  const ledger = new InMemoryIngestionLedger();
  const memory = new InMemoryEvidenceProvider("verified-only");
  const retrieval = new InMemoryLexicalRetrievalProvider();
  const html = await fixture();

  const first = await runMaiVerticalSlice({
    job,
    html,
    query: "программная инженерия Москва",
    now,
    ledger,
    memory,
    retrieval
  });

  assert.equal(first.duplicate, false);
  assert.equal(first.parsedCount, 2);
  assert.equal(first.quarantinedCount, 1);
  assert.equal(first.versions.length, 2);
  assert.equal(first.searchResults[0]?.content.includes("Программная инженерия"), true);
  assert.equal(first.searchResults[0]?.source, PROIDU_MAI_SOURCE.url);
  assert.equal(first.searchResults[0]?.evidence[0]?.status, "verified");

  const second = await runMaiVerticalSlice({
    job,
    html,
    query: "программная инженерия Москва",
    now,
    ledger,
    memory,
    retrieval
  });

  assert.equal(second.duplicate, true);
  assert.equal(second.parsedCount, 0);
  assert.equal((await memory.list("proidu:mai:2026")).length, 2);
  assert.equal(second.searchResults.length > 0, true);
});

test("bounded fetcher rejects redirect, wrong type and oversized bodies", async () => {
  const redirectFetch = async () => new Response("", { status: 302, headers: { location: "https://example.com" } });
  await assert.rejects(
    fetchOfficialHtml(PROIDU_MAI_SOURCE.url, { maxAttempts: 1 }, redirectFetch as typeof fetch),
    (error: unknown) => error instanceof SourceFetchError && error.code === "redirect"
  );

  const jsonFetch = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  await assert.rejects(
    fetchOfficialHtml(PROIDU_MAI_SOURCE.url, { maxAttempts: 1 }, jsonFetch as typeof fetch),
    (error: unknown) => error instanceof SourceFetchError && error.code === "content-type"
  );

  const largeFetch = async () => new Response("x".repeat(101), { status: 200, headers: { "content-type": "text/html" } });
  await assert.rejects(
    fetchOfficialHtml(PROIDU_MAI_SOURCE.url, { maxAttempts: 1, maxResponseBytes: 100 }, largeFetch as typeof fetch),
    (error: unknown) => error instanceof SourceFetchError && error.code === "too-large"
  );
});

test("fail-fast with concurrency above one does not start a second execution wave", async () => {
  const started: string[] = [];
  const result = await executeWorkflow(
    {
      id: "fail-fast-concurrent",
      steps: [
        {
          id: "a-fails",
          async run() {
            started.push("a-fails");
            throw new Error("boom");
          }
        },
        {
          id: "b-in-flight",
          async run() {
            started.push("b-in-flight");
          }
        },
        {
          id: "c-second-wave",
          dependsOn: ["b-in-flight"],
          async run() {
            started.push("c-second-wave");
          }
        }
      ]
    },
    {},
    { concurrency: 2, failurePolicy: "fail-fast" }
  );

  assert.deepEqual(started.sort(), ["a-fails", "b-in-flight"]);
  assert.equal(result.steps.find((step) => step.id === "c-second-wave")?.status, "skipped");
});

test("retrieval supports add remove and re-add of the same document", async () => {
  const retrieval = new InMemoryLexicalRetrievalProvider();
  const document = {
    id: "09.03.04",
    namespace: "proidu:mai:2026",
    content: "Программная инженерия Москва",
    source: PROIDU_MAI_SOURCE.url,
    evidence: []
  };
  retrieval.add(document);
  assert.equal(retrieval.remove(document.namespace, document.id), true);
  retrieval.add(document);
  const results = await retrieval.search({ text: "программная инженерия", filters: { namespace: document.namespace } });
  assert.equal(results[0]?.id, document.id);
});
