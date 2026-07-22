# AI Platform Ingestion Worker

Production-oriented Python worker for ingestion tasks that do not belong in the Vercel web runtime.

## Stack

- `asyncio` for orchestration and concurrency
- `curl_cffi` for HTTP ingestion
- `feedparser` for RSS/Atom feeds
- `playwright` for JavaScript-rendered pages and UI smoke checks
- `redis` for cache, locks, and temporary queue state
- `openpyxl` for Excel exports

The worker does **not** implement CAPTCHA bypassing, fingerprint spoofing, or access-control evasion. Playwright is used as a standards-compliant browser adapter for sources that require JavaScript rendering.

## Run

```bash
cd services/ingestion-worker
python -m venv .venv
. .venv/bin/activate
pip install -e .
playwright install chromium
ai-platform-ingestion --url https://example.org
```

Optional environment variables:

```text
REDIS_URL=redis://localhost:6379/0
HTTP_TIMEOUT_SECONDS=30
HTTP_CONCURRENCY=8
USER_AGENT=AIPlatformCore/0.53 (+https://github.com/thethr0ne7/ai-platform-core)
```

## Runtime boundary

Vercel hosts `apps/web`. This worker is deployed independently as a container, scheduled job, or long-running worker. It exchanges durable state through Supabase and uses Redis only for transient state.
