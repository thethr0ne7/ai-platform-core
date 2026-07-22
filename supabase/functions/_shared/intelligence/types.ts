export const ENGINE_VERSION = "ver436sia-intelligence-v0.72";

export type EpistemicStatus = "observed" | "inferred" | "hypothesis";
export type TruthStatus = "unverified" | "manual_review" | "verified" | "rejected";
export type SignalType =
  | "funding_increase"
  | "funding_reduction"
  | "new_support_measure"
  | "eligibility_change"
  | "territorial_priority"
  | "sector_priority"
  | "application_window"
  | "legal_constraint"
  | "budget_commitment"
  | "procurement_activity"
  | "institutional_narrative"
  | "early_policy_signal"
  | "programme_termination";

export type JsonRecord = Record<string, unknown>;

export interface Provenance {
  projectId: string;
  projectCheckId?: string;
  sourceId?: string;
  sourceSnapshotId?: string;
  evidenceId?: string;
  confidence: number;
  epistemicStatus: EpistemicStatus;
  truthStatus: TruthStatus;
  engineVersion: string;
}

export interface RuntimeEntity extends Provenance {
  key: string;
  type: string;
  canonicalName: string;
  aliases: string[];
  attributes: JsonRecord;
}

export interface RuntimeClaim extends Provenance {
  claimType: string;
  actorKeys: string[];
  intent: string[];
  mechanism: string[];
  resource: unknown[];
  control: string[];
  expectedOutcome: string[];
  territoryKeys: string[];
  effectiveDates: JsonRecord[];
  canonicalPayload: JsonRecord;
  canSupportEligibility: boolean;
}

export interface RuntimeEvent extends Provenance {
  eventType: string;
  occurredAt?: string;
  effectiveDates: JsonRecord[];
  payload: JsonRecord;
  canSupportEligibility: false;
}

export interface RuntimeSignal extends Provenance {
  key: string;
  type: SignalType;
  title: string;
  summary: string;
  level: "federal" | "regional" | "municipal" | "project";
  region?: string;
  sectors: string[];
  firstDetectedAt: string;
  lastConfirmedAt?: string;
  evidenceIds: string[];
  canSupportEligibility: false;
}

export interface RuntimeRelation extends Provenance {
  subjectKey: string;
  predicate: string;
  objectKey?: string;
  objectValue?: unknown;
  canSupportEligibility: false;
}

export interface RuntimeTrajectory extends Provenance {
  signalType: SignalType;
  direction: "up" | "down" | "stable" | "emerging" | "terminating" | "insufficient_history";
  periodStart?: string;
  periodEnd?: string;
  velocity?: number;
  acceleration?: number;
  evidenceIds: string[];
  canSupportEligibility: false;
}

export interface RuntimeNarrative extends Provenance {
  theme: string;
  repeatedTerms: string[];
  transitionStage: "rhetoric" | "programme" | "budget" | "legal_act" | "procurement";
  evidenceIds: string[];
  canSupportEligibility: false;
}

export interface RuntimeForecast extends Provenance {
  forecastType: string;
  horizonMonths: number;
  statement: string;
  probability: number;
  assumptions: string[];
  falsificationConditions: string[];
  evidenceIds: string[];
  epistemicStatus: "hypothesis";
  canSupportEligibility: false;
}

export interface RuntimeDecisionCard extends Provenance {
  measureId?: string;
  decision: string;
  legalBasis: JsonRecord[];
  confirmedConditions: string[];
  blockers: string[];
  nextAction: string;
  forecastSignal?: string;
  forecastStatus?: "none" | "hypothesis" | "manual_review";
  eligibilityStatus: "match" | "mismatch" | "insufficient_data" | "manual_review";
  verifiedRequirementCount: number;
  verifiedEvidenceCount: number;
  truthGatePassed: boolean;
  publishStatus: "draft" | "manual_review" | "published" | "rejected";
}

export interface IntelligenceContext {
  projectId: string;
  projectCheckId?: string;
  report: JsonRecord;
}

export interface IntelligenceDraft {
  entities: RuntimeEntity[];
  claims: RuntimeClaim[];
  events: RuntimeEvent[];
  signals: RuntimeSignal[];
  relations: RuntimeRelation[];
  trajectories: RuntimeTrajectory[];
  narratives: RuntimeNarrative[];
}

export interface IntelligenceBundle extends IntelligenceDraft {
  engineVersion: string;
  projectId: string;
  projectCheckId?: string;
  inputKind: "project_report";
  forecasts: RuntimeForecast[];
  decisionCards: RuntimeDecisionCard[];
  summary: Record<string, number>;
}

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

export function asRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function asStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function boundedConfidence(value: unknown, fallback = 0.5): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

export function normalizeKey(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}
