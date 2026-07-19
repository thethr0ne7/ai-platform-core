# Provider SDK and Dependency Container

## Purpose

Provider SDK v0.3 gives action handlers access to shared platform capabilities without importing concrete infrastructure vendors.

## Provider kinds

- `memory`
- `retrieval`
- `analytics`
- `configuration`

Each provider has a stable identity:

```ts
{
  kind: "configuration",
  id: "config.local",
  version: "1.0.0"
}
```

## Dependency container

```ts
const providers = new DependencyContainer()
  .register(configurationProvider)
  .register(memoryProvider);
```

Handlers consume providers through `ExecutionContext`:

```ts
async execute(payload, context) {
  const config = context.providers.resolve("configuration");
  return config.require("REGION");
}
```

## Lifecycle rules

1. `register()` rejects duplicate provider kinds.
2. `replace()` is explicit and intended for composition, migration, and tests.
3. `resolve()` throws `ProviderNotFoundError` when a required provider is missing.
4. `optional()` returns `undefined` for optional dependencies.
5. `fork()` copies registrations into an isolated child container.
6. Provider contracts remain vendor-neutral.

## Architectural boundary

This phase does not select Supabase, a vector database, an analytics vendor, an LLM provider, or an authentication system. Concrete adapters belong in later integration layers.

## Execution path

```text
PRODUCT REQUEST
→ ORCHESTRATOR
→ ACTION HANDLER
→ EXECUTION CONTEXT
→ PROVIDER RESOLVER
→ VENDOR-NEUTRAL PROVIDER CONTRACT
```

## Acceptance gate

- Existing Foundation v0.2 tests remain green.
- Container behavior is covered by unit tests.
- A handler can resolve a provider through its execution context.
- TypeScript check, tests, and build pass in CI.
