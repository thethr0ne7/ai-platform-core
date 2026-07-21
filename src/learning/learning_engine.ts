import { randomUUID } from "node:crypto";
import { MemoryStore } from "./memory_store.js";
import { SkillRegistry, type SkillCandidate } from "./skill_registry.js";
import type {
  LearningEvaluation,
  LearningObservation,
  LearningPolicy,
  LearningStatus
} from "./types.js";

const DEFAULT_POLICY: LearningPolicy = {
  enabled: true,
  autoApplyMemory: true,
  autoApplySkills: true,
  minConfidence: 0.82,
  maxMemoryEntries: 200,
  maxSkillVersions: 10
};

function summarize(value: unknown, limit = 500): string | undefined {
  if (value === undefined) return undefined;
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length <= limit ? text : `${text.slice(0, limit)}…`;
  } catch {
    return undefined;
  }
}

export class LearningEngine {
  private readonly observations = new Map<string, LearningObservation>();
  readonly memory: MemoryStore;
  readonly skills: SkillRegistry;

  constructor(readonly policy: LearningPolicy = DEFAULT_POLICY) {
    this.memory = new MemoryStore(policy.maxMemoryEntries);
    this.skills = new SkillRegistry(policy.maxSkillVersions);
  }

  status(): LearningStatus {
    return {
      policy: this.policy,
      observations: this.observations.size,
      memories: this.memory.list().length,
      skills: this.skills.list().length,
      pendingSkillCandidates: this.skills.listPending().length
    };
  }

  listObservations(): LearningObservation[] {
    return [...this.observations.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async observe(input: {
    requestId: string;
    traceId: string;
    productId: string;
    action: string;
    ok: boolean;
    durationMs: number;
    capabilitiesUsed: string[];
    requestPayload?: unknown;
    resultData?: unknown;
    errorCode?: string;
    errorMessage?: string;
  }): Promise<LearningEvaluation | null> {
    if (!this.policy.enabled) return null;

    const observation: LearningObservation = {
      id: randomUUID(),
      requestId: input.requestId,
      traceId: input.traceId,
      productId: input.productId,
      action: input.action,
      ok: input.ok,
      durationMs: input.durationMs,
      capabilitiesUsed: input.capabilitiesUsed,
      inputSummary: summarize(input.requestPayload),
      outputSummary: summarize(input.resultData),
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      createdAt: new Date().toISOString()
    };
    this.observations.set(observation.id, observation);

    const evaluation = this.evaluate(observation);
    if (evaluation.confidence < this.policy.minConfidence) return evaluation;

    if (evaluation.decision === "remember" && evaluation.durableLesson && this.policy.autoApplyMemory) {
      this.memory.add({
        content: evaluation.durableLesson,
        tags: evaluation.tags,
        sourceObservationId: observation.id
      });
    }

    if (
      (evaluation.decision === "propose-skill" || evaluation.decision === "update-skill") &&
      evaluation.skillName
    ) {
      const candidate = this.toSkillCandidate(observation, evaluation);
      this.skills.propose(candidate);
      if (this.policy.autoApplySkills) this.skills.apply(candidate);
    }

    return evaluation;
  }

  private evaluate(observation: LearningObservation): LearningEvaluation {
    if (!observation.ok) {
      const repeated = this.listObservations().filter(
        (item) =>
          item.id !== observation.id &&
          item.action === observation.action &&
          item.errorCode === observation.errorCode
      ).length;

      if (repeated >= 1 && observation.errorCode) {
        return {
          observationId: observation.id,
          decision: "propose-skill",
          reason: "Repeated failure pattern can be converted into a recovery procedure.",
          confidence: Math.min(0.98, 0.84 + repeated * 0.04),
          tags: ["recovery", observation.action, observation.errorCode],
          durableLesson: `${observation.action} repeatedly failed with ${observation.errorCode}: ${observation.errorMessage ?? "no message"}`,
          skillName: `recover-${observation.action}-${observation.errorCode}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-")
        };
      }

      return {
        observationId: observation.id,
        decision: "remember",
        reason: "Failure is useful operational memory but not yet a stable procedure.",
        confidence: 0.86,
        tags: ["failure", observation.action, observation.errorCode ?? "unknown"],
        durableLesson: `${observation.action} failed with ${observation.errorCode ?? "UNKNOWN"}: ${observation.errorMessage ?? "no message"}`
      };
    }

    const priorSuccesses = this.listObservations().filter(
      (item) => item.id !== observation.id && item.ok && item.action === observation.action
    ).length;

    if (priorSuccesses >= 2) {
      return {
        observationId: observation.id,
        decision: "propose-skill",
        reason: "Repeated successful trajectory is stable enough to become a reusable skill.",
        confidence: Math.min(0.97, 0.83 + priorSuccesses * 0.03),
        tags: ["success", "procedure", observation.action],
        durableLesson: `${observation.action} completed successfully in ${observation.durationMs} ms using ${observation.capabilitiesUsed.join(", ") || "no declared capabilities"}.`,
        skillName: `perform-${observation.action}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-")
      };
    }

    return {
      observationId: observation.id,
      decision: "remember",
      reason: "Successful execution provides a durable operational example.",
      confidence: 0.83,
      tags: ["success", observation.action],
      durableLesson: `${observation.action} succeeded in ${observation.durationMs} ms.`
    };
  }

  private toSkillCandidate(
    observation: LearningObservation,
    evaluation: LearningEvaluation
  ): SkillCandidate {
    const skillName = evaluation.skillName ?? `learned-${observation.action}`;
    const instructions = observation.ok
      ? [
          `Execute action: ${observation.action}.`,
          `Use capabilities: ${observation.capabilitiesUsed.join(", ") || "none"}.`,
          "Validate the result before returning it.",
          `Reference observation: ${observation.id}.`
        ].join("\n")
      : [
          `Recover action: ${observation.action}.`,
          `Detect error: ${observation.errorCode ?? "UNKNOWN"}.`,
          "Apply the safest available fallback and preserve evidence.",
          "Stop after bounded retries and report the failure class.",
          `Reference observation: ${observation.id}.`
        ].join("\n");

    return {
      name: skillName,
      description: `Autonomously learned procedure for ${observation.action}`,
      instructions,
      reason: evaluation.reason,
      tags: evaluation.tags,
      sourceObservationIds: [observation.id],
      score: evaluation.confidence
    };
  }
}
