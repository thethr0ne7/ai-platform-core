import assert from "node:assert/strict";
import test from "node:test";
import { registerAction } from "../src/actions.js";
import { InMemoryEventBus, type PlatformEvent } from "../src/events.js";
import { orchestrate } from "../src/orchestrator.js";

function collect(bus: InMemoryEventBus): PlatformEvent[] {
  const events: PlatformEvent[] = [];
  bus.subscribe("*", async (event) => {
    events.push(event);
  });
  return events;
}

test("successful execution emits the complete ordered lifecycle", async () => {
  const bus = new InMemoryEventBus();
  const events = collect(bus);

  const result = await orchestrate(
    {
      requestId: "request-success",
      productId: "proidu",
      action: "system.echo",
      payload: { message: "hello" }
    },
    undefined,
    bus
  );

  assert.equal(result.ok, true);
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "request.received",
      "request.validated",
      "product.resolved",
      "action.resolved",
      "capability.checked",
      "action.started",
      "action.completed"
    ]
  );
  assert.ok(events.every((event) => event.requestId === "request-success"));
  assert.ok(events.every((event) => event.traceId === result.traceId));
});

test("handler failure emits action.failed instead of action.completed", async () => {
  const action = `test.failure.${Date.now()}`;
  registerAction({
    action,
    requiredCapabilities: ["orchestration"],
    async execute() {
      throw new Error("controlled failure");
    }
  });

  const bus = new InMemoryEventBus();
  const events = collect(bus);
  const result = await orchestrate(
    {
      productId: "proidu",
      action,
      payload: {}
    },
    undefined,
    bus
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "HANDLER_FAILED");
  assert.equal(events.at(-1)?.type, "action.failed");
  assert.equal(events.some((event) => event.type === "action.completed"), false);
});

test("best-effort event failures do not fail the business action", async () => {
  const bus = new InMemoryEventBus("best-effort");
  bus.subscribe("*", async () => {
    throw new Error("observability sink failed");
  });

  const result = await orchestrate(
    {
      productId: "proidu",
      action: "system.echo",
      payload: { stable: true }
    },
    undefined,
    bus
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data, { stable: true });
});
