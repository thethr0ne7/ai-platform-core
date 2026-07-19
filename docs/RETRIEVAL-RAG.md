# Retrieval and Grounded Context v0.8

## Boundary

This phase implements retrieval, not answer generation.

`QUERY → VALIDATE → TOKENIZE → LOOKUP → SCORE → FILTER → LIMIT → GROUNDED CONTEXT`

No LLM, embedding service, vector database, scraper, or external search engine is used.

## Reference implementation

`InMemoryLexicalRetrievalProvider` uses:

- `Map` for document lookup;
- a namespace-separated inverted index;
- token frequency maps for deterministic lexical scoring;
- stable score and ID tie-breaking;
- explicit result limits;
- defensive copies;
- evidence propagation.

## Complexity

For a document with `T` tokens:

- indexing time: `O(T)`;
- index space: `O(T + D)` across tokens and documents.

For a query with `Q` tokens and `C` candidates:

- lookup and accumulation: proportional to matching postings;
- ranking: `O(C log C)`;
- returned results are bounded to at most 100.

This reference is suitable for contracts, tests, and small datasets. It is not presented as a replacement for a production search engine.

## Isolation

Every search requires `filters.namespace`. Documents are indexed under `namespace:id`, and searches access only one namespace. Grounded context assembly rejects mixed namespaces.

## Evidence

Retrieval results carry the original `EvidenceRecord[]`. `assembleGroundedContext()` deduplicates citations by evidence ID but never creates new evidence or claims.

## Events

- `retrieval.search.requested`
- `retrieval.search.completed`
- `retrieval.search.rejected`

Trace context is preserved when supplied.

## Future adapters

BM25, hybrid, vector, database, and external-search implementations may later implement the same provider contract. They must preserve namespace isolation, deterministic limits, source evidence, and stable failure behavior.
