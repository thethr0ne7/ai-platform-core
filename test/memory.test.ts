import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryEventBus, type PlatformEvent } from "../src/events.js";
import {
  InMemoryEvidenceProvider,
  MemoryPolicyError,
  type EvidenceRecord
} from "../src/memory.js";

const verified: EvidenceRecord = {
  id: "evidence-1",
  sourceType: "document",
  sourceRef: "doc://program-2026",
  quote: "Admission rules approved",
  status: "verified",
  capturedAt: "2026-07-19T00:00:00.000Z"
};

test("creates immutable version history", async () => {
  const memory = new InMemoryEvidenceProvider();
  const content = { score: 70 };
  const first = await memory.put({ id: "route", namespace: "proidu", subject: "route", content });
  content.score = 1;
  const second = await memory.put({ id: "route", namespace: "proidu", subject: "route", content: { score: 80 } });

  assert.equal(first.version, 1);
  assert.equal(second.version, 2);
  const history = await memory.history<{ score: number }>("proidu", "route");
  assert.deepEqual(history.map((item) => item.content.score), [70, 80]);

  (history[0]!.content as { score: number }).score = 0;
  const stored = await memory.read<{ score: number }>("proidu", "route");
  assert.equal(stored?.content.score, 80);
});

test("requires evidence when policy demands it", async () => {
  const memory = new InMemoryEvidenceProvider("require-evidence");
  await assert.rejects(
    memory.put({ namespace: "government", subject: "claim", content: "text" }),
    MemoryPolicyError
  );
});

test("verified-only rejects unverified evidence", async () => {
  const memory = new InMemoryEvidenceProvider("verified-only");
  await assert.rejects(
    memory.put({
      namespace: "government",
      subject: "claim",
      content: "text",
      evidence: [{ ...verified, status: "unverified" }]
    }),
    MemoryPolicyError
  );

  const accepted = await memory.put({
    namespace: "government",
    subject: "claim",
    content: "text",
    evidence: [verified]
  });
  assert.equal(accepted.version, 1);
});

test("isolates records by namespace", async () => {
  const memory = new InMemoryEvidenceProvider();
  await memory.put({ id: "shared", namespace: "proidu", subject: "route", content: 1 });
  await memory.put({ id: "shared", namespace: "grant-ai", subject: "route", content: 2 });

  assert.equal((await memory.read<number>("proidu", "shared"))?.content, 1);
  assert.equal((await memory.read<number>("grant-ai", "shared"))?.content, 2);
  assert.equal((await memory.list("proidu")).length, 1);
});

test("emits memory events with supplied trace context", async () => {
  const bus = new InMemoryEventBus();
  const events: PlatformEvent[] = [];
  bus.subscribe("*", (event) => events.push(event));
  const memory = new InMemoryEvidenceProvider("verified-only", bus);

  await memory.put(
    { namespace: "proidu", subject: "route", content: {}, evidence: [verified] },
    { requestId: "req-7", traceId: "trace-7", productId: "proidu" }
  );

  assert.deepEqual(events.map((event) => event.type), [
    "memory.write.requested",
    "memory.version.created",
    "evidence.attached",
    "memory.write.completed"
  ]);
  assert.ok(events.every((event) => event.requestId === "req-7" && event.traceId === "trace-7"));
  assert.ok(events.every((event) => event.productId === "proidu"));
});

test("legacy provider API remains usable", async () => {
  const memory = new InMemoryEvidenceProvider();
  await memory.set({ key: "proidu:legacy", value: { ok: true }, updatedAt: new Date().toISOString() });
  const record = await memory.get<{ ok: boolean }>("proidu:legacy");
  assert.deepEqual(record?.value, { ok: true });
  assert.equal(await memory.delete("proidu:legacy"), true);
});