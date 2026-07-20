import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseSourcePersistence } from "../src/supabase-source-persistence.js";
import type { EvidenceRecord } from "../src/source-intelligence.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("reads latest extracted text through RPC", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const persistence = new SupabaseSourcePersistence({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-role",
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ extracted_text: "Последняя версия документа" });
    },
  });

  const text = await persistence.getLatestText("https://official.example/document/1");
  assert.equal(text, "Последняя версия документа");
  assert.equal(calls[0]?.url, "https://project.supabase.co/rest/v1/rpc/gi_get_latest_source_text");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.match(String(calls[0]?.init?.body), /official\.example/);
});

test("persists evidence as one atomic RPC payload", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const persistence = new SupabaseSourcePersistence({
    supabaseUrl: "https://project.supabase.co/",
    serviceRoleKey: "service-role",
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ document_id: "doc-1", version_id: "version-1" });
    },
  });

  const record: EvidenceRecord = {
    sourceId: "kbr-economy",
    canonicalUrl: "https://economykbr.ru/documents/order-44",
    authority: "Министерство экономического развития КБР",
    title: "Приказ № 44",
    documentNumber: "44",
    publishedAt: "2026-05-12",
    checkedAt: "2026-07-20T17:00:00.000Z",
    contentHash: "abc123",
    extractionMethod: "html",
    text: "Текст официального документа",
    citations: [{ locator: "пункт 1", quote: "Официальная цитата" }],
    metadata: { level: "regional" },
  };

  await persistence.saveEvidence(record);
  const payload = requestBody?.p_record as Record<string, unknown>;
  assert.equal(payload.source_id, "kbr-economy");
  assert.equal(payload.document_number, "44");
  assert.equal(payload.extracted_text, "Текст официального документа");
  assert.deepEqual(payload.citations, record.citations);
});

test("records discovery failures and exposes RPC error details", async () => {
  const persistence = new SupabaseSourcePersistence({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-role",
    fetchImpl: async () => jsonResponse({ message: "source not found" }, 400),
  });

  await assert.rejects(
    () => persistence.saveDiscoveryFailure({
      sourceId: "kbr-tourism-ministry",
      message: "HTTP 500",
      checkedAt: "2026-07-20T17:00:00.000Z",
    }),
    /source not found/,
  );
});

test("rejects insecure Supabase URL", () => {
  assert.throws(
    () => new SupabaseSourcePersistence({
      supabaseUrl: "http://project.supabase.co",
      serviceRoleKey: "service-role",
    }),
    /HTTPS/,
  );
});
