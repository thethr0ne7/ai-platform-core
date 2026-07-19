# Platform Events and Observability v0.4

## Purpose

The event layer records the lifecycle of platform execution without coupling the core to a logging vendor, analytics product, external broker, or persistent event store.

## Lifecycle

A successful action emits:

`request.received → request.validated → product.resolved → action.resolved → capability.checked → action.started → action.completed`

A rejected or failed execution terminates with `action.failed`.

Every event carries:

- `eventId`
- `timestamp`
- `requestId`
- `traceId`
- optional `productId`
- optional `action`
- typed lifecycle payload

## Dispatch modes

### best-effort

Default production-safe mode. Subscriber failures are isolated and do not fail the business action. All subscribers are still attempted.

### strict

Testing and critical-control mode. Subscriber failures are collected and surfaced as `EventDispatchError` after all subscribers have been attempted.

## In-process boundary

`InMemoryEventBus` is intentionally process-local. It proves event contracts, ordering, propagation, and failure isolation before any persistence or external transport is selected.

## Extension contract

Future adapters may forward platform events to logging, analytics, memory, or tracing systems. Adapters must depend on the `EventBus` and `PlatformEvent` contracts rather than changing orchestrator business logic.

## Explicit exclusions

This phase does not include:

- Kafka, Redis, NATS, RabbitMQ, or other brokers;
- OpenTelemetry vendor SDKs;
- persistent event storage;
- dashboards;
- product-specific domain events;
- event replay or workflow orchestration.

## Acceptance evidence

Tests prove:

- ordered successful lifecycle;
- terminal failure lifecycle;
- stable request and trace propagation;
- best-effort subscriber isolation;
- strict deterministic dispatch failure;
- unsubscribe behavior;
- preservation of existing provider and execution behavior.
