import assert from "node:assert/strict";
import test from "node:test";
import { EventDispatchError, InMemoryEventBus } from "../src/events.js";

test("publishes to typed and wildcard subscribers in registration order", async () => {
  const bus = new InMemoryEventBus();
  const received: string[] = [];

  bus.subscribe("action.started", async () => {
    received.push("typed");
  });
  bus.subscribe("*", async () => {
    received.push("wildcard");
  });

  const event = await bus.publish({
    type: "action.started",
    requestId: "request-1",
    traceId: "trace-1",
    productId: "proidu",
    action: "system.echo",
    payload: {}
  });

  assert.deepEqual(received, ["typed", "wildcard"]);
  assert.equal(event.requestId, "request-1");
  assert.equal(event.traceId, "trace-1");
  assert.ok(event.eventId.length > 0);
  assert.ok(event.timestamp.length > 0);
});

test("best-effort mode isolates subscriber failures", async () => {
  const bus = new InMemoryEventBus("best-effort");
  let healthySubscriberRan = false;

  bus.subscribe("*", async () => {
    throw new Error("sink unavailable");
  });
  bus.subscribe("*", async () => {
    healthySubscriberRan = true;
  });

  await bus.publish({
    type: "request.received",
    requestId: "request-2",
    traceId: "trace-2",
    payload: {}
  });

  assert.equal(healthySubscriberRan, true);
});

test("strict mode surfaces deterministic dispatch errors", async () => {
  const bus = new InMemoryEventBus("strict");
  bus.subscribe("action.failed", async () => {
    throw new Error("strict sink failure");
  });

  await assert.rejects(
    bus.publish({
      type: "action.failed",
      requestId: "request-3",
      traceId: "trace-3",
      payload: { code: "HANDLER_FAILED" }
    }),
    (error: unknown) => {
      assert.ok(error instanceof EventDispatchError);
      assert.equal(error.event.type, "action.failed");
      assert.equal(error.causes.length, 1);
      return true;
    }
  );
});

test("unsubscribe removes a subscriber", async () => {
  const bus = new InMemoryEventBus();
  let calls = 0;
  const unsubscribe = bus.subscribe("request.validated", async () => {
    calls += 1;
  });

  unsubscribe();
  await bus.publish({
    type: "request.validated",
    requestId: "request-4",
    traceId: "trace-4",
    payload: {}
  });

  assert.equal(calls, 0);
});
