import assert from "node:assert/strict";
import test from "node:test";

import {
  KBR_SOURCE_CONFIGS,
  createKbrRegionalAdapters,
} from "../src/kbr-source-adapters.js";
import type { HttpClient, HttpResponse } from "../src/source-adapters.js";

class FakeResponse implements HttpResponse {
  constructor(
    readonly status: number,
    readonly headers: Record<string, string>,
    private readonly body: string,
  ) {}

  async text(): Promise<string> { return this.body; }
  async json<T>(): Promise<T> { return JSON.parse(this.body) as T; }
}

class FakeHttp implements HttpClient {
  constructor(private readonly routes: Record<string, FakeResponse>) {}

  async get(url: string): Promise<HttpResponse> {
    const parsed = new URL(url);
    return this.routes[url]
      ?? this.routes[`${parsed.origin}${parsed.pathname}`]
      ?? new FakeResponse(404, { "content-type": "text/plain" }, "not found");
  }
}

test("KBR source catalog contains only regional HTTPS allowlisted sources", () => {
  assert.equal(KBR_SOURCE_CONFIGS.length, 4);
  for (const source of KBR_SOURCE_CONFIGS) {
    assert.equal(source.level, "regional");
    assert.equal(source.region, "Кабардино-Балкарская Республика");
    assert.equal(new URL(source.baseUrl).protocol, "https:");
    assert.ok(source.allowedHosts.includes(new URL(source.baseUrl).hostname));
  }
});

test("KBR economy adapter discovers official document cards and attachments", async () => {
  const http = new FakeHttp({
    "https://economykbr.ru/sitemap.xml": new FakeResponse(
      200,
      { "content-type": "application/xml" },
      "<urlset><url><loc>https://economykbr.ru/documents/order-44</loc></url></urlset>",
    ),
    "https://economykbr.ru/": new FakeResponse(200, { "content-type": "text/html" }, "<html><title>Минэкономразвития КБР</title></html>"),
    "https://economykbr.ru/documents/": new FakeResponse(200, { "content-type": "text/html" }, '<a href="/documents/order-44">Приказ</a>'),
    "https://economykbr.ru/gosudarstvennye-programmy/": new FakeResponse(200, { "content-type": "text/html" }, "<html><title>Госпрограммы</title></html>"),
    "https://economykbr.ru/documents/order-44": new FakeResponse(
      200,
      { "content-type": "text/html" },
      '<html><head><meta property="og:title" content="Приказ от 12.05.2026 № 44"><meta name="date" content="2026-05-12"></head><body><a href="/documents/order-44.pdf">PDF</a></body></html>',
    ),
  });

  const adapter = createKbrRegionalAdapters(http).find((item) => item.sourceId === "kbr-economy");
  assert.ok(adapter);
  const items = await adapter.discover({ maxPages: 1, pageSize: 20 });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.documentNumber, "44");
  assert.equal(items[0]?.publishedAt, "2026-05-12");
  assert.deepEqual(items[0]?.attachmentUrls, ["https://economykbr.ru/documents/order-44.pdf"]);
  assert.equal(items[0]?.rawMetadata.level, "regional");
});

test("KBR adapter rejects attachment URLs outside the official host", async () => {
  const http = new FakeHttp({
    "https://minturizm.kbr.ru/sitemap.xml": new FakeResponse(
      200,
      { "content-type": "application/xml" },
      "<urlset><url><loc>https://minturizm.kbr.ru/documents/subsidy</loc></url></urlset>",
    ),
    "https://minturizm.kbr.ru/": new FakeResponse(200, { "content-type": "text/html" }, "<html><title>Минтуризм КБР</title></html>"),
    "https://minturizm.kbr.ru/documents/": new FakeResponse(200, { "content-type": "text/html" }, "<html><title>Документы</title></html>"),
    "https://minturizm.kbr.ru/deyatelnost/": new FakeResponse(200, { "content-type": "text/html" }, "<html><title>Деятельность</title></html>"),
    "https://minturizm.kbr.ru/documents/subsidy": new FakeResponse(
      200,
      { "content-type": "text/html" },
      '<html><head><title>Субсидия № 9</title></head><body><a href="https://files.example/subsidy.pdf">Внешний файл</a><a href="/documents/subsidy.pdf">Официальный файл</a></body></html>',
    ),
  });

  const adapter = createKbrRegionalAdapters(http).find((item) => item.sourceId === "kbr-tourism-ministry");
  assert.ok(adapter);
  const items = await adapter.discover({ maxPages: 1, pageSize: 20 });

  assert.equal(items.length, 1);
  assert.deepEqual(items[0]?.attachmentUrls, ["https://minturizm.kbr.ru/documents/subsidy.pdf"]);
});
