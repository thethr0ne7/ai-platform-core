import assert from "node:assert/strict";
import test from "node:test";
import {
  AdapterNotFoundError,
  AdapterRegistrationError,
  ProductAdapterRegistry
} from "../src/adapters.js";
import {
  proiduAdapter,
  ProiduAdapterValidationError
} from "../src/adapters/proidu.js";
import { orchestrate } from "../src/orchestrator.js";

test("registers and resolves the PROIDU adapter", () => {
  const registry = new ProductAdapterRegistry().register(proiduAdapter);

  assert.equal(registry.resolve(proiduAdapter.id), proiduAdapter);
  assert.deepEqual(registry.list(), [
    {
      id: "proidu.admission-query.v1",
      productId: "proidu",
      action: "system.echo"
    }
  ]);
});

test("rejects duplicate adapter registration", () => {
  const registry = new ProductAdapterRegistry().register(proiduAdapter);

  assert.throws(() => registry.register(proiduAdapter), AdapterRegistrationError);
});

test("rejects unknown adapter resolution", () => {
  const registry = new ProductAdapterRegistry();

  assert.throws(() => registry.resolve("missing.adapter"), AdapterNotFoundError);
});

test("converts a PROIDU query into an executable platform request", async () => {
  const request = proiduAdapter.toPlatformRequest({
    educationLevel: "spo",
    exams: { "Русский язык": 78, Математика: 71 },
    region: "КБР"
  });

  const result = await orchestrate(request);
  const output = proiduAdapter.fromPlatformResult(result);

  assert.equal(output.ok, true);
  if (!output.ok) return;
  assert.deepEqual(output.data, {
    kind: "proidu.admission-query",
    query: {
      educationLevel: "spo",
      exams: { "Русский язык": 78, Математика: 71 },
      region: "КБР"
    }
  });
});

test("rejects invalid PROIDU scores before platform execution", () => {
  assert.throws(
    () =>
      proiduAdapter.toPlatformRequest({
        educationLevel: "school",
        exams: { Математика: 101 }
      }),
    ProiduAdapterValidationError
  );
});
