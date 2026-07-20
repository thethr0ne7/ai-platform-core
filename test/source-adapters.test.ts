import assert from "node:assert/strict";
import test from "node:test";

import {
  GenericOfficialSiteAdapter,
  PravoApiAdapter,
  type HttpClient,
  type HttpResponse,
} from "../src/source-adapters.js";

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
    const direct = this.routes[url];
    if (direct) return direct;
    const withoutQuery = this.routes[new URL(url).origin + new URL(url).pathname];
    return withoutQuery ?? new FakeResponse(404, { "content-type": "text/plain" }, "not found");
  }
}

test("Pravo adapter uses official API and maps publication metadata", async () => {
  const http = new FakeHttp({
    "https://publication.pravo.gov.ru/api/Documents": new FakeResponse(200, { "content-type": "application/json" }, JSON.stringify({
      items: [{
        eoNumber: "0001202603250013",
        publishDateShort: "2026-03-25",
        complexName: "Приказ Министерства сельского хозяйства Российской Федерации от 17.02.2026 № 88",
        number: "88",
        pagesCount: 6,
      }],
      pagesTotalCount: 1,
    })),
  });
  const items = await new PravoApiAdapter(http).discover({ maxPages: 1 });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.documentNumber, "88");
  assert.equal(items[0]?.publishedAt, "2026-03-25");
  assert.equal(items[0]?.rawMetadata.discoveryMethod, "official-api");
  assert.match(items[0]?.attachmentUrls[0] ?? "", /0001202603250013/);
});

test("generic adapter combines sitemap, seed HTML and document cards", async () => {
  const config = {
    sourceId: "test-region",
    authority: "Тестовый официальный орган",
    level: "regional" as const,
    region: "Тестовый регион",
    baseUrl: "https://official.example/",
    allowedHosts: ["official.example"],
    seedPaths: ["/documents/"],
    sitemapPaths: ["/sitemap.xml"],
    rssPaths: [],
    includeUrlPatterns: [/\/documents\//],
  };
  const http = new FakeHttp({
    "https://official.example/sitemap.xml": new FakeResponse(200, { "content-type": "application/xml" }, "<urlset><url><loc>https://official.example/documents/order-7</loc></url></urlset>"),
    "https://official.example/documents/": new FakeResponse(200, { "content-type": "text/html" }, '<a href="/documents/order-7">Приказ</a>'),
    "https://official.example/documents/order-7": new FakeResponse(200, { "content-type": "text/html" }, '<html><head><meta property="og:title" content="Приказ от 01.06.2026 № 7"><meta name="date" content="2026-06-01"></head><body><h1>Приказ № 7</h1><a href="/files/order-7.pdf">PDF</a></body></html>'),
  });
  const items = await new GenericOfficialSiteAdapter(config, http).discover({ maxPages: 1, pageSize: 10 });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.publishedAt, "2026-06-01");
  assert.equal(items[0]?.documentNumber, "7");
  assert.deepEqual(items[0]?.attachmentUrls, ["https://official.example/files/order-7.pdf"]);
});
