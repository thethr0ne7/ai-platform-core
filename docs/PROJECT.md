# AI Platform Core

## 1. Product definition

AI Platform Core is a shared execution and governance layer for independent AI products. It is not a universal application and does not contain product-specific user interfaces or business datasets.

Initial consumers:

- PROIDU
- Grant AI
- Agro AI
- Tourism AI
- Education AI
- Government Intelligence

## 2. Core promise

A product can submit a versioned, typed request and receive a validated, traceable result without rebuilding orchestration, capability resolution, errors, observability, and provider contracts.

## 3. Target users

- Product developers connecting a new application.
- Platform maintainers adding shared capabilities.
- Operators diagnosing requests and quality failures.

## 4. Foundation scope

### Included

- Product registry.
- Action-handler registry.
- Capability declarations and access checks.
- Request validation.
- Execution context and trace IDs.
- Typed success and error envelopes.
- HTTP adapter.
- Unit tests and CI.
- Extension interfaces for future providers.

### Excluded from foundation

- Product UI.
- Product datasets.
- Autonomous multi-agent execution.
- Concrete RAG, billing, auth, or database vendors.
- Workflow designer.
- Admin dashboard.

## 5. Architecture

```text
Product client
    │
    ▼
HTTP / SDK adapter
    │
    ▼
Request validator
    │
    ▼
Core orchestrator
    ├── Product registry
    ├── Action registry
    ├── Capability policy
    └── Execution context
            │
            ▼
       Action handler
            │
            ▼
Provider interfaces: memory / retrieval / analytics / auth / billing
```

## 6. API foundation

### `GET /health/live`
Process liveness.

### `GET /health/ready`
Registry and configuration readiness.

### `GET /v1/products`
Product definitions.

### `GET /v1/capabilities`
Capability definitions.

### `POST /v1/execute`
Executes one registered product action.

Request envelope:

```json
{
  "requestId": "optional-client-id",
  "productId": "proidu",
  "action": "system.echo",
  "payload": { "message": "hello" }
}
```

Result envelope:

```json
{
  "ok": true,
  "requestId": "...",
  "traceId": "...",
  "productId": "proidu",
  "action": "system.echo",
  "durationMs": 2,
  "capabilitiesUsed": ["orchestration"],
  "data": { "message": "hello" }
}
```

## 7. Delivery roadmap

### Phase 0 — Foundation v0.2

- Real action execution.
- Stable errors.
- Runtime validation.
- HTTP endpoint.
- Tests and CI.

### Phase 1 — Provider boundaries v0.3

- Memory provider interface.
- Retrieval provider interface.
- Analytics events.
- Configuration schema.

### Phase 2 — PROIDU integration v0.4

- Admissions search action contract.
- Source/evidence metadata contract.
- Data Coverage Gate contract.
- Separate adapter in the PROIDU repository.

### Phase 3 — Production hardening v0.5

- Authentication policy.
- Rate limits.
- Structured logs and metrics.
- Vercel deployment adapter where appropriate.
- Release and security workflows.

## 8. Definition of done

A version is done only when code, tests, documentation, CI, and a reproducible integration example agree on the same contract.
