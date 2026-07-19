import assert from "node:assert/strict";
import test from "node:test";
import { registerAction } from "../src/actions.js";
import {
  DependencyContainer,
  ProviderNotFoundError,
  ProviderRegistrationError
} from "../src/container.js";
import { orchestrate } from "../src/orchestrator.js";
import type { ConfigurationProvider } from "../src/providers.js";

function configurationProvider(id: string, values: Record<string, string>): ConfigurationProvider {
  return {
    kind: "configuration",
    id,
    get(key) {
      return values[key];
    },
    require(key) {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing configuration: ${key}`);
      return value;
    }
  };
}

test("registers and resolves a typed provider", () => {
  const container = new DependencyContainer();
  const provider = configurationProvider("config.test", { region: "eu" });

  container.register(provider);

  assert.equal(container.has("configuration"), true);
  assert.equal(container.resolve("configuration").require("region"), "eu");
  assert.deepEqual(container.list(), [{ kind: "configuration", id: "config.test" }]);
});

test("rejects duplicate registration", () => {
  const container = new DependencyContainer().register(
    configurationProvider("config.first", {})
  );

  assert.throws(
    () => container.register(configurationProvider("config.second", {})),
    ProviderRegistrationError
  );
});

test("supports explicit provider replacement", () => {
  const container = new DependencyContainer()
    .register(configurationProvider("config.first", { mode: "first" }))
    .replace(configurationProvider("config.second", { mode: "second" }));

  assert.equal(container.resolve("configuration").id, "config.second");
  assert.equal(container.resolve("configuration").require("mode"), "second");
});

test("throws a typed error for a missing required provider", () => {
  const container = new DependencyContainer();

  assert.equal(container.optional("memory"), undefined);
  assert.throws(() => container.resolve("memory"), ProviderNotFoundError);
});

test("fork isolates replacements from its parent", () => {
  const parent = new DependencyContainer().register(
    configurationProvider("config.parent", { mode: "parent" })
  );
  const child = parent.fork().replace(
    configurationProvider("config.child", { mode: "child" })
  );

  assert.equal(parent.resolve("configuration").require("mode"), "parent");
  assert.equal(child.resolve("configuration").require("mode"), "child");
});

test("injects providers into an action execution context", async () => {
  const action = `test.provider.${Date.now()}`;
  registerAction({
    action,
    requiredCapabilities: ["orchestration"],
    async execute(_payload, context) {
      return {
        region: context.providers.resolve("configuration").require("region")
      };
    }
  });

  const container = new DependencyContainer().register(
    configurationProvider("config.integration", { region: "europe" })
  );
  const result = await orchestrate({
    productId: "proidu",
    action,
    payload: {}
  }, container);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data, { region: "europe" });
});
