import { LearningEngine } from "./learning_engine.js";

function parseFiniteNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = parseFiniteNumber(value, fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseConfidence(value: string | undefined, fallback: number): number {
  const parsed = parseFiniteNumber(value, fallback);
  return parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export const learningEngine = new LearningEngine({
  enabled: process.env.LEARNING_ENABLED !== "false",
  autoApplyMemory: process.env.LEARNING_AUTO_MEMORY !== "false",
  autoApplySkills: process.env.LEARNING_AUTO_SKILLS !== "false",
  minConfidence: parseConfidence(process.env.LEARNING_MIN_CONFIDENCE, 0.82),
  maxMemoryEntries: parsePositiveInteger(process.env.LEARNING_MAX_MEMORY_ENTRIES, 200),
  maxSkillVersions: parsePositiveInteger(process.env.LEARNING_MAX_SKILL_VERSIONS, 10),
  maxObservations: parsePositiveInteger(process.env.LEARNING_MAX_OBSERVATIONS, 500)
});

export * from "./learning_engine.js";
export * from "./memory_store.js";
export * from "./skill_registry.js";
export * from "./types.js";
