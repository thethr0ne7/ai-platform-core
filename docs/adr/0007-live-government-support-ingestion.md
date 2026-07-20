# ADR 0007: First live Government Support Intelligence ingestion

## Status

Accepted for v0.17.

## Decision

Build one evidence-locked vertical slice around one official source:

- authority: Ministry of Agriculture of the Russian Federation;
- document: Order dated 17 February 2026 No. 88;
- official publication identifier: `0001202603250013`;
- canonical host: `publication.pravo.gov.ru`.

The runtime path is:

`registry → bounded fetch → immutable snapshot → OpenAI strict structured proposal → field-level evidence validation → grounded commit → recommendation → publish gate`

## Factory controls

### Scale Thinking Gate

One source and one complete result. No source fleet, generic crawler, UI, graph database or multi-agent workflow in this milestone.

### Agent Harness Contract

The model proposes fields. Runtime validates quotes and decides what may be committed. An unsupported optional field is removed from the committed measure. An unsupported required field stops the run.

### Evidence-Locked Extraction

Every committed field must be linked to an exact quote in the normalized snapshot. Evidence records include field path, value, quote, offsets, quote hash and snapshot hash.

### OpenAI boundary

- API key is server-only.
- Responses API request uses strict JSON Schema.
- `store` is false.
- CI uses an injected mock transport.
- errors redact the configured key.
- model output never bypasses deterministic validation.

### Source safety

- HTTPS only;
- exact host allowlist;
- no credentials in URL;
- no IP literals;
- standard TLS port only;
- final redirect target revalidated;
- response size and MIME type bounded.

## Consequences

This milestone creates a production-shaped contract but does not yet provide a general crawler or a PDF parser. The fetcher and PDF text extraction remain injected runtime responsibilities. Persistence will use the existing platform namespace after the contract and tests pass.

## Kill criteria

Stop or redesign the milestone if:

- official documents cannot be captured reproducibly;
- evidence offsets cannot survive normalization with hashes and locators;
- ungrounded fields reach the committed measure;
- API credentials appear in logs or errors;
- adding a second source is required to prove the first slice.
