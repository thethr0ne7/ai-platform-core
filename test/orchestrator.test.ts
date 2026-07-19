import assert from "node:assert/strict";
import test from "node:test";
import { orchestrate } from "../src/orchestrator.js";

test("executes a registered action for an active product", async () => {
  const result = await orchestrate({
    productId: "proidu",
    action: "system.echo",
    payload: { message: "hello" }
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data, { message: "hello" });
  assert.deepEqual(result.capabilitiesUsed, ["orchestration"]);
  assert.ok(result.requestId.length > 0);
  assert.ok(result.traceId.length > 0);
});

test("rejects a planned product", async () => {
  const result = await orchestrate({
    productId: "grant-ai",
    action: "system.echo",
    payload: {}
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "PRODUCT_NOT_ACTIVE");
});

test("rejects an unknown action", async () => {
  const result = await orchestrate({
    productId: "proidu",
    action: "missing.action",
    payload: {}
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "UNKNOWN_ACTION");
});
