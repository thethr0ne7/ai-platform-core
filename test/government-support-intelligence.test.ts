import assert from "node:assert/strict";
import test from "node:test";
import {
  DocumentVersionStore,
  buildSupportMeasure,
  deriveForecastSignals,
  recommendSupportMeasure,
  runGovernmentSupportIntelligenceSlice,
  type OfficialDocumentSnapshot,
  type ProjectProfile
} from "../src/government-support-intelligence.js";

const previousQuote = "Поддержка предоставляется сельскохозяйственным товаропроизводителям на приобретение оборудования для выращивания ягодных культур.";
const currentQuote = "Поддержка предоставляется сельскохозяйственным товаропроизводителям на приобретение оборудования, создание объектов переработки и развитие агротуристической инфраструктуры.";

const previousSnapshot: OfficialDocumentSnapshot = {
  id: "support:kbr:agro-development",
  authority: "Министерство сельского хозяйства Кабардино-Балкарской Республики",
  title: "Государственная программа развития сельского хозяйства",
  documentType: "program",
  jurisdiction: "Кабардино-Балкарская Республика",
  publishedAt: "2026-01-10T00:00:00.000Z",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  sourceUrl: "https://example.gov.ru/kbr/agro-program/2026/version-1",
  capturedAt: "2026-03-01T09:00:00.000Z",
  text: `Раздел 4. Меры государственной поддержки. ${previousQuote} Максимальный размер поддержки составляет 5 000 000 рублей. Софинансирование заявителя — 20 процентов.`
};

const currentSnapshot: OfficialDocumentSnapshot = {
  ...previousSnapshot,
  sourceUrl: "https://example.gov.ru/kbr/agro-program/2026/version-2",
  capturedAt: "2026-07-20T08:00:00.000Z",
  text: `Раздел 4. Меры государственной поддержки. ${currentQuote} Максимальный размер поддержки составляет 8 000 000 рублей. Софинансирование заявителя — 25 процентов.`
};

const previousMeasure = buildSupportMeasure({
  snapshot: previousSnapshot,
  id: "measure:kbr:agro-development",
  title: "Поддержка развития агропроизводства",
  instrument: "subsidy",
  sectors: ["ягодные культуры", "сельское хозяйство"],
  applicantTypes: ["КФХ", "ИП", "ООО"],
  objectives: ["выращивание ягод"],
  eligibleCosts: ["оборудование"],
  conditions: ["реализация проекта на территории КБР"],
  maxAmount: 5_000_000,
  cofinancingPercent: 20,
  quote: previousQuote,
  locator: "раздел 4"
});

const currentMeasure = buildSupportMeasure({
  snapshot: currentSnapshot,
  id: "measure:kbr:agro-development",
  title: "Поддержка развития агропроизводства и агротуризма",
  instrument: "subsidy",
  sectors: ["ягодные культуры", "сельское хозяйство", "агротуризм"],
  applicantTypes: ["КФХ", "ИП", "ООО"],
  objectives: ["выращивание ягод", "переработка продукции", "развитие агротуризма"],
  eligibleCosts: ["оборудование", "объекты переработки", "агротуристическая инфраструктура"],
  conditions: ["реализация проекта на территории КБР"],
  maxAmount: 8_000_000,
  cofinancingPercent: 25,
  quote: currentQuote,
  locator: "раздел 4"
});

const project: ProjectProfile = {
  id: "project:berry-farm-kbr",
  region: "Кабардино-Балкарская Республика",
  applicantType: "КФХ",
  sectors: ["ягодные культуры", "агротуризм"],
  objectives: ["выращивание ягод", "переработка продукции", "развитие агротуризма"],
  plannedCosts: ["оборудование", "объекты переработки", "агротуристическая инфраструктура"],
  availableCofinancingPercent: 30,
  requestedAmount: 7_500_000
};

test("one product traces a support change, forecasts bounded signals and recommends with evidence", () => {
  const result = runGovernmentSupportIntelligenceSlice({
    store: new DocumentVersionStore(),
    previousSnapshot,
    currentSnapshot,
    previousMeasure,
    currentMeasure,
    project
  });

  assert.equal(result.previousVersion?.version, 1);
  assert.equal(result.currentVersion.version, 2);
  assert.equal(result.change.kind, "updated");
  assert.equal(result.change.changedFields.includes("maxAmount"), true);
  assert.equal(result.change.changedFields.includes("eligibleCosts"), true);
  assert.equal(result.change.changedFields.includes("objectives"), true);

  assert.deepEqual(result.signals.map((signal) => signal.level), [
    "observation",
    "interpretation",
    "hypothesis"
  ]);
  assert.equal(result.signals[0]?.confidence, 1);
  assert.equal(result.signals[2]?.confidence, 0.45);
  assert.deepEqual(result.signals[2]?.horizonMonths, [6, 24]);
  assert.equal((result.signals[2]?.falsificationCriteria.length ?? 0) > 0, true);

  assert.equal(result.recommendation.status, "potentially-eligible");
  assert.equal(result.recommendation.fitScore, 100);
  assert.equal(result.recommendation.blockers.length, 0);
  assert.equal(result.recommendation.evidence[0]?.status, "verified");
  assert.equal(result.recommendation.evidence[0]?.sourceUrl, currentSnapshot.sourceUrl);
});

test("recommendation blocks an applicant that fails explicit eligibility and cofinancing rules", () => {
  const blocked = recommendSupportMeasure(currentMeasure, {
    ...project,
    id: "project:blocked",
    applicantType: "физлицо",
    availableCofinancingPercent: 10,
    requestedAmount: 9_000_000
  });

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blockers.length, 3);
  assert.match(blocked.blockers.join(" "), /Applicant type/);
  assert.match(blocked.blockers.join(" "), /exceeds maximum/);
  assert.match(blocked.blockers.join(" "), /cofinancing/);
});

test("forecast engine emits no speculative signal when nothing changed", () => {
  const store = new DocumentVersionStore();
  const version = store.put(currentSnapshot);
  const signals = deriveForecastSignals(currentMeasure, {
    documentId: currentSnapshot.id,
    kind: "unchanged",
    fromVersion: version.version,
    toVersion: version.version,
    changedFields: [],
    summary: "No material change",
    evidence: currentMeasure.evidence
  });

  assert.deepEqual(signals, []);
});

test("evidence quote must exist in the official snapshot", () => {
  assert.throws(
    () => buildSupportMeasure({
      snapshot: currentSnapshot,
      id: "measure:ungrounded",
      title: "Ungrounded",
      instrument: "grant",
      sectors: ["agriculture"],
      applicantTypes: ["КФХ"],
      objectives: ["production"],
      eligibleCosts: ["equipment"],
      conditions: [],
      quote: "Этого текста в официальном документе нет."
    }),
    /not grounded/
  );
});
