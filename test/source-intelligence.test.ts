import assert from "node:assert/strict";
import test from "node:test";

import { createInitialOfficialSourceRegistry } from "../src/official-sources.js";
import {
  canonicalizeUrl,
  compareEvidenceVersions,
  createEvidenceRecord,
  decideExtraction,
  detectFormat,
} from "../src/source-intelligence.js";

test("registry accepts only official HTTPS domains", () => {
  const registry = createInitialOfficialSourceRegistry();
  const valid = registry.assertOfficialUrl(
    "pravo-publication",
    "https://publication.pravo.gov.ru/Document/View/0001202107020026?utm_source=test#fragment",
  );
  assert.equal(valid.hostname, "publication.pravo.gov.ru");
  assert.throws(
    () => registry.assertOfficialUrl("pravo-publication", "https://example.com/fake.pdf"),
    /не принадлежит разрешённому официальному домену/,
  );
});

test("extraction routing prefers native text and uses OCR only as fallback", () => {
  assert.deepEqual(
    decideExtraction({ url: "https://example.test/document.pdf", contentType: "application/pdf", text: "Коротко" }),
    {
      format: "pdf",
      method: "ocr",
      requiresOcr: true,
      reason: "В PDF отсутствует пригодный текстовый слой",
    },
  );

  const readablePdf = decideExtraction({
    url: "https://example.test/document.pdf",
    contentType: "application/pdf",
    text: "Официальный документ ".repeat(10),
  });
  assert.equal(readablePdf.method, "native-document");
  assert.equal(readablePdf.requiresOcr, false);

  assert.equal(detectFormat({ url: "https://example.test/table.xlsx" }), "xlsx");
  assert.equal(decideExtraction({ url: "https://example.test/scan.png" }).method, "ocr");
});

test("canonical URL removes tracking data but preserves document parameters", () => {
  assert.equal(
    canonicalizeUrl("https://publication.pravo.gov.ru/search?DocumentDateFrom=2026-01-01&utm_source=test&yclid=1"),
    "https://publication.pravo.gov.ru/search?DocumentDateFrom=2026-01-01",
  );
});

test("evidence record keeps provenance and stable content hash", () => {
  const registry = createInitialOfficialSourceRegistry();
  const source = registry.get("pravo-publication");
  const record = createEvidenceRecord({
    source,
    item: {
      sourceId: source.id,
      canonicalUrl: "https://publication.pravo.gov.ru/Document/View/0001202107020026",
      title: "Федеральный закон № 318-ФЗ",
      documentNumber: "318-ФЗ",
      publishedAt: "2021-07-02",
      authority: "Российская Федерация",
      attachmentUrls: [],
      rawMetadata: { publicationNumber: "0001202107020026" },
    },
    checkedAt: "2026-07-20T18:00:00.000Z",
    text: "  Правовая основа сельского туризма.  ",
    extractionMethod: "html",
    citations: [{ locator: "статья 1", quote: "Правовая основа сельского туризма." }],
  });

  assert.equal(record.text, "Правовая основа сельского туризма.");
  assert.equal(record.documentNumber, "318-ФЗ");
  assert.equal(record.contentHash.length, 64);
  assert.equal(record.citations[0]?.locator, "статья 1");
});

test("version comparison reports meaningful added and removed lines", () => {
  const result = compareEvidenceVersions(
    "Размер гранта: 10 млн рублей\nСофинансирование: 20%",
    "Размер гранта: 15 млн рублей\nСофинансирование: 20%\nТребуется право на земельный участок",
  );

  assert.equal(result.changed, true);
  assert.deepEqual(result.removedLines, ["Размер гранта: 10 млн рублей"]);
  assert.deepEqual(result.addedLines, [
    "Размер гранта: 15 млн рублей",
    "Требуется право на земельный участок",
  ]);
});
