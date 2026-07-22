import {
  ENGINE_VERSION,
  type IntelligenceContext,
  type RuntimeClaim,
  type RuntimeRelation,
  asRecord,
  asRecords,
  asStrings,
  normalizeKey,
  text,
} from "./types.ts";

function key(type: string, value: string): string {
  return `${type}:${normalizeKey(value)}`;
}

export function buildRelations(context: IntelligenceContext, claims: RuntimeClaim[]): RuntimeRelation[] {
  const relations: RuntimeRelation[] = [];
  const claimByMeasureId = new Map<string, RuntimeClaim>();
  for (const claim of claims) {
    const measureId = text(claim.canonicalPayload.measureId);
    if (measureId) claimByMeasureId.set(measureId, claim);
  }

  for (const measure of asRecords(context.report.measure_matches)) {
    const measureId = text(measure.measure_id);
    const title = text(measure.title);
    if (!title) continue;
    const claim = claimByMeasureId.get(measureId);
    const provenance = {
      projectId: context.projectId,
      ...(context.projectCheckId ? { projectCheckId: context.projectCheckId } : {}),
      ...(claim?.sourceId ? { sourceId: claim.sourceId } : {}),
      ...(claim?.sourceSnapshotId ? { sourceSnapshotId: claim.sourceSnapshotId } : {}),
      ...(claim?.evidenceId ? { evidenceId: claim.evidenceId } : {}),
      confidence: claim?.confidence ?? 0.65,
      epistemicStatus: "inferred" as const,
      truthStatus: claim?.truthStatus ?? "unverified" as const,
      engineVersion: ENGINE_VERSION,
      canSupportEligibility: false as const,
    };
    const measureKey = key("support_measure", title);

    for (const authority of text(measure.authority).split(/\s*\/\s*|\s*;\s*/).filter(Boolean)) {
      relations.push({ ...provenance, subjectKey: key("authority", authority), predicate: "manages", objectKey: measureKey });
    }

    for (const territory of text(measure.measure_region).split(/\s*;\s*/).filter(Boolean)) {
      relations.push({ ...provenance, subjectKey: measureKey, predicate: "applies_in", objectKey: key("territory", territory) });
    }

    for (const requirement of asRecords(measure.requirement_matrix)) {
      const type = text(requirement.type);
      const label = text(requirement.label);
      const expected = requirement.expected;
      if (type === "applicant_type") {
        for (const applicant of asStrings(expected)) {
          relations.push({ ...provenance, subjectKey: measureKey, predicate: "intended_for", objectValue: applicant });
        }
      } else if (type === "territory") {
        for (const territory of asStrings(expected)) {
          relations.push({ ...provenance, subjectKey: measureKey, predicate: "territorial_scope", objectKey: key("territory", territory) });
        }
      } else if (type === "primary_evidence") {
        const actual = asRecord(requirement.actual);
        relations.push({
          ...provenance,
          subjectKey: measureKey,
          predicate: "requires_primary_evidence",
          objectValue: {
            label,
            sourceDocumentId: text(actual.source_document_id) || null,
            evidenceStatus: text(requirement.evidence_status),
          },
        });
      } else if (label) {
        relations.push({ ...provenance, subjectKey: measureKey, predicate: "has_requirement", objectValue: { type, label, expected } });
      }
    }
  }

  return relations;
}
