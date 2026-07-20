import assert from "node:assert/strict";
import test from "node:test";
import {
  AGRITOURISM_COSTS_2026_SOURCE,
  captureOfficialSnapshot,
  runLiveGovernmentSupportPipeline,
  validateFieldEvidence,
  validateOfficialSourceTarget,
  type BoundedOfficialFetcher,
  type OpenAIStructuredExtractionAdapter
} from "../src/government-support-live-pipeline.js";
import type { ProjectProfile } from "../src/government-support-intelligence.js";

const titleQuote = "Утвердить перечень затрат, финансовое обеспечение которых допускается осуществлять за счет гранта Агротуризм.";
const applicantsQuote = "Получателями гранта являются сельскохозяйственные товаропроизводители, соответствующие установленным требованиям.";
const costsQuote = "Допускаются затраты на создание и модернизацию объектов сельского туризма, приобретение оборудования и благоустройство территории.";
const instrumentQuote = "Финансовое обеспечение осуществляется за счет гранта Агротуризм.";
const text = [
  "МИНИСТЕРСТВО СЕЛЬСКОГО ХОЗЯЙСТВА РОССИЙСКОЙ ФЕДЕРАЦИИ.",
  titleQuote,
  applicantsQuote,
  costsQuote,
  instrumentQuote,
  "Конкретные условия участия и сроки подачи заявок определяются действующими правилами предоставления гранта."
].join(" ");

const fetcher: BoundedOfficialFetcher = {
  async fetch() {
    return {
      requestedUrl: AGRITOURISM_COSTS_2026_SOURCE.canonicalUrl,
      finalUrl: AGRITOURISM_COSTS_2026_SOURCE.canonicalUrl,
      status: 200,
      contentType: "application/pdf",
      rawBytes: new TextEncoder().encode(text),
      normalizedText: text,
      capturedAt: "2026-07-20T09:00:00.000Z"
    };
  }
};

function at(quote: string): { charStart: number; charEnd: number } {
  const charStart = text.indexOf(quote);
  return { charStart, charEnd: charStart + quote.length };
}

const extractor: OpenAIStructuredExtractionAdapter = {
  async extract() {
    return {
      model: "gpt-5-mini",
      schemaVersion: "government-support-measure/1.0.0",
      promptHash: "sha256:test-prompt",
      rawResponse: { id: "mock-response", output: "structured" },
      proposal: {
        measure: {
          id: "ru:minselkhoz:grant-agrotourism:costs-2026",
          title: "Грант Агротуризм: допустимые затраты",
          instrument: "grant",
          sectors: ["сельское хозяйство", "агротуризм"],
          applicantTypes: ["КФХ", "ИП", "ООО"],
          objectives: ["развитие сельского туризма"],
          eligibleCosts: ["оборудование", "объекты сельского туризма", "благоустройство территории"],
          conditions: ["соответствие действующим правилам предоставления гранта"],
          exclusions: []
        },
        evidence: [
          { fieldPath: "measure.title", fieldValue: "Грант Агротуризм: допустимые затраты", quote: titleQuote, ...at(titleQuote), confidence: 0.99 },
          { fieldPath: "measure.instrument", fieldValue: "grant", quote: instrumentQuote, ...at(instrumentQuote), confidence: 0.99 },
          { fieldPath: "measure.applicantTypes", fieldValue: ["КФХ", "ИП", "ООО"], quote: applicantsQuote, ...at(applicantsQuote), confidence: 0.92 },
          { fieldPath: "measure.eligibleCosts", fieldValue: ["оборудование", "объекты сельского туризма", "благоустройство территории"], quote: costsQuote, ...at(costsQuote), confidence: 0.95 },
          { fieldPath: "measure.maxAmount", fieldValue: 10_000_000, quote: "Максимальный размер гранта составляет 10 000 000 рублей.", charStart: 0, charEnd: 60, confidence: 0.7 }
        ]
      }
    };
  }
};

const project: ProjectProfile = {
  id: "project:kbr:berry-agrotourism",
  region: "Кабардино-Балкарская Республика",
  applicantType: "КФХ",
  sectors: ["сельское хозяйство", "агротуризм"],
  objectives: ["развитие сельского туризма"],
  plannedCosts: ["оборудование", "объекты сельского туризма"],
  availableCofinancingPercent: 30,
  requestedAmount: 7_500_000
};

test("live pipeline commits grounded fields, quarantines unsupported claims and explains recommendation", async () => {
  const result = await runLiveGovernmentSupportPipeline({
    source: AGRITOURISM_COSTS_2026_SOURCE,
    fetcher,
    extractor,
    project
  });

  assert.equal(result.verifiedEvidence.length, 4);
  assert.equal(result.rejectedEvidence.length, 1);
  assert.equal(result.rejectedEvidence[0]?.fieldPath, "measure.maxAmount");
  assert.equal(result.rejectedEvidence[0]?.reason, "quote-not-found");
  assert.equal(result.measure.maxAmount, undefined);
  assert.equal(result.measure.evidence.every((item) => item.status === "verified"), true);
  assert.equal(result.recommendation.status, "potentially-eligible");
  assert.equal(result.recommendation.blockers.length, 0);
  assert.equal(result.publishable, false);
  assert.match(result.provenance.snapshotHash, /^[a-f0-9]{64}$/u);
  assert.match(result.provenance.rawResponseHash, /^[a-f0-9]{64}$/u);
});

test("bounded source validation rejects arbitrary hosts and IP literals", () => {
  assert.throws(
    () => validateOfficialSourceTarget(AGRITOURISM_COSTS_2026_SOURCE, "https://example.com/document"),
    /not allowlisted/u
  );
  assert.throws(
    () => validateOfficialSourceTarget(AGRITOURISM_COSTS_2026_SOURCE, "https://127.0.0.1/document"),
    /IP-literal/u
  );
});

test("snapshot capture enforces size and content type boundaries", async () => {
  const artifact = await fetcher.fetch(AGRITOURISM_COSTS_2026_SOURCE);
  const snapshot = captureOfficialSnapshot(AGRITOURISM_COSTS_2026_SOURCE, artifact);
  assert.equal(snapshot.metadata?.sourceRegistryId, AGRITOURISM_COSTS_2026_SOURCE.id);
  assert.throws(
    () => captureOfficialSnapshot(AGRITOURISM_COSTS_2026_SOURCE, { ...artifact, contentType: "application/zip" }),
    /Unsupported content type/u
  );
});

test("evidence validator repairs one unique offset but rejects ambiguous quotes", () => {
  const snapshot = captureOfficialSnapshot(AGRITOURISM_COSTS_2026_SOURCE, {
    requestedUrl: AGRITOURISM_COSTS_2026_SOURCE.canonicalUrl,
    finalUrl: AGRITOURISM_COSTS_2026_SOURCE.canonicalUrl,
    status: 200,
    contentType: "text/html",
    rawBytes: new TextEncoder().encode(`${titleQuote} ${costsQuote} ${costsQuote}`),
    normalizedText: `${titleQuote} ${costsQuote} ${costsQuote}`,
    capturedAt: "2026-07-20T09:00:00.000Z"
  });
  const checked = validateFieldEvidence(snapshot, [
    { fieldPath: "measure.title", fieldValue: "x", quote: titleQuote, charStart: 4, charEnd: 8 },
    { fieldPath: "measure.eligibleCosts", fieldValue: ["x"], quote: costsQuote, charStart: 0, charEnd: 1 }
  ]);
  assert.equal(checked.verified.length, 1);
  assert.equal(checked.verified[0]?.charStart, 0);
  assert.equal(checked.rejected[0]?.reason, "ambiguous-quote");
});
