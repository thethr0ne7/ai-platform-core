import assert from "node:assert/strict";
import test from "node:test";
import {
  AutonomousDataValidationError,
  SourceRegistry,
  createIngestionJob,
  planDueIngestionJobs,
  type ProductDataRequirement,
  type SourceDefinition
} from "../src/autonomous-data.js";

const requirement: ProductDataRequirement = {
  id: "proidu.admission-programs.2026",
  productId: "proidu",
  entityType: "admission-program",
  requiredFields: ["universityId", "programId", "year", "sourceUrl"],
  freshness: { maximumAgeHours: 24, checkIntervalHours: 6 },
  sourcePolicy: {
    officialOnly: true,
    allowedDomains: ["example-university.ru"],
    minimumTrust: "official"
  },
  publicationPolicy: {
    mode: "quarantine",
    requireEvidence: true,
    minimumEvidence: 1,
    requireValidation: true
  }
};

function source(overrides: Partial<SourceDefinition> = {}): SourceDefinition {
  return {
    id: "source.example-university.programs",
    productId: "proidu",
    requirementId: requirement.id,
    entityType: requirement.entityType,
    url: "https://admission.example-university.ru/programs",
    trust: "official",
    status: "active",
    checkIntervalHours: 6,
    retryPolicy: { maxAttempts: 3, baseDelaySeconds: 60, maxDelaySeconds: 900 },
    ...overrides
  };
}

test("registers valid requirements and sources", () => {
  const registry = new SourceRegistry([requirement], [source()]);
  assert.equal(registry.listSources("proidu").length, 1);
});

test("rejects sources outside allowed domains", () => {
  const registry = new SourceRegistry([requirement]);
  assert.throws(
    () => registry.registerSource(source({ url: "https://aggregator.example/programs" })),
    (error: unknown) => error instanceof AutonomousDataValidationError && error.path === "source.url"
  );
});

test("enforces official-only source policies", () => {
  const registry = new SourceRegistry([requirement]);
  assert.throws(
    () => registry.registerSource(source({ trust: "authoritative" })),
    (error: unknown) => error instanceof AutonomousDataValidationError && error.path === "source.trust"
  );
});

test("protects registry state from caller mutation", () => {
  const input = source({ metadata: { section: "admissions" } });
  const registry = new SourceRegistry([requirement], [input]);
  input.metadata = { section: "changed" };
  const stored = registry.getSource(input.id);
  assert.deepEqual(stored?.metadata, { section: "admissions" });
  if (stored?.metadata) (stored.metadata as Record<string, unknown>).section = "mutated";
  assert.deepEqual(registry.getSource(input.id)?.metadata, { section: "admissions" });
});

test("plans never-checked and expired sources only", () => {
  const now = new Date("2026-07-19T18:00:00.000Z");
  const registry = new SourceRegistry([requirement], [
    source({ id: "source.never" }),
    source({ id: "source.expired", lastCheckedAt: "2026-07-19T10:00:00.000Z" }),
    source({ id: "source.fresh", lastCheckedAt: "2026-07-19T16:00:00.000Z" }),
    source({ id: "source.blocked", status: "blocked" })
  ]);
  assert.deepEqual(
    planDueIngestionJobs(registry, now, "proidu").map((job) => job.sourceId),
    ["source.expired", "source.never"]
  );
});

test("creates stable job identity within the same scheduling window", () => {
  const item = source();
  const first = createIngestionJob(item, new Date("2026-07-19T18:10:00.000Z"));
  const second = createIngestionJob(item, new Date("2026-07-19T20:30:00.000Z"));
  assert.equal(first.id, second.id);
  assert.equal(first.idempotencyKey, second.idempotencyKey);
});

test("creates a new job identity in the next scheduling window", () => {
  const item = source();
  const first = createIngestionJob(item, new Date("2026-07-19T18:10:00.000Z"));
  const second = createIngestionJob(item, new Date("2026-07-20T00:10:00.000Z"));
  assert.notEqual(first.id, second.id);
});

test("isolates due planning by product", () => {
  const otherRequirement: ProductDataRequirement = {
    ...requirement,
    id: "grant-ai.competitions",
    productId: "grant-ai"
  };
  const registry = new SourceRegistry([requirement, otherRequirement], [
    source(),
    source({
      id: "source.grants",
      productId: "grant-ai",
      requirementId: otherRequirement.id
    })
  ]);
  const jobs = planDueIngestionJobs(registry, new Date("2026-07-19T18:00:00.000Z"), "proidu");
  assert.deepEqual(jobs.map((job) => job.productId), ["proidu"]);
});
