import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryEventBus, type PlatformEvent } from "../src/events.js";
import {
  assembleGroundedContext,
  InMemoryLexicalRetrievalProvider,
  RetrievalValidationError
} from "../src/retrieval.js";

const evidence = {
  id: "e-1",
  sourceType: "document" as const,
  sourceRef: "doc://rules",
  quote: "verified source",
  status: "verified" as const,
  capturedAt: "2026-07-19T00:00:00.000Z"
};

test("retrieval ranks deterministically and preserves evidence", async () => {
  const provider = new InMemoryLexicalRetrievalProvider();
  provider.add({
    id: "b",
    namespace: "proidu",
    content: "admission scores and university admission",
    source: "doc://b",
    evidence: [evidence]
  });
  provider.add({
    id: "a",
    namespace: "proidu",
    content: "admission routes",
    source: "doc://a",
    evidence: [evidence]
  });

  const results = await provider.search({ text: "admission", limit: 10, filters: { namespace: "proidu" } });
  assert.deepEqual(results.map((item) => item.id), ["a", "b"]);
  assert.equal(results[0]?.evidence[0]?.id, "e-1");
});

test("retrieval isolates namespaces and applies metadata filters", async () => {
  const provider = new InMemoryLexicalRetrievalProvider();
  provider.add({ id: "same", namespace: "proidu", content: "grant route", source: "p", evidence: [], metadata: { region: "kbr" } });
  provider.add({ id: "same", namespace: "grant-ai", content: "grant route", source: "g", evidence: [], metadata: { region: "moscow" } });

  const results = await provider.search({ text: "grant", filters: { namespace: "proidu", region: "kbr" } });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.namespace, "proidu");
});

test("retrieval enforces limits and rejects malformed queries", async () => {
  const provider = new InMemoryLexicalRetrievalProvider();
  await assert.rejects(() => provider.search({ text: "", filters: { namespace: "proidu" } }), RetrievalValidationError);
  await assert.rejects(() => provider.search({ text: "x", limit: 101, filters: { namespace: "proidu" } }), RetrievalValidationError);
  await assert.rejects(() => provider.search({ text: "x" }), RetrievalValidationError);
});

test("indexed and returned values are defensive copies", async () => {
  const provider = new InMemoryLexicalRetrievalProvider();
  const document = {
    id: "d",
    namespace: "proidu",
    content: "original text",
    source: "doc://d",
    evidence: [evidence],
    metadata: { level: "spo" }
  };
  provider.add(document);
  document.metadata.level = "changed";

  const first = await provider.search({ text: "original", filters: { namespace: "proidu" } });
  assert.equal(first[0]?.metadata?.level, "spo");
  (first[0]!.evidence as Array<typeof evidence>)[0]!.sourceRef = "mutated";
  const second = await provider.search({ text: "original", filters: { namespace: "proidu" } });
  assert.equal(second[0]?.evidence[0]?.sourceRef, "doc://rules");
});

test("retrieval emits traceable lifecycle events", async () => {
  const bus = new InMemoryEventBus();
  const events: PlatformEvent[] = [];
  bus.subscribe("*", (event) => events.push(event));
  const provider = new InMemoryLexicalRetrievalProvider(bus);
  provider.add({ id: "d", namespace: "proidu", content: "admission", source: "doc://d", evidence: [] });

  await provider.searchGrounded(
    { text: "admission", filters: { namespace: "proidu" } },
    { requestId: "req-1", traceId: "trace-1", productId: "proidu" }
  );
  assert.deepEqual(events.map((event) => event.type), ["retrieval.search.requested", "retrieval.search.completed"]);
  assert.ok(events.every((event) => event.traceId === "trace-1"));
});

test("grounded context deduplicates citations and rejects mixed namespaces", () => {
  const passage = {
    id: "d",
    namespace: "proidu",
    content: "admission",
    score: 1,
    source: "doc://d",
    evidence: [evidence, evidence],
    matchedTerms: ["admission"]
  };
  const context = assembleGroundedContext("admission", "proidu", [passage]);
  assert.equal(context.citations.length, 1);
  assert.throws(
    () => assembleGroundedContext("x", "grant-ai", [passage]),
    RetrievalValidationError
  );
});
