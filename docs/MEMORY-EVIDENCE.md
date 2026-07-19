# Factory Memory and Evidence v0.7

## Purpose

This phase adds traceable, versioned memory without selecting a database, vector store, embedding model, or LLM vendor.

## Evidence statuses

- `verified` — directly supported by the referenced source.
- `unverified` — captured but not independently confirmed.
- `inferred` — derived from other evidence and must be presented as inference.
- `rejected` — retained for audit but not accepted as support.

## Evidence policies

- `allow-unverified` — evidence is optional.
- `require-evidence` — at least one evidence record is mandatory.
- `verified-only` — evidence is mandatory and every record must be verified.

## Memory identity

Records are addressed by `namespace + id`. Namespaces are product or workflow boundaries. The same ID may exist in two namespaces without collision.

## Versioning

Each `put()` appends a new immutable version. Previous versions remain available through `history()`. Reads and writes use defensive copies so callers cannot mutate stored state.

## Events

Writes may publish:

`memory.write.requested → memory.version.created → evidence.attached? → memory.write.completed`

Rejected writes publish `memory.write.rejected`. Supplied request and trace identifiers are preserved.

## Compatibility

`InMemoryEvidenceProvider` implements the original `MemoryProvider` interface through `get`, `set`, and `delete`, while exposing richer `put`, `read`, `history`, `list`, and `findBySubject` operations.

## Deliberate exclusions

No persistent storage, Supabase, PostgreSQL, vector database, embeddings, retrieval engine, RAG workflow, scraper, LLM provider, or cross-product memory sharing is included.