import assert from "node:assert/strict";
import test from "node:test";
import {
  executeWorkflow,
  topologicalOrder,
  WorkflowValidationError
} from "../src/workflow.js";

test("produces deterministic topological order", () => {
  const order = topologicalOrder({
    id: "pipeline",
    steps: [
      { id: "publish", dependsOn: ["validate", "index"], async run() {} },
      { id: "index", dependsOn: ["load"], async run() {} },
      { id: "validate", dependsOn: ["load"], async run() {} },
      { id: "load", async run() {} }
    ]
  });
  assert.deepEqual(order, ["load", "index", "validate", "publish"]);
});

test("rejects cycles before execution", () => {
  assert.throws(
    () =>
      topologicalOrder({
        id: "cycle",
        steps: [
          { id: "a", dependsOn: ["b"], async run() {} },
          { id: "b", dependsOn: ["a"], async run() {} }
        ]
      }),
    (error: unknown) => error instanceof WorkflowValidationError && /cycle/.test(error.message)
  );
});

test("rejects duplicate ids and missing dependencies", () => {
  assert.throws(
    () =>
      topologicalOrder({
        id: "duplicate",
        steps: [
          { id: "a", async run() {} },
          { id: "a", async run() {} }
        ]
      }),
    /Duplicate workflow step id/
  );
  assert.throws(
    () =>
      topologicalOrder({
        id: "missing",
        steps: [{ id: "a", dependsOn: ["missing"], async run() {} }]
      }),
    /Unknown dependency/
  );
});

test("never starts a dependent step before its dependency succeeds", async () => {
  const calls: string[] = [];
  const result = await executeWorkflow(
    {
      id: "ordered",
      steps: [
        {
          id: "first",
          async run() {
            calls.push("first");
          }
        },
        {
          id: "second",
          dependsOn: ["first"],
          async run() {
            calls.push("second");
          }
        }
      ]
    },
    {}
  );
  assert.deepEqual(calls, ["first", "second"]);
  assert.equal(result.status, "succeeded");
});

test("enforces bounded concurrency", async () => {
  let running = 0;
  let maximum = 0;
  const step = (id: string) => ({
    id,
    async run() {
      running += 1;
      maximum = Math.max(maximum, running);
      await new Promise((resolve) => setTimeout(resolve, 10));
      running -= 1;
    }
  });
  await executeWorkflow(
    { id: "bounded", steps: [step("a"), step("b"), step("c"), step("d")] },
    {},
    { concurrency: 2 }
  );
  assert.equal(maximum, 2);
});

test("fail-fast skips unscheduled work after a failure", async () => {
  const result = await executeWorkflow(
    {
      id: "fail-fast",
      steps: [
        { id: "a", async run() { throw new Error("boom"); } },
        { id: "b", dependsOn: ["a"], async run() {} },
        { id: "c", async run() {} }
      ]
    },
    {},
    { concurrency: 1, failurePolicy: "fail-fast" }
  );
  const statuses = Object.fromEntries(result.steps.map((step) => [step.id, step.status]));
  assert.deepEqual(statuses, { a: "failed", b: "skipped", c: "skipped" });
  assert.equal(result.status, "failed");
});

test("continue-independent completes unrelated branches", async () => {
  const calls: string[] = [];
  const result = await executeWorkflow(
    {
      id: "independent",
      steps: [
        { id: "a", async run() { throw new Error("boom"); } },
        { id: "blocked", dependsOn: ["a"], async run() { calls.push("blocked"); } },
        { id: "independent", async run() { calls.push("independent"); } }
      ]
    },
    {},
    { concurrency: 2, failurePolicy: "continue-independent" }
  );
  const statuses = Object.fromEntries(result.steps.map((step) => [step.id, step.status]));
  assert.deepEqual(statuses, { a: "failed", blocked: "skipped", independent: "succeeded" });
  assert.deepEqual(calls, ["independent"]);
});

test("rejects unbounded or invalid concurrency", async () => {
  await assert.rejects(
    executeWorkflow({ id: "invalid", steps: [] }, {}, { concurrency: 0 }),
    /between 1 and 64/
  );
  await assert.rejects(
    executeWorkflow({ id: "invalid", steps: [] }, {}, { concurrency: 65 }),
    /between 1 and 64/
  );
});
