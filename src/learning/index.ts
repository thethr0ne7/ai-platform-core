import { LearningEngine } from "./learning_engine.js";

export const learningEngine = new LearningEngine({
  enabled: process.env.LEARNING_ENABLED !== "false",
  autoApplyMemory: process.env.LEARNING_AUTO_MEMORY !== "false",
  autoApplySkills: process.env.LEARNING_AUTO_SKILLS !== "false",
  minConfidence: Number(process.env.LEARNING_MIN_CONFIDENCE ?? 0.82),
  maxMemoryEntries: Number(process.env.LEARNING_MAX_MEMORY_ENTRIES ?? 200),
  maxSkillVersions: Number(process.env.LEARNING_MAX_SKILL_VERSIONS ?? 10)
});

export * from "./learning_engine.js";
export * from "./memory_store.js";
export * from "./skill_registry.js";
export * from "./types.js";
