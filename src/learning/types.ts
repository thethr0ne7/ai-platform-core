export type LearningDecision = "ignore" | "remember" | "propose-skill" | "update-skill";

export type LearningEventStatus = "observed" | "evaluated" | "applied" | "rejected";

export interface LearningObservation {
  id: string;
  requestId: string;
  traceId: string;
  productId: string;
  action: string;
  ok: boolean;
  durationMs: number;
  capabilitiesUsed: string[];
  inputSummary?: string;
  outputSummary?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface LearningEvaluation {
  observationId: string;
  decision: LearningDecision;
  reason: string;
  confidence: number;
  tags: string[];
  durableLesson?: string;
  skillName?: string;
}

export interface SkillVersion {
  version: number;
  instructions: string;
  reason: string;
  sourceObservationIds: string[];
  score: number;
  createdAt: string;
  active: boolean;
}

export interface LearnedSkill {
  name: string;
  description: string;
  tags: string[];
  versions: SkillVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryEntry {
  id: string;
  content: string;
  tags: string[];
  sourceObservationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface LearningPolicy {
  enabled: boolean;
  autoApplyMemory: boolean;
  autoApplySkills: boolean;
  minConfidence: number;
  maxMemoryEntries: number;
  maxSkillVersions: number;
}

export interface LearningStatus {
  policy: LearningPolicy;
  observations: number;
  memories: number;
  skills: number;
  pendingSkillCandidates: number;
}
