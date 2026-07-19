import assert from "node:assert/strict";
import test from "node:test";
import {
  ConfigurationValidationError,
  parsePlatformConfig,
  parseProductDefinition
} from "../src/config.js";
import { ProductRegistry } from "../src/registry.js";

test("parses a valid declarative platform configuration", () => {
  const config = parsePlatformConfig({
    products: [
      {
        id: "sample-product",
        name: " Sample Product ",
        status: "active",
        capabilities: ["orchestration", "analytics"]
      }
    ]
  });

  assert.equal(config.products[0]?.name, "Sample Product");
  assert.deepEqual(config.products[0]?.capabilities, ["orchestration", "analytics"]);
});

test("rejects invalid product identifiers", () => {
  assert.throws(
    () =>
      parseProductDefinition({
        id: "Invalid Product",
        name: "Invalid",
        status: "active",
        capabilities: []
      }),
    (error) =>
      error instanceof ConfigurationValidationError && error.path === "product.id"
  );
});

test("rejects unknown capabilities", () => {
  assert.throws(
    () =>
      parseProductDefinition({
        id: "sample",
        name: "Sample",
        status: "active",
        capabilities: ["unknown-capability"]
      }),
    (error) =>
      error instanceof ConfigurationValidationError &&
      error.path === "product.capabilities[0]"
  );
});

test("rejects duplicate product identifiers", () => {
  assert.throws(
    () =>
      parsePlatformConfig({
        products: [
          { id: "sample", name: "One", status: "active", capabilities: [] },
          { id: "sample", name: "Two", status: "planned", capabilities: [] }
        ]
      }),
    (error) =>
      error instanceof ConfigurationValidationError &&
      error.message.includes("duplicate product id: sample")
  );
});

test("registry protects internal state from caller mutation", () => {
  const source = {
    products: [
      {
        id: "sample",
        name: "Sample",
        status: "active",
        capabilities: ["orchestration"]
      }
    ]
  };
  const registry = new ProductRegistry(source);

  source.products[0]!.name = "Mutated source";
  source.products[0]!.capabilities.push("analytics");

  const first = registry.get("sample");
  assert.equal(first?.name, "Sample");
  assert.deepEqual(first?.capabilities, ["orchestration"]);

  first!.name = "Mutated result";
  first!.capabilities.push("analytics");

  const second = registry.get("sample");
  assert.equal(second?.name, "Sample");
  assert.deepEqual(second?.capabilities, ["orchestration"]);
});

test("registry instances remain isolated", () => {
  const first = new ProductRegistry({
    products: [{ id: "one", name: "One", status: "active", capabilities: [] }]
  });
  const second = new ProductRegistry({
    products: [{ id: "two", name: "Two", status: "active", capabilities: [] }]
  });

  assert.equal(first.has("one"), true);
  assert.equal(first.has("two"), false);
  assert.equal(second.has("two"), true);
  assert.equal(second.has("one"), false);
});
