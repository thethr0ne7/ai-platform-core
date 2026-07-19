# Autonomous Data Contracts v0.10

## Purpose

This phase defines the control plane for a self-updating data platform. It does not fetch the web or publish data. It answers four questions deterministically:

1. What data does a product require?
2. Which sources are allowed to supply it?
3. When is each source due for checking?
4. What stable ingestion job should be created?

## Flow

`PRODUCT FUNCTION → DATA REQUIREMENT → TRUSTED SOURCE → DUE CHECK → IDEMPOTENT JOB`

## Product data requirement

A requirement binds an entity type to:

- required fields;
- maximum data age;
- check interval;
- allowed domains;
- minimum source trust;
- evidence and validation rules;
- publication mode.

Requirements are product-scoped. A PROIDU source cannot silently satisfy a Grant AI requirement.

## Source registry

`SourceRegistry` stores defensive copies and validates each source against its requirement. A source must:

- use HTTPS;
- belong to an allowed domain or subdomain;
- meet the minimum trust level;
- match product, requirement, and entity type;
- use bounded retry settings.

Source status controls planning:

- `active` and `degraded` may produce jobs;
- `blocked`, `retired`, and `needs-review` do not.

## Scheduling semantics

Scheduling uses an explicit clock. There is no hidden `Date.now()` dependency in due planning.

A source is due when:

- it has never been checked; or
- its last check is older than its check interval.

The next phase will persist schedules and leases. This phase only calculates deterministic intent.

## Idempotency

Job identity is derived from:

`sourceId + scheduling-window-start`

The same source in the same scheduling window yields the same job ID and idempotency key. Repeated schedulers therefore cannot create logically duplicated work when the future job store enforces uniqueness.

## PROIDU example

A requirement may describe `admission-program` entities with required fields such as university ID, program ID, year, and source URL. Its source policy can require official university domains only. The platform then plans checks from registered official sources without embedding university datasets in the core repository.

## Complexity

For `S` registered sources:

- source lookup: `O(1)` average through `Map`;
- listing and due planning: `O(S)` plus deterministic sorting;
- job creation: `O(1)` excluding fixed-size SHA-256 hashing.

This is sufficient for a reference control plane. Persistent indexing and database query plans belong to the Supabase adapter phase.

## Safety boundary

Not included:

- autonomous domain discovery;
- network requests;
- scraping;
- browser automation;
- scheduler daemon;
- job leases;
- retries;
- database writes;
- production publication;
- LLM decisions.

No data reaches a product search index merely because a source is due. Fetch, extraction, evidence capture, validation, quarantine, and publication remain separate gated phases.
