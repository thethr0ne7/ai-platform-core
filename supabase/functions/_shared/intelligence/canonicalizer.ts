import {
  ENGINE_VERSION,
  type IntelligenceContext,
  type RuntimeClaim,
  asRecord,
  asRecords,
  asStrings,
  boundedConfidence,
  normalizeKey,
  text,
} from "./types.ts";

function entityKey(type: string, name: string): string {
  return `${type}:${normalizeKey(name)}`;
}

export function buildCanonicalClaims(context: IntelligenceContext): RuntimeClaim[] {
  const report = context.report;
  const summary = asRecord(report.executive_summary);
  const projectRegion = text(summary.region);
  const claims: RuntimeClaim[] = [];

  for (const measure of asRecords(report.measure_matches)) {
    const authorityNames = text(measure.authority).split(/\s*\/\s*|\s*;\s*/).filter(Boolean);
    const requirements = asRecords(measure.requirement_matrix);
    const evidenceScope = asRecord(measure.evidence_scope);
    const evidenceIds = Array.from(new Set(requirements.flatMap((requirement) => {
      const actual = asRecord(requirement.actual);
      return [text(requirement.evidence_id), text(actual.evidence_id)].filter(Boolean);
    })));
    const fullyVerifiedMatch =
      text(measure.eligibility_status) === "match" &&
      text(measure.verdict_level) === "verified_match" &&
      evidenceScope.fully_verified === true &&
      Number(evidenceScope.required_rules ?? 0) > 0 &&
      Number(evidenceScope.verified_rules ?? 0) === Number(evidenceScope.required_rules ?? 0) &&
      evidenceIds.length > 0;
    const truthStatus = fullyVerifiedMatch ? "verified" : "manual_review";
    const measureRegion = text(measure.measure_region) || projectRegion;
    const territoryNames = measureRegion.split(/\s*;\s*/).filter(Boolean);
    const applicantRequirement = requirements.find((item) => text(item.type) === "applicant_type");
    const applicantExpected = applicantRequirement ? asStrings(applicantRequirement.expected) : [];
    const control = requirements.map((item) => text(item.label)).filter(Boolean);
    const effectiveDates = [
      text(measure.application_start) ? { start: text(measure.application_start), label: "application_window" } : null,
      text(measure.application_end) ? { end: text(measure.application_end), label: "application_window" } : null,
    ].filter((value): value is Record<string, string> => value !== null);

    const sourceEvidenceId = evidenceIds[0];
    claims.push({
      projectId: context.projectId,
      ...(context.projectCheckId ? { projectCheckId: context.projectCheckId } : {}),
      ...(sourceEvidenceId ? { evidenceId: sourceEvidenceId } : {}),
      claimType: "support_measure_canonical_form",
      actorKeys: authorityNames.map((name) => entityKey("authority", name)),
      intent: [text(measure.title)].filter(Boolean),
      mechanism: [text(measure.measure_type), text(measure.status)].filter(Boolean),
      resource: [
        ...(measure.max_amount != null ? [{ kind: "money", value: measure.max_amount }] : []),
        ...asStrings(measure.allowed_expenses).map((value) => ({ kind: "expense", value })),
      ],
      control,
      expectedOutcome: applicantExpected.length > 0
        ? [`Поддержка предоставляется допустимым типам заявителей: ${applicantExpected.join(", ")}`]
        : [],
      territoryKeys: territoryNames.map((name) => entityKey("territory", name)),
      effectiveDates,
      canonicalPayload: {
        measureId: text(measure.measure_id),
        title: text(measure.title),
        authority: authorityNames,
        intent: [text(measure.title)].filter(Boolean),
        mechanism: [text(measure.measure_type)].filter(Boolean),
        resource: {
          maxAmount: measure.max_amount ?? null,
          cofinancingPercent: measure.cofinancing_percent ?? null,
        },
        control,
        expectedOutcome: applicantExpected,
        territory: territoryNames,
        effectiveDates,
        eligibilityStatus: text(measure.eligibility_status),
        verdictLevel: text(measure.verdict_level),
        evidenceScope,
      },
      confidence: boundedConfidence(measure.confidence, 0.6),
      epistemicStatus: "observed",
      truthStatus,
      engineVersion: ENGINE_VERSION,
      canSupportEligibility: fullyVerifiedMatch,
    });
  }

  return claims;
}
