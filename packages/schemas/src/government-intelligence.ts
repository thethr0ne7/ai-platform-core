export const GOVERNMENT_INTELLIGENCE_ENGINE_VERSION = "ver436sia-intelligence-v0.72" as const;

export type EpistemicStatus = "observed" | "inferred" | "hypothesis";
export type TruthStatus = "unverified" | "manual_review" | "verified" | "rejected";

export type GovernmentSignalType =
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

export type IntelligenceEntityType =
  | "organization"
  | "authority"
  | "person"
  | "official"
  | "programme"
  | "support_measure"
  | "territory"
  | "date"
  | "money"
  | "indicator"
  | "legal_document"
  | "project"
  | "other";

export interface EntityRef {
  key: string;
  type: IntelligenceEntityType;
  name: string;
  confidence: number;
}

export interface ResourceRef {
  kind: "money" | "equipment" | "land" | "infrastructure" | "service" | "other";
  value: unknown;
  unit?: string;
}

export interface DateRange {
  start?: string;
  end?: string;
  label?: string;
}

export interface IntelligenceProvenance {
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

export interface IntelligenceEntity extends IntelligenceProvenance {
  key: string;
  type: IntelligenceEntityType;
  canonicalName: string;
  aliases: string[];
  attributes: Record<string, unknown>;
}

export interface IntelligenceClaim extends IntelligenceProvenance {
  claimType: string;
  actor: EntityRef[];
  intent: string[];
  mechanism: string[];
  resource: ResourceRef[];
  control: string[];
  expectedOutcome: string[];
  territory: EntityRef[];
  effectiveDates: DateRange[];
  evidenceIds: string[];
  canSupportEligibility: boolean;
}

export interface IntelligenceEvent extends IntelligenceProvenance {
  eventType: string;
  occurredAt?: string;
  effectiveDates: DateRange[];
  payload: Record<string, unknown>;
  canSupportEligibility: false;
}

export interface IntelligenceSignal extends IntelligenceProvenance {
  key: string;
  type: GovernmentSignalType;
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

export interface IntelligenceRelation extends IntelligenceProvenance {
  subjectKey: string;
  predicate: string;
  objectKey?: string;
  objectValue?: unknown;
  canSupportEligibility: false;
}

export interface IntelligenceTrajectory extends IntelligenceProvenance {
  signalType: GovernmentSignalType;
  direction: "up" | "down" | "stable" | "emerging" | "terminating" | "insufficient_history";
  periodStart?: string;
  periodEnd?: string;
  velocity?: number;
  acceleration?: number;
  evidenceIds: string[];
  canSupportEligibility: false;
}

export interface IntelligenceNarrative extends IntelligenceProvenance {
  theme: string;
  repeatedTerms: string[];
  transitionStage: "rhetoric" | "programme" | "budget" | "legal_act" | "procurement";
  evidenceIds: string[];
  canSupportEligibility: false;
}

export interface ControlledForecast extends IntelligenceProvenance {
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

export interface DecisionCard extends IntelligenceProvenance {
  measureId?: string;
  decision: string;
  legalBasis: Array<Record<string, unknown>>;
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

export interface GovernmentIntelligenceBundle {
  engineVersion: string;
  projectId: string;
  projectCheckId?: string;
  inputKind: "project_report" | "official_source" | "project_document" | "mixed";
  entities: IntelligenceEntity[];
  claims: IntelligenceClaim[];
  events: IntelligenceEvent[];
  signals: IntelligenceSignal[];
  relations: IntelligenceRelation[];
  trajectories: IntelligenceTrajectory[];
  narratives: IntelligenceNarrative[];
  forecasts: ControlledForecast[];
  decisionCards: DecisionCard[];
  summary: {
    entities: number;
    claims: number;
    events: number;
    signals: number;
    relations: number;
    trajectories: number;
    narratives: number;
    forecasts: number;
    decisionCards: number;
    publishableDecisionCards: number;
  };
}
