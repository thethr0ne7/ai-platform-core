import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIntelligenceDecisionBrief,
  type IntelligenceClaim,
  type IntelligenceEvidence
} from "../src/intelligence-lens-engine.js";

const evidence: IntelligenceEvidence[] = [
  { id: "market-pack", sourceType: "market-document", sourceRef: "agroservice_70pct_and_equipment_kbr", verified: true },
  { id: "territory-map", sourceType: "calculation", sourceRef: "karta_dohodnosti_kbr", verified: true },
  { id: "client-pack", sourceType: "project-document", sourceRef: "agroservice_documents_package", verified: true },
  { id: "masterplan", sourceType: "project-document", sourceRef: "agroservice_kbr_expanded_masterplan", verified: true },
  { id: "unverified-grant", sourceType: "official-document", sourceRef: "regional-rules-not-captured", verified: false }
];

const claims: IntelligenceClaim[] = [
  {
    id: "territory-baksan",
    lens: "territorial",
    level: "fact",
    statement: "The Baksan cluster ranks highest in the supplied profitability map.",
    evidenceIds: ["territory-map"], confidence: 1, falsificationCriteria: [], tags: ["high-priority-cluster"]
  },
  {
    id: "production-repeat",
    lens: "production",
    level: "fact",
    statement: "Orchard spraying may repeat 8–12 times per season on the same hectare.",
    evidenceIds: ["market-pack"], confidence: 1, falsificationCriteria: [], tags: ["repeatable-operation"]
  },
  {
    id: "logistics-clusters",
    lens: "logistics",
    level: "interpretation",
    statement: "Cluster scheduling should reduce empty travel and protect service margin.",
    evidenceIds: ["market-pack", "territory-map"], confidence: 0.8,
    falsificationCriteria: ["Measured cluster routing does not reduce travel time or cost."]
  },
  {
    id: "market-seasonal-packages",
    lens: "market",
    level: "interpretation",
    statement: "Seasonal service packages can create more predictable utilization than isolated jobs.",
    evidenceIds: ["market-pack"], confidence: 0.75,
    falsificationCriteria: ["Customer interviews show no willingness to commit to seasonal packages."],
    tags: ["needs-client-interviews"]
  },
  {
    id: "client-demand-proof",
    lens: "client",
    level: "fact",
    statement: "The document package defines letters of intent and hectare-operation registers as demand evidence.",
    evidenceIds: ["client-pack"], confidence: 1, falsificationCriteria: [],
    tags: ["demand-proof", "needs-letters-of-intent"]
  },
  {
    id: "economic-unit-model",
    lens: "economic",
    level: "interpretation",
    statement: "Repeatable orchard operations and compact routes could support positive unit economics.",
    evidenceIds: ["market-pack", "territory-map"], confidence: 0.55,
    falsificationCriteria: ["Supplier quotes and measured routes produce negative contribution margin."],
    tags: ["needs-financial-model"]
  },
  {
    id: "financial-unverified",
    lens: "financial",
    level: "hypothesis",
    statement: "Two tractors can generate sufficient cash flow to service leasing obligations.",
    evidenceIds: ["masterplan"], confidence: 0.4,
    falsificationCriteria: ["Validated cash-flow stress tests show covenant breach or negative liquidity."],
    tags: ["needs-financial-model"]
  },
  {
    id: "legal-applicant",
    lens: "legal",
    level: "hypothesis",
    statement: "A KFH structure may be required for the priority support route.",
    evidenceIds: ["unverified-grant"], confidence: 0.3,
    falsificationCriteria: ["Current regional rules permit another applicant form."],
    tags: ["needs-official-rules"]
  },
  {
    id: "support-route",
    lens: "support",
    level: "hypothesis",
    statement: "A grant plus leasing structure may fit the project.",
    evidenceIds: ["unverified-grant"], confidence: 0.25,
    falsificationCriteria: ["Current rules prohibit the planned costs or financing combination."],
    tags: ["needs-official-rules"]
  },
  {
    id: "document-gap",
    lens: "document",
    level: "hypothesis",
    statement: "Current regional competition rules have not yet been captured.",
    evidenceIds: ["unverified-grant"], confidence: 1,
    falsificationCriteria: ["A verified current official snapshot is registered."]
  },
  {
    id: "evidence-separation",
    lens: "evidence",
    level: "fact",
    statement: "Project documents are evidence of planning assumptions, not proof of current government rules.",
    evidenceIds: ["masterplan"], confidence: 1, falsificationCriteria: []
  },
  {
    id: "risk-logistics",
    lens: "risk",
    level: "interpretation",
    statement: "Long-distance equipment movement can erase margin and increase downtime.",
    evidenceIds: ["masterplan", "territory-map"], confidence: 0.85,
    falsificationCriteria: ["Measured logistics remains below the defined margin threshold."]
  },
  {
    id: "strategic-path",
    lens: "strategic",
    level: "interpretation",
    statement: "Agroservice can be used as a lower-risk entry before production and agritourism.",
    evidenceIds: ["masterplan"], confidence: 0.7,
    falsificationCriteria: ["Demand validation fails or the service phase cannot finance the transition."]
  },
  {
    id: "forecast-demand",
    lens: "forecast",
    level: "hypothesis",
    statement: "Mechanization demand may remain durable in orchard clusters.",
    evidenceIds: ["masterplan", "market-pack"], confidence: 0.5,
    falsificationCriteria: ["Customer demand, orchard area or outsourcing frequency materially declines."]
  }
];

test("builds a multidimensional brief and blocks premature confidence", () => {
  const brief = buildIntelligenceDecisionBrief({
    projectId: "kbr-agroservice",
    projectName: "KBR agroservice on 2–5 mini tractors",
    evidence,
    claims
  });

  assert.equal(brief.decisionStatus, "needs-evidence");
  assert.ok(brief.opportunities.some((item) => item.lens === "territorial"));
  assert.ok(brief.opportunities.some((item) => item.lens === "production"));
  assert.ok(brief.opportunities.some((item) => item.lens === "client"));
  assert.ok(brief.warnings.some((item) => item.lens === "risk"));
  assert.ok(brief.nextActions.some((item) => item.includes("10–15 structured customer interviews")));
  assert.ok(brief.nextActions.some((item) => item.includes("current regional competition rules")));
  assert.ok(brief.nextActions.some((item) => item.includes("CAPEX, OPEX")));

  const legal = brief.lensAssessments.find((item) => item.lens === "legal");
  const support = brief.lensAssessments.find((item) => item.lens === "support");
  assert.equal(legal?.status, "partial");
  assert.equal(support?.status, "partial");
  assert.deepEqual(legal?.unsupportedClaimIds, ["legal-applicant"]);
});

test("rejects facts without evidence", () => {
  assert.throws(() => buildIntelligenceDecisionBrief({
    projectId: "invalid",
    projectName: "Invalid",
    evidence: [],
    claims: [{
      id: "unsupported-fact",
      lens: "financial",
      level: "fact",
      statement: "The project is profitable.",
      evidenceIds: [],
      confidence: 1,
      falsificationCriteria: []
    }]
  }), /requires evidence/);
});

test("requires falsification criteria for interpretations and hypotheses", () => {
  assert.throws(() => buildIntelligenceDecisionBrief({
    projectId: "invalid-forecast",
    projectName: "Invalid forecast",
    evidence: [{ id: "e", sourceType: "calculation", sourceRef: "x", verified: true }],
    claims: [{
      id: "bad-hypothesis",
      lens: "forecast",
      level: "hypothesis",
      statement: "Demand will grow.",
      evidenceIds: ["e"],
      confidence: 0.6,
      falsificationCriteria: []
    }]
  }), /requires falsification criteria/);
});
