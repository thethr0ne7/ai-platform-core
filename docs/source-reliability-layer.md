# Source Reliability Layer v0.43

## Goal
Increase ingestion reliability for official sources with 403, 429, 503, DNS and TLS failures.

## Components

- Source health tracking
- Error classification
- Retry policy
- Adapter routing
- Recovery workflow

## Failure routing

403 -> alternate official endpoint / adapter strategy

429 -> exponential backoff

503 -> retry queue

DNS/TLS -> health check and delayed retry

Timeout -> retry with extended deadline

## Adapter order

1. API adapter
2. Sitemap adapter
3. HTML adapter
4. PDF adapter
5. Archive/fallback adapter

## Quality rule

Only verified official documents enter evidence storage.
