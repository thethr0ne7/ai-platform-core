import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIGovernmentSupportExtractor } from "../src/openai-government-support-extractor.js";
import type { OfficialDocumentSnapshot } from "../src/government-support-intelligence.js";

const snapshot: OfficialDocumentSnapshot = {
  id: "ru:minselkhoz:test",
  authority: "Минсельхоз России",
  title: "Тестовый официальный документ",
  documentType: "order",
  jurisdiction: "federal",
  publishedAt: "2026-03-25T00:00:00.000Z",
  sourceUrl: "https://publication.pravo.gov.ru/document/test",
  capturedAt: "2026-07-20T09:00:00.000Z",
  text: "Грант предоставляется КФХ. Допустимы затраты на оборудование и благоустройство территории."
};

test("adapter sends strict schema with storage disabled and parses structured output", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const extractor = new OpenAIGovernmentSupportExtractor({
    apiKey: "secret-test-key",
    model: "gpt-5-mini",
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        model: "gpt-5-mini-2026-06-01",
        output_text: JSON.stringify({
          measure: {
            id: "measure:test",
            title: "Грант для КФХ",
            instrument: "grant",
            sectors: ["сельское хозяйство"],
            applicantTypes: ["КФХ"],
            objectives: [],
            eligibleCosts: ["оборудование"],
            maxAmount: null,
            cofinancingPercent: null,
            validFrom: null,
            validTo: null,
            conditions: [],
            exclusions: []
          },
          evidence: []
        })
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const result = await extractor.extract(snapshot);
  assert.equal(requestBody?.store, false);
  const text = requestBody?.text as { format?: { type?: string; strict?: boolean } };
  assert.equal(text.format?.type, "json_schema");
  assert.equal(text.format?.strict, true);
  assert.equal(result.model, "gpt-5-mini-2026-06-01");
  assert.equal(result.proposal.measure.maxAmount, undefined);
  assert.match(result.promptHash, /^[a-f0-9]{64}$/u);
});

test("adapter redacts the API key from thrown errors", async () => {
  const key = "secret-never-log-me";
  const extractor = new OpenAIGovernmentSupportExtractor({
    apiKey: key,
    model: "gpt-5-mini",
    fetchImpl: async () => new Response(JSON.stringify({
      error: { message: `invalid credential ${key}` }
    }), { status: 401, headers: { "content-type": "application/json" } })
  });

  await assert.rejects(
    () => extractor.extract(snapshot),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.equal((error as Error).message.includes(key), false);
      assert.match((error as Error).message, /\[REDACTED\]/u);
      return true;
    }
  );
});
