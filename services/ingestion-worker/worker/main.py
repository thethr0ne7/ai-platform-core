from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import feedparser
from curl_cffi.requests import AsyncSession
from openpyxl import Workbook
from playwright.async_api import async_playwright
from pydantic_settings import BaseSettings, SettingsConfigDict
from redis.asyncio import Redis


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    redis_url: str | None = None
    http_timeout_seconds: float = 30.0
    http_concurrency: int = 8
    user_agent: str = (
        "AIPlatformCore/0.53 (+https://github.com/thethr0ne7/ai-platform-core)"
    )
    cache_ttl_seconds: int = 900


@dataclass(frozen=True, slots=True)
class FetchResult:
    url: str
    status_code: int
    content_type: str
    body: str
    adapter: str
    cached: bool = False

    @property
    def checksum(self) -> str:
        return hashlib.sha256(self.body.encode("utf-8")).hexdigest()


class IngestionWorker:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._semaphore = asyncio.Semaphore(settings.http_concurrency)
        self._redis: Redis | None = (
            Redis.from_url(settings.redis_url, decode_responses=True)
            if settings.redis_url
            else None
        )

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()

    async def fetch(self, url: str, *, render_javascript: bool = False) -> FetchResult:
        cache_key = f"ingestion:v1:{hashlib.sha256(url.encode()).hexdigest()}"
        cached = await self._cache_get(cache_key)
        if cached is not None:
            payload = json.loads(cached)
            return FetchResult(**payload, cached=True)

        async with self._semaphore:
            result = (
                await self._fetch_browser(url)
                if render_javascript
                else await self._fetch_http(url)
            )

        await self._cache_set(cache_key, json.dumps(asdict(result), ensure_ascii=False))
        return result

    async def fetch_rss(self, url: str) -> list[dict[str, Any]]:
        result = await self.fetch(url)
        parsed = await asyncio.to_thread(feedparser.parse, result.body)
        return [
            {
                "title": entry.get("title"),
                "link": entry.get("link"),
                "published": entry.get("published"),
                "summary": entry.get("summary"),
            }
            for entry in parsed.entries
        ]

    async def export_xlsx(
        self,
        rows: list[dict[str, Any]],
        destination: Path,
    ) -> Path:
        await asyncio.to_thread(self._write_workbook, rows, destination)
        return destination

    async def _fetch_http(self, url: str) -> FetchResult:
        async with AsyncSession(headers={"User-Agent": self.settings.user_agent}) as session:
            response = await session.get(
                url,
                timeout=self.settings.http_timeout_seconds,
                allow_redirects=True,
            )
            response.raise_for_status()
            return FetchResult(
                url=str(response.url),
                status_code=response.status_code,
                content_type=response.headers.get("content-type", ""),
                body=response.text,
                adapter="curl_cffi",
            )

    async def _fetch_browser(self, url: str) -> FetchResult:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            try:
                page = await browser.new_page(user_agent=self.settings.user_agent)
                response = await page.goto(
                    url,
                    wait_until="networkidle",
                    timeout=int(self.settings.http_timeout_seconds * 1000),
                )
                body = await page.content()
                return FetchResult(
                    url=page.url,
                    status_code=response.status if response else 200,
                    content_type="text/html; charset=utf-8",
                    body=body,
                    adapter="playwright",
                )
            finally:
                await browser.close()

    async def _cache_get(self, key: str) -> str | None:
        if self._redis is None:
            return None
        return await self._redis.get(key)

    async def _cache_set(self, key: str, value: str) -> None:
        if self._redis is None:
            return
        await self._redis.set(key, value, ex=self.settings.cache_ttl_seconds)

    @staticmethod
    def _write_workbook(rows: list[dict[str, Any]], destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "ingestion"

        if not rows:
            sheet.append(["status"])
            sheet.append(["no data"])
            workbook.save(destination)
            return

        columns = list(rows[0].keys())
        sheet.append(columns)
        for row in rows:
            sheet.append([IngestionWorker._cell_value(row.get(column)) for column in columns])

        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = sheet.dimensions
        workbook.save(destination)

    @staticmethod
    def _cell_value(value: Any) -> Any:
        if isinstance(value, (dict, list, tuple)):
            return json.dumps(value, ensure_ascii=False)
        return value


async def run(args: argparse.Namespace) -> int:
    worker = IngestionWorker(Settings())
    try:
        if args.rss:
            entries = await worker.fetch_rss(args.url)
            if args.xlsx:
                await worker.export_xlsx(entries, Path(args.xlsx))
            print(json.dumps(entries, ensure_ascii=False, indent=2))
            return 0

        result = await worker.fetch(args.url, render_javascript=args.browser)
        payload = {
            "url": result.url,
            "status_code": result.status_code,
            "content_type": result.content_type,
            "adapter": result.adapter,
            "cached": result.cached,
            "checksum": result.checksum,
            "bytes": len(result.body.encode("utf-8")),
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0
    finally:
        await worker.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AI Platform Core ingestion worker")
    parser.add_argument("--url", required=True, help="Public source URL to fetch")
    parser.add_argument(
        "--browser",
        action="store_true",
        help="Render the source with Playwright instead of the HTTP adapter",
    )
    parser.add_argument("--rss", action="store_true", help="Parse the source as RSS/Atom")
    parser.add_argument("--xlsx", help="Optional path for an Excel export")
    return parser


def main() -> None:
    raise SystemExit(asyncio.run(run(build_parser().parse_args())))


if __name__ == "__main__":
    main()
