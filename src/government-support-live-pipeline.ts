import { createHash } from "node:crypto";
import {
  recommendSupportMeasure,
  type EvidenceLink,
  type OfficialDocumentSnapshot,
  type ProjectProfile,
  type Recommendation,
  type SupportInstrument,
  type SupportMeasure
} from "./government-support-intelligence.js";

export interface OfficialSourceDefinition {
  readonly id: string;
  readonly authority: string;
  readonly title: string;
  readonly canonicalUrl: string;
  readonly allowedHosts: readonly string[];
  readonly jurisdiction: string;
  readonly documentType: OfficialDocumentSnapshot["documentType"];
  readonly publishedAt: string;
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly allowedContentTypes: readonly string[];
}

export const AGRITOURISM_COSTS_2026_SOURCE: OfficialSourceDefinition = {
  id: "ru:minselkhoz:order-88:2026",
  authority: "Министерство сельского хозяйства Российской Федерации",
  title: "Приказ Минсельхоза России от 17.02.2026 № 88 о перечнях затрат по гранту Агротуризм",
  canonicalUrl: "https://publication.pravo.gov.ru/document/0001202603250013",
  allowedHosts: ["publication.pravo.gov.ru"],
  jurisdiction: "federal",
  documentType: "order",
  publishedAt: "2026-03-25T00:00:00.000Z",
  maxBytes: 2_000_000,
  timeoutMs: 15_000,
  allowedContentTypes: ["application/pdf", "text/html"]
};

export interface FetchArtifact {
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly status: number;
  readonly contentType: string;
  readonly rawBytes: Uint8Array;
  readonly normalizedText: string;
  readonly capturedAt: string;
}

export interface BoundedOfficialFetcher {
  fetch(source: OfficialSourceDefinition): Promise<FetchArtifact>;
}

export interface ExtractionFieldEvidence {
  readonly fieldPath: string;
  readonly fieldValue: unknown;
  readonly quote: string;
  readonly charStart: number;
  readonly charEnd: number;
  readonly confidence?: number;
}

export interface StructuredMeasureProposal {
  readonly measure: {
    readonly id: string;
    readonly title: string;
    readonly instrument: SupportInstrument;
    readonly sectors: readonly string[];
    readonly applicantTypes: readonly string[];
    readonly objectives: readonly string[];
    readonly eligibleCosts: readonly string[];
    readonly maxAmount?: number;
    readonly cofinancingPercent?: number;
    readonly validFrom?: string;
    readonly validTo?: string;
    readonly conditions: readonly string[];
    readonly exclusions: readonly string[];
  };
  readonly evidence: readonly ExtractionFieldEvidence[];
}

export interface StructuredExtractionResult {
  readonly model: string;
  readonly schemaVersion: string;
  readonly promptHash: string;
  readonly rawResponse: unknown;
  readonly proposal: StructuredMeasureProposal;
}

export interface OpenAIStructuredExtractionAdapter {
  extract(snapshot: OfficialDocumentSnapshot): Promise<StructuredExtractionResult>;
}

export interface VerifiedFieldEvidence extends ExtractionFieldEvidence {
  readonly verified: true;
  readonly quoteHash: string;
  readonly snapshotHash: string;
}

export interface RejectedFieldEvidence extends ExtractionFieldEvidence {
  readonly verified: false;
  readonly reason: "offset-mismatch" | "quote-not-found" | "ambiguous-quote" | "invalid-confidence";
}

export interface ExtractionProvenance {
  readonly model: string;
  readonly schemaVersion: string;
  readonly promptHash: string;
  readonly rawResponseHash: string;
  readonly snapshotHash: string;
  readonly normalizedTextHash: string;
}

export interface LivePipelineResult {
  readonly source: OfficialSourceDefinition;
  readonly snapshot: OfficialDocumentSnapshot;
  readonly provenance: ExtractionProvenance;
  readonly measure: SupportMeasure;
  readonly verifiedEvidence: readonly VerifiedFieldEvidence[];
  readonly rejectedEvidence: readonly RejectedFieldEvidence[];
  readonly recommendation: Recommendation;
  readonly publishable: boolean;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function isIpLiteral(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname) || hostname.includes(":");
}

export function validateOfficialSourceTarget(source: OfficialSourceDefinition, target: string): URL {
  const url = new URL(target);
  if (url.protocol !== "https:") throw new Error("Official source must use HTTPS");
  if (url.username || url.password) throw new Error("Credentials are forbidden in source URLs");
  if (url.port && url.port !== "443") throw new Error("Non-standard source ports are forbidden");
  if (isIpLiteral(url.hostname)) throw new Error("IP-literal source hosts are forbidden");
  if (!source.allowedHosts.includes(url.hostname)) throw new Error(`Source host ${url.hostname} is not allowlisted`);
  return url;
}

export function captureOfficialSnapshot(source: OfficialSourceDefinition, artifact: FetchArtifact): OfficialDocumentSnapshot {
  validateOfficialSourceTarget(source, artifact.requestedUrl);
  validateOfficialSourceTarget(source, artifact.finalUrl);
  if (artifact.status < 200 || artifact.status >= 300) throw new Error(`Official source returned HTTP ${artifact.status}`);
  if (artifact.rawBytes.byteLength > source.maxBytes) throw new Error("Official source response exceeds size limit");
  if (!source.allowedContentTypes.includes(artifact.contentType)) throw new Error(`Unsupported content type ${artifact.contentType}`);
  const text = normalizeText(artifact.normalizedText);
  if (text.length < 80) throw new Error("Normalized official document text is too short");
  return {
    id: source.id,
    authority: source.authority,
    title: source.title,
    documentType: source.documentType,
    jurisdiction: source.jurisdiction,
    publishedAt: source.publishedAt,
    sourceUrl: artifact.finalUrl,
    capturedAt: artifact.capturedAt,
    text,
    metadata: {
      rawSha256: sha256(artifact.rawBytes),
      normalizedTextSha256: sha256(text),
      contentType: artifact.contentType,
      sourceRegistryId: source.id
    }
  };
}

function validConfidence(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value >= 0 && value <= 1);
}

export function validateFieldEvidence(
  snapshot: OfficialDocumentSnapshot,
  evidence: readonly ExtractionFieldEvidence[]
): { verified: readonly VerifiedFieldEvidence[]; rejected: readonly RejectedFieldEvidence[] } {
  const verified: VerifiedFieldEvidence[] = [];
  const rejected: RejectedFieldEvidence[] = [];
  const snapshotHash = sha256(snapshot.text);
  for (const item of evidence) {
    if (!validConfidence(item.confidence)) {
      rejected.push({ ...item, verified: false, reason: "invalid-confidence" });
      continue;
    }
    if (snapshot.text.slice(item.charStart, item.charEnd) === item.quote) {
      verified.push({ ...item, verified: true, quoteHash: sha256(item.quote), snapshotHash });
      continue;
    }
    const first = snapshot.text.indexOf(item.quote);
    if (first < 0) {
      rejected.push({ ...item, verified: false, reason: "quote-not-found" });
      continue;
    }
    if (snapshot.text.indexOf(item.quote, first + 1) >= 0) {
      rejected.push({ ...item, verified: false, reason: "ambiguous-quote" });
      continue;
    }
    verified.push({
      ...item,
      charStart: first,
      charEnd: first + item.quote.length,
      verified: true,
      quoteHash: sha256(item.quote),
      snapshotHash
    });
  }
  return { verified, rejected };
}

function evidenceLinks(snapshot: OfficialDocumentSnapshot, evidence: readonly VerifiedFieldEvidence[]): EvidenceLink[] {
  return evidence.map((item) => ({
    id: sha256(`${snapshot.id}:${item.fieldPath}:${item.quote}`).slice(0, 24),
    documentId: snapshot.id,
    sourceUrl: snapshot.sourceUrl,
    quote: item.quote,
    status: "verified",
    capturedAt: snapshot.capturedAt,
    locator: `chars:${item.charStart}-${item.charEnd};field:${item.fieldPath}`
  }));
}

function groundedPaths(proposal: StructuredMeasureProposal, verified: readonly VerifiedFieldEvidence[]): Set<string> {
  const grounded = new Set(verified.map((item) => item.fieldPath));
  const required = ["measure.title", "measure.instrument", "measure.applicantTypes", "measure.eligibleCosts"];
  const missing = required.filter((field) => !grounded.has(field));
  if (missing.length > 0) throw new Error(`Required measure fields lack verified evidence: ${missing.join(", ")}`);
  if (!proposal.measure.id.trim()) throw new Error("Measure id is required");
  return grounded;
}

export async function runLiveGovernmentSupportPipeline(input: {
  readonly source: OfficialSourceDefinition;
  readonly fetcher: BoundedOfficialFetcher;
  readonly extractor: OpenAIStructuredExtractionAdapter;
  readonly project: ProjectProfile;
}): Promise<LivePipelineResult> {
  const artifact = await input.fetcher.fetch(input.source);
  const snapshot = captureOfficialSnapshot(input.source, artifact);
  const extraction = await input.extractor.extract(snapshot);
  const { verified, rejected } = validateFieldEvidence(snapshot, extraction.proposal.evidence);
  const grounded = groundedPaths(extraction.proposal, verified);
  const proposed = extraction.proposal.measure;
  const measure: SupportMeasure = {
    id: proposed.id,
    title: proposed.title,
    authority: snapshot.authority,
    instrument: proposed.instrument,
    jurisdiction: snapshot.jurisdiction,
    sectors: grounded.has("measure.sectors") ? [...proposed.sectors] : [],
    applicantTypes: [...proposed.applicantTypes],
    objectives: grounded.has("measure.objectives") ? [...proposed.objectives] : [],
    eligibleCosts: [...proposed.eligibleCosts],
    ...(grounded.has("measure.maxAmount") && proposed.maxAmount !== undefined ? { maxAmount: proposed.maxAmount } : {}),
    ...(grounded.has("measure.cofinancingPercent") && proposed.cofinancingPercent !== undefined
      ? { cofinancingPercent: proposed.cofinancingPercent }
      : {}),
    ...(grounded.has("measure.validFrom") && proposed.validFrom ? { validFrom: proposed.validFrom } : {}),
    ...(grounded.has("measure.validTo") && proposed.validTo ? { validTo: proposed.validTo } : {}),
    conditions: grounded.has("measure.conditions") ? [...proposed.conditions] : [],
    exclusions: grounded.has("measure.exclusions") ? [...proposed.exclusions] : [],
    evidence: evidenceLinks(snapshot, verified)
  };
  const normalizedTextHash = sha256(snapshot.text);
  const provenance: ExtractionProvenance = {
    model: extraction.model,
    schemaVersion: extraction.schemaVersion,
    promptHash: extraction.promptHash,
    rawResponseHash: sha256(JSON.stringify(extraction.rawResponse)),
    snapshotHash: String(snapshot.metadata?.rawSha256 ?? normalizedTextHash),
    normalizedTextHash
  };
  const recommendation = recommendSupportMeasure(measure, input.project);
  return {
    source: input.source,
    snapshot,
    provenance,
    measure,
    verifiedEvidence: verified,
    rejectedEvidence: rejected,
    recommendation,
    publishable: rejected.length === 0 && measure.evidence.length > 0
  };
}
