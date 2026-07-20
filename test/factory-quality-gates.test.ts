import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePublishGate,
  evaluateWritingQuality
} from "../src/writing-quality-gate.js";
import {
  canExecuteFactoryWork,
  canShipFactoryWork,
  type FactoryWorkContract
} from "../src/factory-work-contract.js";

const evidenceQuote = "Поддержка предоставляется сельскохозяйственным товаропроизводителям на создание объектов переработки.";

function baseContract(): FactoryWorkContract {
  return {
    id: "factory:gsi:27",
    goal: "Trace and recommend an official support measure",
    product: "Government Support Intelligence",
    mode: "production",
    maxRetries: 2,
    requiresApproval: true,
    killCriteria: ["No verified official source", "Unsupported legal conclusion"],
    checkpoints: [
      {
        stage: "research",
        status: "passed",
        completedAt: "2026-07-20T08:00:00.000Z",
        evidence: [{ id: "e1", source: "https://example.gov.ru/program", status: "verified" }]
      },
      { stage: "propose", status: "passed", completedAt: "2026-07-20T08:01:00.000Z" },
      { stage: "validate", status: "passed", completedAt: "2026-07-20T08:02:00.000Z" },
      { stage: "approve-commit", status: "passed", completedAt: "2026-07-20T08:03:00.000Z" }
    ]
  };
}

test("writing gate flags formulaic prose and protects verified evidence", () => {
  const text = `Важно отметить, что это не просто поддержка, а настоящий механизм роста — последствия значительны.\n\n${evidenceQuote}`;
  const result = evaluateWritingQuality({
    text,
    protectedSpans: [{ text: evidenceQuote, kind: "verified-evidence" }]
  });

  assert.equal(result.protectedSpansPreserved, true);
  assert.equal(result.violations.some((item) => item.code === "throat-clearing"), true);
  assert.equal(result.violations.some((item) => item.code === "binary-contrast"), true);
  assert.equal(result.violations.some((item) => item.code === "em-dash"), true);
  assert.equal(result.violations.some((item) => item.excerpt.includes(evidenceQuote)), false);
});

test("publish gate requires evidence, domain approval and sufficient prose quality", () => {
  const clean = `Министерство расширило перечень допустимых расходов. Проект соответствует отрасли и территории действия меры.\n\n${evidenceQuote}`;
  const blocked = evaluatePublishGate({
    text: clean,
    evidenceValidated: false,
    domainValidated: true,
    protectedSpans: [{ text: evidenceQuote, kind: "verified-evidence" }]
  });
  assert.equal(blocked.canShip, false);
  assert.match(blocked.blockers.join(" "), /Evidence validation/);

  const passed = evaluatePublishGate({
    text: clean,
    evidenceValidated: true,
    domainValidated: true,
    protectedSpans: [{ text: evidenceQuote, kind: "verified-evidence" }]
  });
  assert.equal(passed.canShip, true);
  assert.equal(passed.writing.total >= 35, true);
});

test("harness blocks execution before explicit approval", () => {
  const contract = baseContract();
  const withoutApproval: FactoryWorkContract = {
    ...contract,
    checkpoints: contract.checkpoints.filter((item) => item.stage !== "approve-commit")
  };
  const decision = canExecuteFactoryWork(withoutApproval);
  assert.equal(decision.allowed, false);
  assert.match(decision.blockers.join(" "), /approval\/commit/);
});

test("harness permits shipping only after execute, observe and save", () => {
  const contract: FactoryWorkContract = {
    ...baseContract(),
    checkpoints: [
      ...baseContract().checkpoints,
      { stage: "execute", status: "passed", completedAt: "2026-07-20T08:04:00.000Z" },
      { stage: "observe", status: "passed", completedAt: "2026-07-20T08:05:00.000Z" },
      { stage: "save", status: "passed", completedAt: "2026-07-20T08:06:00.000Z" }
    ]
  };
  assert.equal(canShipFactoryWork(contract).allowed, true);
});

test("research cannot pass without verified evidence", () => {
  const contract: FactoryWorkContract = {
    ...baseContract(),
    checkpoints: [
      {
        stage: "research",
        status: "passed",
        evidence: [{ id: "e1", source: "https://example.gov.ru/program", status: "unverified" }]
      }
    ]
  };
  assert.throws(() => canExecuteFactoryWork(contract), /verified evidence/);
});
