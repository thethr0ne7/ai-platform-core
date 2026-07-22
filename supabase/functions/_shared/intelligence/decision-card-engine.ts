import {
  ENGINE_VERSION,
  type IntelligenceContext,
  type RuntimeDecisionCard,
  type RuntimeForecast,
  asRecord,
  asRecords,
  asStrings,
  boundedConfidence,
  normalizeKey,
  text,
} from "./types.ts";

function eligibilityStatus(value: unknown): RuntimeDecisionCard["eligibilityStatus"] {
  const status = text(value);
  if (status === "match" || status === "mismatch" || status === "manual_review") return status;
  return "insufficient_data";
}

function sourceIdForAuthority(report: Record<string, unknown>, authority: string): string | undefined {
  const normalized = normalizeKey(authority);
  if (!normalized) return undefined;
  for (const source of asRecords(report.sources)) {
    const candidates = [text(source.name), text(source.authority), text(source.source_key)].map(normalizeKey);
    if (candidates.some((candidate) => candidate && (candidate.includes(normalized) || normalized.includes(candidate)))) {
      const id = text(source.id);
      if (id) return id;
    }
  }
  return undefined;
}

export function buildDecisionCards(
  context: IntelligenceContext,
  forecasts: RuntimeForecast[],
): RuntimeDecisionCard[] {
  const cards: RuntimeDecisionCard[] = [];

  for (const measure of asRecords(context.report.measure_matches)) {
    const requirements = asRecords(measure.requirement_matrix);
    const evidenceScope = asRecord(measure.evidence_scope);
    const verifiedRequirementCount = Number(evidenceScope.verified_rules ?? 0) || 0;
    const verifiedEvidence = requirements.filter((requirement) => {
      const evidenceId = text(requirement.evidence_id) || text(asRecord(requirement.actual).evidence_id);
      return text(requirement.evidence_status) === "verified" && Boolean(evidenceId);
    });
    const verifiedEvidenceCount = verifiedEvidence.length;
    const evidenceId = verifiedEvidence
      .map((requirement) => text(requirement.evidence_id) || text(asRecord(requirement.actual).evidence_id))
      .find(Boolean);
    const status = eligibilityStatus(measure.eligibility_status);
    const truthGatePassed =
      status === "match" &&
      text(measure.verdict_level) === "verified_match" &&
      evidenceScope.fully_verified === true &&
      verifiedRequirementCount > 0 &&
      verifiedEvidenceCount > 0 &&
      Boolean(evidenceId);
    const title = text(measure.title) || "Мера поддержки";
    const blockers = asStrings(measure.blockers);
    const missingData = asStrings(measure.missing_data);
    const firstGap = blockers[0] ?? missingData[0];
    const sourceId = sourceIdForAuthority(context.report, text(measure.authority));
    const forecast = forecasts[0];

    let decision = `Провести ручную проверку меры «${title}».`;
    if (truthGatePassed) decision = `Подготовить проект к подаче по мере «${title}».`;
    else if (status === "mismatch") decision = `Не использовать меру «${title}» в текущей конфигурации проекта.`;

    cards.push({
      projectId: context.projectId,
      ...(context.projectCheckId ? { projectCheckId: context.projectCheckId } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(evidenceId ? { evidenceId } : {}),
      ...(text(measure.measure_id) ? { measureId: text(measure.measure_id) } : {}),
      decision,
      legalBasis: [{
        authority: text(measure.authority),
        officialUrl: text(measure.official_url),
        sourceLocator: requirements.map((requirement) => text(requirement.source_locator)).filter(Boolean),
        evidenceId: evidenceId ?? null,
        evidenceStatus: truthGatePassed ? "verified" : "manual_review",
      }],
      confirmedConditions: requirements
        .filter((requirement) => {
          const requirementEvidenceId = text(requirement.evidence_id) || text(asRecord(requirement.actual).evidence_id);
          return text(requirement.status) === "matched" && text(requirement.evidence_status) === "verified" && Boolean(requirementEvidenceId);
        })
        .map((requirement) => text(requirement.label))
        .filter(Boolean),
      blockers,
      nextAction: truthGatePassed
        ? "Собрать пакет документов и проверить актуальное окно подачи."
        : firstGap
        ? `Закрыть блокер: ${firstGap}.`
        : "Запросить актуальное положение и подтвердить требования первичным источником.",
      ...(forecast ? { forecastSignal: forecast.statement, forecastStatus: "hypothesis" as const } : { forecastStatus: "none" as const }),
      eligibilityStatus: status,
      verifiedRequirementCount,
      verifiedEvidenceCount,
      truthGatePassed,
      publishStatus: truthGatePassed ? "published" : "manual_review",
      confidence: boundedConfidence(measure.confidence, 0.5),
      epistemicStatus: truthGatePassed ? "observed" : "inferred",
      truthStatus: truthGatePassed ? "verified" : "manual_review",
      engineVersion: ENGINE_VERSION,
    });
  }

  return cards;
}
