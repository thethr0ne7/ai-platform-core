# Engineering Skills Charter

This charter converts foundational computer-science knowledge into operating rules for AI Factory development.

## 1. Data structures and algorithms

- Select structures by dominant operations and measured complexity.
- Prefer `Map` for keyed lookup, `Set` for membership, queues for ordered work, heaps only for real priority scheduling, and graphs only for genuine dependency or relationship problems.
- Every non-trivial algorithm documents expected time and space complexity.
- Use bounded traversal, cycle detection, deterministic tie-breaking, and explicit limits.
- Avoid interview-pattern theatre: two pointers, sliding windows, dynamic programming, trees, and graph algorithms are activated only when the problem actually matches them.

## 2. Architecture and patterns

- Prefer composition over inheritance.
- Use Adapter at external boundaries, Strategy for replaceable algorithms, Facade for a stable public surface, Observer for events, Command for executable actions, and Chain of Responsibility for ordered policy gates.
- A design pattern is accepted only when it reduces coupling or makes testing clearer.
- Avoid Singleton-based hidden global state.

## 3. Performance discipline

- Distinguish latency, throughput, and bandwidth.
- Optimize algorithms and queries before adding distributed infrastructure.
- Apply caching only with an explicit consistency and invalidation policy.
- Measure before introducing connection pools, replicas, sharding, materialized views, real-time transports, or parallel execution.

## 4. API and transport discipline

- Reverse proxy, load balancer, and API gateway are separate concerns.
- REST remains the default request/response interface.
- SSE is preferred for one-way progress streams; WebSockets are reserved for true bidirectional real-time interaction.
- Rate limits, authentication, routing, and aggregation belong at explicit boundaries.

## 5. Data and SQL discipline

- Use indexes for demonstrated access paths.
- Inspect query plans before scaling hardware.
- Use joins deliberately and preserve data ownership boundaries.
- Replication and sharding are production responses to measured load, not default architecture.

## 6. AI discipline

- Separate retrieval from generation.
- Preserve source evidence through every transformation.
- Treat embeddings, vector databases, fine-tuning, agents, and LLM providers as replaceable adapters.
- Context windows are budgets, not storage.
- Hallucination risk is controlled with evidence gates, deterministic retrieval, validation, and explicit `unverified` states.
- Never expose private chain-of-thought as a product dependency; store concise evidence and decision traces instead.

## 7. Factory execution rule

Every phase follows:

`INPUT → PLAN → PRODUCE → CHECK → FIX → SAVE → SHIP`

A phase is complete only when behavior executes, failure paths are tested, complexity is acceptable, CI is green, documentation matches code, and no premature infrastructure was introduced.
