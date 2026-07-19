import assert from "node:assert/strict";
import test from "node:test";
import { registerAction } from "../src/actions.js";
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

test("rejects an action when the product lacks a required capability", async () => {
  registerAction({
    action: "test.billing-only",
    requiredCapabilities: ["billing"],
    async execute() {
      return { charged: true };
    }
  });

  const result = await orchestrate({
    productId: "proidu",
    action: "test.billing-only",
    payload: {}
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "CAPABILITY_DENIED");
  assert.match(result.error.message, /billing/);
});

test("converts action exceptions into a stable handler failure", async () => {
  registerAction({
    action: "test.failure",
    requiredCapabilities: ["orchestration"],
    async execute() {
      throw new Error("controlled failure");
    }
  });

  const result = await orchestrate({
    productId: "proidu",
    action: "test.failure",
    payload: {}
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "HANDLER_FAILED");
  assert.equal(result.error.message, "controlled failure");
  assert.ok(result.traceId.length > 0);
});
