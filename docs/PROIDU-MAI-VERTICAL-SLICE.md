# PROIDU × MAI ingestion vertical slice v0.11

This slice proves that the platform core can move one official university source through a real product path:

`requirement → source → job → parse → validate → version → index → query`

## Official source

- `https://priem.mai.ru/base/programs/`
- Institution: Московский авиационный институт
- Admission year: 2026

The deterministic test fixture is a semantic HTML excerpt captured from the official page on 2026-07-19. It contains two valid records and one intentionally incomplete record used to prove quarantine behavior.

## Runtime pieces

- `PROIDU_MAI_REQUIREMENT` and `PROIDU_MAI_SOURCE`
- bounded HTTP fetcher with timeout, response-size limit, manual redirect rejection, content-type check, bounded retry and exponential backoff
- deterministic MAI HTML parser
- runtime record validation
- quarantine for incomplete rows
- SHA-256 content hashes
- verified URL evidence
- version writes through `InMemoryEvidenceProvider`
- publication through `InMemoryLexicalRetrievalProvider`
- idempotency through `InMemoryIngestionLedger`
- execution through the existing DAG workflow engine

## Run

```bash
npm run verify
npm run build
```

The end-to-end proof is in `test/proidu-mai.test.ts`.

## Proved invariants

1. The official MAI requirement accepts only the official `priem.mai.ru` domain.
2. At least one 2026 record is parsed and validated.
3. Incomplete data is quarantined rather than indexed.
4. Every published record carries verified evidence and a source URL.
5. Records are versioned with a content hash.
6. A PROIDU query retrieves the indexed MAI record.
7. A repeated execution in the same scheduling window does not republish duplicates.
8. Fail-fast behavior is tested with concurrency greater than one.
9. Retrieval add/remove/re-add behavior is covered by regression testing.

## Known limitations

- The fixture is a captured semantic excerpt, not a byte-for-byte archive of the entire live page.
- The live fetcher exists, but CI does not call the public internet; tests use deterministic fixtures and mocked responses.
- The parser currently supports the MAI program table format only.
- Persistence is process-local. A restart loses the ledger, versions and retrieval index.
- The lexical scorer remains the v0.8 term-frequency reference implementation.
- No PDF parsing, browser automation, LLM extraction, Supabase, queue worker or scheduled daemon is included.

## Next reality gate

Run the same parser against a freshly fetched official page outside CI, compare parsed counts and quarantine reasons, then replace the in-memory ledger and version store with persistent adapters only after the source behavior is known.
