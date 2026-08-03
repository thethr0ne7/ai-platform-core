import assert from "node:assert/strict";
import test from "node:test";

import { detectSignals } from "../supabase/functions/_shared/intelligence/signal-engine.ts";

const projectId = "85639bea-efda-4259-848a-08aea642b9a7";
const sourceId = "11111111-1111-4111-8111-111111111111";

function context(report: Record<string, unknown>) {
  return { projectId, report } as Parameters<typeof detectSignals>[0];
}

test("semantically identical stored signals collapse into one signal", () => {
  const report = {
    sources: [
      {
        id: sourceId,
        name: "Министерство сельского хозяйства КБР",
        authority: "Министерство сельского хозяйства КБР",
        source_key: "mcx-kbr",
      },
    ],
    source_changes: [],
    intelligence_signals: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        type: "support_opportunity",
        title: "Обнаружена мера государственной поддержки",
        summary: "Сигнал выявлен в официальном источнике Министерство сельского хозяйства КБР.",
        source_name: "Министерство сельского хозяйства КБР",
        confidence: 0.72,
        level: "regional",
        first_detected_at: "2026-07-22T09:14:36.000Z",
        last_confirmed_at: "2026-07-22T09:14:36.000Z",
        evidence_ids: ["22222222-2222-4222-8222-222222222222"],
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        type: "support_opportunity",
        title: "Обнаружена мера государственной поддержки",
        summary: "Сигнал выявлен в официальном источнике Министерство сельского хозяйства КБР.",
        source_name: "Министерство сельского хозяйства КБР",
        confidence: 0.82,
        level: "regional",
        first_detected_at: "2026-08-03T12:17:02.000Z",
        last_confirmed_at: "2026-08-03T12:17:02.000Z",
        evidence_ids: ["33333333-3333-4333-8333-333333333333"],
      },
    ],
  };

  const signals = detectSignals(context(report));

  assert.equal(signals.length, 1);
  assert.equal(signals[0].confidence, 0.82);
  assert.equal(signals[0].firstDetectedAt, "2026-07-22T09:14:36.000Z");
  assert.equal(signals[0].lastConfirmedAt, "2026-08-03T12:17:02.000Z");
  assert.deepEqual(
    [...signals[0].evidenceIds].sort(),
    [
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ],
  );
});

test("repeated source-change runs collapse by document and meaning", () => {
  const report = {
    sources: [
      {
        id: sourceId,
        name: "Минсельхоз России",
        authority: "Минсельхоз России",
        source_key: "mcx-russia",
      },
    ],
    intelligence_signals: [],
    source_changes: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        change_type: "amended",
        document_title: "Приказ Минсельхоза России № 187",
        document_url: "https://publication.pravo.gov.ru/document/0001202504300025",
        source_name: "Минсельхоз России",
        authority: "Минсельхоз России",
        summary: "Обнаружена новая версия официального документа",
        detected_at: "2026-08-02T10:00:00.000Z",
        severity: "low",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        change_type: "amended",
        document_title: "Приказ Минсельхоза России № 187",
        document_url: "https://publication.pravo.gov.ru/document/0001202504300025",
        source_name: "Минсельхоз России",
        authority: "Минсельхоз России",
        summary: "Обнаружена новая версия официального документа",
        detected_at: "2026-08-03T10:00:00.000Z",
        severity: "high",
      },
    ],
  };

  const signals = detectSignals(context(report));

  assert.equal(signals.length, 1);
  assert.equal(signals[0].confidence, 0.75);
  assert.equal(signals[0].firstDetectedAt, "2026-08-02T10:00:00.000Z");
  assert.equal(signals[0].lastConfirmedAt, "2026-08-03T10:00:00.000Z");
});
