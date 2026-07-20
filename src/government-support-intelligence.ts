import { createHash } from "node:crypto";

export type EvidenceStatus = "verified" | "unverified" | "inferred";
export type SignalLevel = "observation" | "interpretation" | "hypothesis";
export type ChangeKind = "created" | "updated" | "removed" | "unchanged";
export type SupportInstrument = "grant" | "subsidy" | "concessional-loan" | "tax-benefit" | "land" | "guarantee" | "other";

export interface OfficialDocumentSnapshot {
  id: string;
  authority: string;
  title: string;
  documentType: "law" | "decree" | "order" | "program" | "budget" | "competition" | "guidance" | "other";
  jurisdiction: string;
  publishedAt: string;
  effectiveFrom?: string;
  sourceUrl: string;
  capturedAt: string;
  text: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface DocumentVersion {
  documentId: string;
  contentHash: string;
  version: number;
  snapshot: OfficialDocumentSnapshot;
}

export interface EvidenceLink {
  id: string;
  documentId: string;
  sourceUrl: string;
  quote: string;
  status: EvidenceStatus;
  capturedAt: string;
  locator?: string;
}

export interface SupportMeasure {
  id: string;
  title: string;
  authority: string;
  instrument: SupportInstrument;
  jurisdiction: string;
  sectors: readonly string[];
  applicantTypes: readonly string[];
  objectives: readonly string[];
  eligibleCosts: readonly string[];
  maxAmount?: number;
  cofinancingPercent?: number;
  validFrom?: string;
  validTo?: string;
  evidence: readonly EvidenceLink[];
  conditions: readonly string[];
  exclusions: readonly string[];
}

export interface MaterialChange {
  documentId: string;
  kind: ChangeKind;
  fromVersion?: number;
  toVersion: number;
  changedFields: readonly string[];
  summary: string;
  evidence: readonly EvidenceLink[];
}

export interface ForecastSignal {
  id: string;
  level: SignalLevel;
  topic: string;
  statement: string;
  confidence: number;
  horizonMonths: readonly [number, number];
  supportingEvidence: readonly EvidenceLink[];
  falsificationCriteria: readonly string[];
}

export interface ProjectProfile {
  id: string;
  region: string;
  applicantType: string;
  sectors: readonly string[];
  objectives: readonly string[];
  plannedCosts: readonly string[];
  availableCofinancingPercent?: number;
  requestedAmount?: number;
}

export interface Recommendation {
  measureId: string;
  projectId: string;
  fitScore: number;
  status: "eligible" | "potentially-eligible" | "blocked";
  matchedSectors: readonly string[];
  matchedObjectives: readonly string[];
  matchedCosts: readonly string[];
  blockers: readonly string[];
  uncertainty: readonly string[];
  evidence: readonly EvidenceLink[];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hashSnapshot(snapshot: OfficialDocumentSnapshot): string {
  return createHash("sha256")
    .update(JSON.stringify({
      authority: snapshot.authority,
      title: snapshot.title,
      documentType: snapshot.documentType,
      jurisdiction: snapshot.jurisdiction,
      publishedAt: snapshot.publishedAt,
      effectiveFrom: snapshot.effectiveFrom ?? null,
      sourceUrl: snapshot.sourceUrl,
      text: normalizeText(snapshot.text),
      metadata: snapshot.metadata ?? null
    }))
    .digest("hex");
}

export class DocumentVersionStore {
  readonly #versions = new Map<string, DocumentVersion[]>();

  put(snapshot: OfficialDocumentSnapshot): DocumentVersion {
    validateOfficialSnapshot(snapshot);
    const contentHash = hashSnapshot(snapshot);
    const current = this.#versions.get(snapshot.id) ?? [];
    const duplicate = current.find((item) => item.contentHash === contentHash);
    if (duplicate) return structuredClone(duplicate);

    const version: DocumentVersion = {
      documentId: snapshot.id,
      contentHash,
      version: current.length + 1,
      snapshot: structuredClone(snapshot)
    };
    this.#versions.set(snapshot.id, [...current, version]);
    return structuredClone(version);
  }

  list(documentId: string): readonly DocumentVersion[] {
    return structuredClone(this.#versions.get(documentId) ?? []);
  }
}

export function validateOfficialSnapshot(snapshot: OfficialDocumentSnapshot): void {
  if (!snapshot.id.trim()) throw new Error("Document id is required");
  if (!snapshot.authority.trim()) throw new Error("Document authority is required");
  if (!snapshot.title.trim()) throw new Error("Document title is required");
  if (!snapshot.sourceUrl.startsWith("https://")) throw new Error("Official document source must use HTTPS");
  if (normalizeText(snapshot.text).length < 40) throw new Error("Official document text is too short");
  if (!Number.isFinite(Date.parse(snapshot.capturedAt))) throw new Error("capturedAt is invalid");
}

function evidenceFor(snapshot: OfficialDocumentSnapshot, quote: string, locator?: string): EvidenceLink {
  const normalizedQuote = normalizeText(quote);
  return {
    id: createHash("sha256").update(`${snapshot.id}:${normalizedQuote}`).digest("hex").slice(0, 24),
    documentId: snapshot.id,
    sourceUrl: snapshot.sourceUrl,
    quote: normalizedQuote,
    status: "verified",
    capturedAt: snapshot.capturedAt,
    ...(locator ? { locator } : {})
  };
}

function fieldChanged(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

export function detectMaterialChange(
  previous: DocumentVersion | undefined,
  current: DocumentVersion,
  previousMeasure: SupportMeasure | undefined,
  currentMeasure: SupportMeasure
): MaterialChange {
  if (!previous || !previousMeasure) {
    return {
      documentId: current.documentId,
      kind: "created",
      toVersion: current.version,
      changedFields: ["measure"],
      summary: `Support measure created: ${currentMeasure.title}`,
      evidence: currentMeasure.evidence
    };
  }

  const fields: Array<keyof SupportMeasure> = [
    "title", "instrument", "jurisdiction", "sectors", "applicantTypes", "objectives",
    "eligibleCosts", "maxAmount", "cofinancingPercent", "validFrom", "validTo", "conditions", "exclusions"
  ];
  const changedFields = fields.filter((field) => fieldChanged(previousMeasure[field], currentMeasure[field]));
  const unchanged = previous.contentHash === current.contentHash && changedFields.length === 0;

  return {
    documentId: current.documentId,
    kind: unchanged ? "unchanged" : "updated",
    fromVersion: previous.version,
    toVersion: current.version,
    changedFields,
    summary: unchanged
      ? `No material change detected for ${currentMeasure.title}`
      : `Material change detected in ${currentMeasure.title}: ${changedFields.join(", ")}`,
    evidence: currentMeasure.evidence
  };
}

export interface MeasureExtractionInput {
  snapshot: OfficialDocumentSnapshot;
  id: string;
  title: string;
  instrument: SupportInstrument;
  sectors: readonly string[];
  applicantTypes: readonly string[];
  objectives: readonly string[];
  eligibleCosts: readonly string[];
  conditions: readonly string[];
  exclusions?: readonly string[];
  maxAmount?: number;
  cofinancingPercent?: number;
  validFrom?: string;
  validTo?: string;
  quote: string;
  locator?: string;
}

export function buildSupportMeasure(input: MeasureExtractionInput): SupportMeasure {
  const evidence = [evidenceFor(input.snapshot, input.quote, input.locator)];
  if (!normalizeText(input.snapshot.text).includes(normalizeText(input.quote))) {
    throw new Error("Evidence quote is not grounded in the official snapshot");
  }
  if (input.maxAmount !== undefined && input.maxAmount <= 0) throw new Error("maxAmount must be positive");
  if (input.cofinancingPercent !== undefined && (input.cofinancingPercent < 0 || input.cofinancingPercent > 100)) {
    throw new Error("cofinancingPercent must be between 0 and 100");
  }

  return {
    id: input.id,
    title: input.title,
    authority: input.snapshot.authority,
    instrument: input.instrument,
    jurisdiction: input.snapshot.jurisdiction,
    sectors: [...input.sectors],
    applicantTypes: [...input.applicantTypes],
    objectives: [...input.objectives],
    eligibleCosts: [...input.eligibleCosts],
    ...(input.maxAmount !== undefined ? { maxAmount: input.maxAmount } : {}),
    ...(input.cofinancingPercent !== undefined ? { cofinancingPercent: input.cofinancingPercent } : {}),
    ...(input.validFrom ? { validFrom: input.validFrom } : {}),
    ...(input.validTo ? { validTo: input.validTo } : {}),
    evidence,
    conditions: [...input.conditions],
    exclusions: [...(input.exclusions ?? [])]
  };
}

export function deriveForecastSignals(
  measure: SupportMeasure,
  change: MaterialChange
): readonly ForecastSignal[] {
  if (change.kind === "unchanged") return [];
  const signals: ForecastSignal[] = [];
  const evidence = measure.evidence;

  signals.push({
    id: `${measure.id}:observed:${change.toVersion}`,
    level: "observation",
    topic: measure.sectors[0] ?? "general-support",
    statement: change.summary,
    confidence: 1,
    horizonMonths: [0, 0],
    supportingEvidence: evidence,
    falsificationCriteria: []
  });

  if (change.changedFields.some((field) => ["maxAmount", "eligibleCosts", "objectives", "validTo"].includes(field))) {
    signals.push({
      id: `${measure.id}:interpretation:${change.toVersion}`,
      level: "interpretation",
      topic: measure.sectors[0] ?? "general-support",
      statement: "The authority is materially adjusting the support instrument, which may indicate reprioritization within the current program cycle.",
      confidence: 0.65,
      horizonMonths: [0, 12],
      supportingEvidence: evidence,
      falsificationCriteria: [
        "The revised document is cancelled or superseded before taking effect.",
        "Budget allocations or competition rules do not reflect the documented change."
      ]
    });
  }

  if (change.changedFields.includes("objectives") && change.changedFields.includes("eligibleCosts")) {
    signals.push({
      id: `${measure.id}:hypothesis:${change.toVersion}`,
      level: "hypothesis",
      topic: measure.sectors[0] ?? "general-support",
      statement: "Projects aligned with the newly added objective and cost categories may receive stronger support attention in the next 6–24 months.",
      confidence: 0.45,
      horizonMonths: [6, 24],
      supportingEvidence: evidence,
      falsificationCriteria: [
        "No matching budget, procurement, competition or implementation guidance appears within 12 months.",
        "Subsequent official documents remove the new objective or cost categories."
      ]
    });
  }

  return signals;
}

function intersection(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right.map((item) => item.toLowerCase()));
  return left.filter((item) => rightSet.has(item.toLowerCase()));
}

export function recommendSupportMeasure(measure: SupportMeasure, project: ProjectProfile): Recommendation {
  const matchedSectors = intersection(project.sectors, measure.sectors);
  const matchedObjectives = intersection(project.objectives, measure.objectives);
  const matchedCosts = intersection(project.plannedCosts, measure.eligibleCosts);
  const blockers: string[] = [];
  const uncertainty: string[] = [];

  if (measure.jurisdiction !== "federal" && measure.jurisdiction !== project.region) {
    blockers.push(`Measure jurisdiction ${measure.jurisdiction} does not match project region ${project.region}`);
  }
  if (!measure.applicantTypes.includes(project.applicantType)) {
    blockers.push(`Applicant type ${project.applicantType} is not listed as eligible`);
  }
  if (measure.maxAmount !== undefined && project.requestedAmount !== undefined && project.requestedAmount > measure.maxAmount) {
    blockers.push(`Requested amount exceeds maximum by ${project.requestedAmount - measure.maxAmount}`);
  }
  if (
    measure.cofinancingPercent !== undefined &&
    (project.availableCofinancingPercent ?? 0) < measure.cofinancingPercent
  ) {
    blockers.push(`Available cofinancing is below required ${measure.cofinancingPercent}%`);
  }
  if (matchedSectors.length === 0) uncertainty.push("No exact sector match was found");
  if (matchedObjectives.length === 0) uncertainty.push("No exact objective match was found");
  if (matchedCosts.length === 0) uncertainty.push("No planned cost is explicitly listed as eligible");
  uncertainty.push("Final eligibility requires checking the current competition rules and applicant documents");

  const fitScore = Math.max(0, Math.min(100,
    matchedSectors.length * 25 +
    matchedObjectives.length * 20 +
    matchedCosts.length * 15 +
    (blockers.length === 0 ? 20 : 0) -
    blockers.length * 20
  ));

  return {
    measureId: measure.id,
    projectId: project.id,
    fitScore,
    status: blockers.length > 0 ? "blocked" : uncertainty.length > 1 ? "potentially-eligible" : "eligible",
    matchedSectors,
    matchedObjectives,
    matchedCosts,
    blockers,
    uncertainty,
    evidence: measure.evidence
  };
}

export interface GovernmentSupportIntelligenceResult {
  previousVersion?: DocumentVersion;
  currentVersion: DocumentVersion;
  change: MaterialChange;
  signals: readonly ForecastSignal[];
  recommendation: Recommendation;
}

export function runGovernmentSupportIntelligenceSlice(input: {
  store: DocumentVersionStore;
  previousSnapshot?: OfficialDocumentSnapshot;
  currentSnapshot: OfficialDocumentSnapshot;
  previousMeasure?: SupportMeasure;
  currentMeasure: SupportMeasure;
  project: ProjectProfile;
}): GovernmentSupportIntelligenceResult {
  const previousVersion = input.previousSnapshot ? input.store.put(input.previousSnapshot) : undefined;
  const currentVersion = input.store.put(input.currentSnapshot);
  const change = detectMaterialChange(previousVersion, currentVersion, input.previousMeasure, input.currentMeasure);
  const signals = deriveForecastSignals(input.currentMeasure, change);
  const recommendation = recommendSupportMeasure(input.currentMeasure, input.project);
  return {
    ...(previousVersion ? { previousVersion } : {}),
    currentVersion,
    change,
    signals,
    recommendation
  };
}
