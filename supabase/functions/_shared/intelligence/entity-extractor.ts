import {
  ENGINE_VERSION,
  type IntelligenceContext,
  type JsonRecord,
  type RuntimeEntity,
  asRecord,
  asRecords,
  boundedConfidence,
  normalizeKey,
  text,
} from "./types.ts";

interface EntityInput {
  type: string;
  name: string;
  confidence?: number;
  attributes?: JsonRecord;
  sourceId?: string;
  sourceSnapshotId?: string;
  evidenceId?: string;
  epistemicStatus?: "observed" | "inferred";
  truthStatus?: "unverified" | "manual_review" | "verified";
}

export function extractEntities(context: IntelligenceContext): RuntimeEntity[] {
  const entities = new Map<string, RuntimeEntity>();
  const report = context.report;
  const summary = asRecord(report.executive_summary);
  const sources = asRecords(report.sources);
  const sourceIdByName = new Map<string, string>();

  for (const source of sources) {
    const id = text(source.id);
    for (const candidate of [text(source.name), text(source.authority), text(source.source_key)]) {
      if (id && candidate) sourceIdByName.set(normalizeKey(candidate), id);
    }
  }

  const add = (input: EntityInput) => {
    const canonicalName = input.name.trim();
    if (!canonicalName) return;
    const key = `${input.type}:${normalizeKey(canonicalName)}`;
    if (!key.endsWith(":")) {
      const previous = entities.get(key);
      const aliases = Array.from(new Set([...(previous?.aliases ?? []), canonicalName]));
      entities.set(key, {
        projectId: context.projectId,
        ...(context.projectCheckId ? { projectCheckId: context.projectCheckId } : {}),
        ...(input.sourceId ? { sourceId: input.sourceId } : {}),
        ...(input.sourceSnapshotId ? { sourceSnapshotId: input.sourceSnapshotId } : {}),
        ...(input.evidenceId ? { evidenceId: input.evidenceId } : {}),
        key,
        type: input.type,
        canonicalName: previous?.canonicalName ?? canonicalName,
        aliases,
        attributes: { ...(previous?.attributes ?? {}), ...(input.attributes ?? {}) },
        confidence: Math.max(previous?.confidence ?? 0, boundedConfidence(input.confidence, 0.75)),
        epistemicStatus: input.epistemicStatus ?? "observed",
        truthStatus: input.truthStatus ?? "unverified",
        engineVersion: ENGINE_VERSION,
      });
    }
  };

  add({ type: "project", name: text(summary.title) || context.projectId, confidence: 1, truthStatus: "verified" });
  add({ type: "territory", name: text(summary.region), confidence: 1, truthStatus: "verified" });

  const legalForm = text(summary.legal_form);
  if (legalForm) add({ type: "other", name: legalForm, confidence: 1, attributes: { role: "applicant_type" }, truthStatus: "verified" });

  for (const measure of asRecords(report.measure_matches)) {
    const titleValue = text(measure.title);
    add({
      type: "support_measure",
      name: titleValue,
      confidence: boundedConfidence(measure.confidence, 0.65),
      attributes: {
        measureId: text(measure.measure_id),
        measureType: text(measure.measure_type),
        eligibilityStatus: text(measure.eligibility_status),
        officialUrl: text(measure.official_url),
      },
      epistemicStatus: "observed",
      truthStatus: text(measure.verdict_level) === "verified_match" ? "verified" : "manual_review",
    });

    const authority = text(measure.authority);
    for (const authorityPart of authority.split(/\s*\/\s*|\s*;\s*/).filter(Boolean)) {
      add({
        type: "authority",
        name: authorityPart,
        confidence: 0.9,
        sourceId: sourceIdByName.get(normalizeKey(authorityPart)),
      });
    }

    const measureRegion = text(measure.measure_region);
    for (const region of measureRegion.split(/\s*;\s*/).filter(Boolean)) {
      add({ type: "territory", name: region, confidence: 0.95 });
    }
  }

  for (const change of asRecords(report.source_changes)) {
    const sourceName = text(change.source_name);
    const authority = text(change.authority);
    const sourceId = sourceIdByName.get(normalizeKey(sourceName)) ?? sourceIdByName.get(normalizeKey(authority));
    add({ type: "organization", name: sourceName, confidence: 0.9, sourceId });
    add({ type: "authority", name: authority, confidence: 0.9, sourceId });
    add({
      type: "legal_document",
      name: text(change.document_title),
      confidence: 0.75,
      sourceId,
      attributes: { url: text(change.document_url), changeType: text(change.change_type) },
      epistemicStatus: "observed",
    });
  }

  const serialized = JSON.stringify(report);
  const legalDocumentPattern = /(?:приказ|постановление|распоряжение|федеральный закон|закон)\s+[^\n,.]{0,90}?№\s*[A-Za-zА-Яа-я0-9-]+/gi;
  const moneyPattern = /\b\d[\d\s]*(?:[.,]\d+)?\s*(?:тыс\.?|млн|млрд)?\s*(?:руб(?:лей|ля|ль|\.)?|₽)\b/gi;
  const datePattern = /\b(?:\d{1,2}[./-]\d{1,2}[./-](?:19|20)\d{2}|(?:19|20)\d{2}\s*(?:год(?:а|у)?|г\.?))\b/gi;

  for (const match of serialized.match(legalDocumentPattern) ?? []) add({ type: "legal_document", name: match, confidence: 0.8 });
  for (const match of serialized.match(moneyPattern) ?? []) add({ type: "money", name: match, confidence: 0.9 });
  for (const match of serialized.match(datePattern) ?? []) add({ type: "date", name: match, confidence: 0.9 });

  return Array.from(entities.values());
}
