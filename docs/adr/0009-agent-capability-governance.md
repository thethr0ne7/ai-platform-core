# ADR 0009: Bounded agent capability governance

- Status: Accepted
- Date: 2026-08-15
- Scope: AI Factory

## Context

The factory has accumulated useful external skill systems and specialist patterns across engineering, design, context management, research, marketing, motion, knowledge management and data automation.

Blindly installing every repository would increase prompt noise, security risk, instruction conflicts and operational fragility. The factory needs stronger agents without turning into an uncontrolled multi-agent or plugin ecosystem.

## Decision

Adopt a **selective capability registry** and a global repository-level agent contract.

The source files are:

- `AGENTS.md` — mandatory operating behavior for coding/automation agents working in this repository;
- `runtime/agent-capability-registry.json` — machine-readable capability inventory, source provenance, activation rules and safety status.

## Operating model

The factory routes a small set of relevant capabilities per task.

`INPUT → QUALIFY → CONTEXT GOVERNOR → CAPABILITY ROUTER → PRODUCE → GATES → REPAIR → SHIP → TRACEBACK`

Executive roles (CEO/CFO/COO/CIO/CMO/CRO) are policy lenses, not persistent agents.

## Accepted capability families

### Core

- context governance;
- Superpowers-style engineering discipline and systematic debugging;
- skill creation/evaluation/normalization;
- evidence-first research and contradiction scan;
- frontend design and Design DNA extraction;
- brand/theme consistency;
- web artifact generation;
- motion direction and web animation;
- visual fidelity checks;
- selective marketing/CRO/SEO/GEO routing;
- third-party skill security review.

### Selective / specialist

- Remotion video generation;
- Canvas Design;
- algorithmic art;
- Three.js/WebGL;
- Obsidian-compatible knowledge workflows;
- spreadsheet automation;
- source-grounded notebook/RAG patterns;
- code-navigation patterns from larger orchestration projects.

## External skill rule

Third-party repositories are **pattern sources by default**. They become runtime dependencies only after explicit audit.

Required review dimensions:

1. provenance and license;
2. command execution and install hooks;
3. filesystem scope/path traversal;
4. secrets handling;
5. network listeners/authentication;
6. browser automation permissions;
7. remote downloads/data exfiltration;
8. overlap with existing capabilities;
9. eval evidence that the import improves outcomes.

Unknown risk means `pattern-only`.

## Design Factory

The preferred visual workflow is:

`REFERENCE → DESIGN DNA → FRONTEND DESIGN → BRAND/THEME → IMPLEMENT → MOTION → VISUAL FIDELITY → MOBILE QA → ACCESSIBILITY/PERFORMANCE → REPAIR → SHIP`

Motion design decides intent/timing/choreography; implementation technologies such as GSAP, Lottie, Rive or Three.js are selected afterward.

## Engineering Factory

The preferred engineering workflow is:

`RESEARCH → PLAN → IMPLEMENT → TEST → DEBUG ROOT CAUSE → REGRESSION CHECK → CI/BUILD/TYPES → SHIP`

No broad refactor is justified solely by agent preference.

## Research and Truth

High-cost factual work uses:

`CLAIM → PRIMARY/OFFICIAL SOURCE → SAVED EVIDENCE → CONTRADICTION SCAN → RISK MAP → VERDICT`

Claims remain explicitly `CONFIRMED`, `OBSERVED`, `ASSUMPTION`, `UNKNOWN` or `BLOCKER` until evidence changes their status.

## Rejected defaults

The following are not accepted as core architecture:

- multi-agent voting as a standard execution model;
- role-play councils;
- recursive autonomous delegation;
- blind skill/CLI/plugin installers;
- unrestricted filesystem MCP servers;
- duplicate skills that consume context without adding measurable capability;
- temporary-email, disposable-file or paywall-bypass services as production evidence infrastructure.

## Consequences

The factory gains broader specialist competence while keeping a single bounded control model. New skills must earn admission through audit and evaluation instead of popularity. Agent context remains smaller, execution becomes more predictable, and design/research/engineering outputs gain explicit quality gates.