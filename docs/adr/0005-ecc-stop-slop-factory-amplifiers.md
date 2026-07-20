# ADR 0005: ECC and Stop Slop as bounded factory amplifiers

- Status: Accepted
- Date: 2026-07-20
- Product: Government Support Intelligence

## Context

The factory needs stronger execution discipline and stronger final prose quality. Two public repositories provide useful patterns:

- `affaan-m/ECC`: harness-native workflows, research-first development, memory persistence, verification loops and bounded orchestration.
- `hardikpandya/stop-slop`: detection of formulaic AI prose with five scoring dimensions and a 35/50 revision threshold.

Neither repository defines the product architecture. Government Support Intelligence remains the product, and AI Factory 2.1 remains the operating architecture.

## Decision

### ECC

ECC is recorded as an **ACTIVE / AMPLIFIER** named `Agent Harness Best Practices`.

Adopted patterns:

1. Research must precede proposal and execution.
2. The model proposes actions; the runtime validates, authorizes and executes them.
3. Execution follows explicit checkpoints: `RESEARCH → PROPOSE → VALIDATE → APPROVE/COMMIT → EXECUTE → OBSERVE → SAVE → SHIP`.
4. Production work requires verified evidence, bounded retries, kill criteria and persisted observations.
5. Failed work becomes a repair input, not an excuse for unbounded autonomous retries.

Rejected imports:

- the full ECC agent catalog;
- its marketplace, installer and hook system;
- generic multi-agent orchestration;
- its control plane as a platform dependency;
- automatic skill proliferation without product need.

### Stop Slop

Stop Slop is recorded as an **ACTIVE / AMPLIFIER** named `Writing Quality Gate`.

Placement:

`DRAFT → EVIDENCE VALIDATION → DOMAIN VALIDATION → WRITING QUALITY GATE → PUBLISH`

Adopted checks:

- filler and throat-clearing;
- formulaic binary contrasts;
- vague declaratives;
- passive markers;
- repetitive rhythm;
- excessive paragraph density;
- five dimensions: directness, rhythm, trust, authenticity and density;
- default ship threshold: 35/50.

Safety boundary:

The writing gate must never rewrite or penalize protected spans containing verified quotations, legal names or official source titles. Evidence fidelity outranks stylistic preferences.

## Runtime contracts

- `src/factory-work-contract.ts` enforces ordered checkpoints, verified research evidence, explicit approval and bounded retries.
- `src/writing-quality-gate.ts` returns deterministic diagnostics and combines prose quality with evidence/domain approval.

## Consequences

The factory gains testable controls rather than more prompt instructions. Outputs cannot ship because they merely sound polished, and agents cannot execute because they merely produced a plausible plan.
