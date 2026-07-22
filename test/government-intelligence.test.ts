import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzePreTruthIntelligence,
  finalizeGovernmentIntelligence,
} from "../supabase/functions/_shared/intelligence/index.ts";

const projectId = "85639bea-efda-4259-848a-08aea642b9a7";

function reportWithMeasure(overrides: Record<string, unknown> = {}) {
  return {
    executive_summary: {
      title: "СКИД",
      region: "Кабардино-Балкарская Республика",
      legal_form: "Физическое лицо",
      activity: "Агросервис и сельский туризм",
    },
    sources: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Министерство сельского хозяйства Российской Федерации",
        authority: "Министерство сельского хозяйства Российской Федерации",
        source_key: "mcx-russia",
      },
    ],
    source_changes: [
      {
        change_type: "amended",
        document_title: "Приказ Минсельхоза России № 187",
        authority: "Министерство сельского хозяйства Российской Федерации",
        source_name: "Министерство сельского хозяйства Российской Федерации",
        document_url: "https://publication.pravo.gov.ru/document/0001202504300025",
        summary: "Изменена территория применения меры в 2025 году.",
      },
    ],
    intelligence_signals: [
      {
        type: "territorial_priority",
        signal_stage: "mention",
        title: "Территориальный приоритет",
        summary: "Упомянуты отдельные субъекты Российской Федерации.",
        confidence: 0.7,
        level: "federal",
        horizon_months: 6,
      },
    ],
    measure_matches: [
      {
        measure_id: "22222222-2222-4222-8222-222222222222",
        title: "Льготное кредитование АПК по приказу № 187",
        authority: "Министерство сельского хозяйства Российской Федерации",
        measure_type: "loan",
        official_url: "https://publication.pravo.gov.ru/document/0001202504300025",
        eligibility_status: "mismatch",
        confidence: 0.75,
        blockers: ["Территория проекта не входит в область применения"],
        missing_data: ["Подтверждение первичным документом"],
        evidence_scope: {
          fully_verified: false,
          required_rules: 4,
          verified_rules: 0,
        },
        requirement_matrix: [
          {
            requirement_key: "territory_scope",
            label: "Территория применения",
            status: "mismatch",
            evidence_status: "manual_review",
            source_quote: "К мерам относятся отдельные субъекты Российской Федерации.",
          },
        ],
        ...overrides,
      },
    ],
    truth_gate: {
      can_claim_match: false,
      verified_evidence: 0,
    },
    readiness: {
      score: 29,
      assessment_level: "preliminary",
    },
  };
}

test("VER436SIA merge creates provenance-aware canonical intelligence", () => {
  const report = reportWithMeasure();
  const preTruth = analyzePreTruthIntelligence({ projectId, report });
  const bundle = finalizeGovernmentIntelligence({ projectId, finalReport: report, preTruth });

  assert.equal(bundle.engineVersion, "ver436sia-intelligence-v0.72");
  assert.ok(bundle.entities.some((entity) => entity.type === "authority"));
  assert.ok(bundle.entities.some((entity) => entity.type === "legal_document"));
  assert.ok(bundle.claims.length > 0);
  assert.ok(bundle.signals.every((signal) => signal.canSupportEligibility === false));
  assert.ok(bundle.trajectories.every((trajectory) => trajectory.canSupportEligibility === false));
  assert.ok(bundle.narratives.every((narrative) => narrative.canSupportEligibility === false));
  assert.ok(bundle.forecasts.every((forecast) => forecast.epistemicStatus === "hypothesis"));
  assert.ok(bundle.forecasts.every((forecast) => forecast.canSupportEligibility === false));
});

test("Canonical claims cannot support eligibility from partial evidence", () => {
  const report = reportWithMeasure({
    eligibility_status: "match",
    verdict_level: "candidate",
    evidence_scope: {
      fully_verified: false,
      required_rules: 2,
      verified_rules: 1,
    },
    requirement_matrix: [
      {
        requirement_key: "applicant_type",
        label: "Допустимая форма заявителя",
        status: "matched",
        evidence_status: "verified",
        evidence_id: "33333333-3333-4333-8333-333333333333",
      },
      {
        requirement_key: "territory",
        label: "Территория применения",
        status: "manual_review",
        evidence_status: "manual_review",
      },
    ],
  });
  const preTruth = analyzePreTruthIntelligence({ projectId, report });
  const bundle = finalizeGovernmentIntelligence({ projectId, finalReport: report, preTruth });
  const claim = bundle.claims[0];

  assert.ok(claim);
  assert.equal(claim.truthStatus, "manual_review");
  assert.equal(claim.canSupportEligibility, false);
});

test("Decision Cards remain manual review when Truth Gate is not passed", () => {
  const report = reportWithMeasure();
  const preTruth = analyzePreTruthIntelligence({ projectId, report });
  const bundle = finalizeGovernmentIntelligence({ projectId, finalReport: report, preTruth });
  const card = bundle.decisionCards[0];

  assert.ok(card);
  assert.equal(card.truthGatePassed, false);
  assert.equal(card.publishStatus, "manual_review");
  assert.equal(card.eligibilityStatus, "mismatch");
  assert.notEqual(card.truthStatus, "verified");
});

test("A verified quote without an evidence record cannot publish a Decision Card", () => {
  const report = reportWithMeasure({
    eligibility_status: "match",
    verdict_level: "verified_match",
    blockers: [],
    missing_data: [],
    evidence_scope: {
      fully_verified: true,
      required_rules: 1,
      verified_rules: 1,
    },
    requirement_matrix: [
      {
        requirement_key: "applicant_type",
        label: "Допустимая форма заявителя",
        status: "matched",
        evidence_status: "verified",
        source_quote: "Получателями являются крестьянские фермерские хозяйства.",
      },
    ],
  });
  const preTruth = analyzePreTruthIntelligence({ projectId, report });
  const bundle = finalizeGovernmentIntelligence({ projectId, finalReport: report, preTruth });
  const card = bundle.decisionCards[0];

  assert.ok(card);
  assert.equal(card.verifiedEvidenceCount, 0);
  assert.equal(card.truthGatePassed, false);
  assert.equal(card.publishStatus, "manual_review");
});

test("A Decision Card is publishable only with verified requirements and evidence", () => {
  const report = reportWithMeasure({
    eligibility_status: "match",
    blockers: [],
    missing_data: [],
    verdict_level: "verified_match",
    evidence_scope: {
      fully_verified: true,
      required_rules: 2,
      verified_rules: 2,
    },
    requirement_matrix: [
      {
        requirement_key: "applicant_type",
        label: "Допустимая форма заявителя",
        status: "matched",
        evidence_status: "verified",
        evidence_id: "33333333-3333-4333-8333-333333333333",
        source_quote: "Получателями являются крестьянские фермерские хозяйства.",
      },
      {
        requirement_key: "territory",
        label: "Территория применения",
        status: "matched",
        evidence_status: "verified",
        evidence_id: "44444444-4444-4444-8444-444444444444",
        source_quote: "Мера действует на территории Кабардино-Балкарской Республики.",
      },
    ],
  });
  const preTruth = analyzePreTruthIntelligence({ projectId, report });
  const bundle = finalizeGovernmentIntelligence({ projectId, finalReport: report, preTruth });
  const card = bundle.decisionCards[0];
  const claim = bundle.claims[0];

  assert.ok(card);
  assert.ok(claim);
  assert.equal(card.truthGatePassed, true);
  assert.equal(card.publishStatus, "published");
  assert.equal(card.verifiedRequirementCount, 2);
  assert.equal(card.verifiedEvidenceCount, 2);
  assert.equal(card.truthStatus, "verified");
  assert.equal(claim.truthStatus, "verified");
  assert.equal(claim.canSupportEligibility, true);
});
