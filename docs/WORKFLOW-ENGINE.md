# Stateful Workflow Engine v0.9

## Purpose

The workflow engine executes validated directed acyclic graphs inside one process. It provides deterministic dependency ordering, bounded concurrency, explicit state, and reproducible execution history.

## Execution model

`DEFINE → VALIDATE GRAPH → TOPOLOGICAL ORDER → READY QUEUE → BOUNDED BATCH → RECORD STATE → NEXT WAVE`

A step becomes ready only after every declared dependency has succeeded.

## Failure policies

### fail-fast

After the first failed batch, the engine schedules no new work. Remaining steps are marked `skipped`.

### continue-independent

Descendants of failed steps are marked `skipped`, while unrelated branches may finish.

## States

- `pending`
- `running`
- `succeeded`
- `failed`
- `skipped`

The public result records timestamps, durations, outputs, errors, deterministic topological order, and final workflow status.

## Algorithms and complexity

Validation and topological sorting use Kahn's algorithm.

For `V` steps and `E` dependency edges:

- graph validation: `O(V + E)` before ready-queue sorting costs;
- topological processing: `O(V + E)` plus deterministic queue sorting;
- state storage: `O(V + E)`;
- execution time: determined by step durations and the concurrency bound.

The current implementation sorts small ready sets to guarantee stable ordering. It does not claim to optimize scheduling for massive graphs.

## Safety boundaries

- concurrency is an integer from 1 to 64;
- cycles fail before any step executes;
- duplicate IDs and missing dependencies fail deterministically;
- no hidden retries;
- no dynamic code loading;
- no distributed workers, Redis, database, cron, or autonomous agents;
- no direct repository writes.

## Future extension points

Later phases may add event publication, persistence adapters, retry policies, cancellation, timeouts, and distributed execution. Each requires its own measured need and quality gate.