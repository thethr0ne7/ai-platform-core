# ADR 0006: Scale thinking, not task count

## Status
Accepted

## Context
Agentic systems can create the appearance of progress by multiplying tasks, agents, branches and reports. This increases coordination cost and context fragmentation without increasing evidence coverage, system depth or delivery value.

Government Support Intelligence needs the opposite behavior. The factory must expand the quality of the system model, locate leverage points, widen official-source coverage, isolate risks and produce independently verifiable artifacts.

## Decision
Adopt **Scale Thinking Gate** as an ACTIVE factory control.

The planning path is:

`GOAL → SYSTEM MODEL → LEVERAGE POINTS → MINIMUM SUFFICIENT TASK GRAPH → EXECUTION`

A task is justified only when it adds at least one of the following:

1. an independently verifiable artifact;
2. a distinct official evidence source;
3. a separate risk or authorization boundary;
4. a critical-path or latency benefit;
5. a materially different evaluation responsibility.

Near-duplicate objectives and artifacts must be merged. Tasks without an artifact must stop. Parallel groups must remain bounded unless the plan supplies explicit independent value.

## Factory placement

The gate runs after goal clarification and system modelling, before orchestration and task dispatch:

`INPUT → CLARIFY → SYSTEM MODEL → SCALE THINKING GATE → PLAN → EXECUTE`

## Default rules

- Prefer one complete vertical slice over several shallow stubs.
- Do not assign an arbitrary target number of agents or tasks.
- Do not split research by wording when the sources and artifact are identical.
- Separate evidence extraction from interpretation because they have different validation risks.
- Parallelize independent sources or isolated risk domains, not duplicate reasoning.
- Stop decomposition when every remaining task produces the same artifact.

## Rejected alternatives

- Scaling by agent count.
- Creating one task per minor field or sentence.
- Using parallel branches to simulate speed when work shares the same evidence and output.
- Importing another orchestration framework solely to increase visible complexity.

## Consequences

Plans become smaller but deeper. Every task must justify its existence. The factory can reject task inflation before it consumes context, compute and review capacity.
