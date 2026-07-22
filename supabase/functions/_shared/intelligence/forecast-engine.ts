import {
  ENGINE_VERSION,
  type IntelligenceContext,
  type RuntimeForecast,
  type RuntimeNarrative,
  type RuntimeTrajectory,
} from "./types.ts";

export function buildControlledForecasts(
  context: IntelligenceContext,
  trajectories: RuntimeTrajectory[],
  narratives: RuntimeNarrative[],
): RuntimeForecast[] {
  const forecasts: RuntimeForecast[] = [];

  for (const trajectory of trajectories) {
    if (trajectory.evidenceIds.length < 2 || trajectory.direction === "insufficient_history") continue;
    const relatedNarrative = narratives.find((narrative) =>
      narrative.evidenceIds.some((id) => trajectory.evidenceIds.includes(id))
    );
    const evidenceIds = Array.from(new Set([
      ...trajectory.evidenceIds,
      ...(relatedNarrative?.evidenceIds ?? []),
    ]));
    const sourceId = trajectory.sourceId ?? relatedNarrative?.sourceId;
    const sourceSnapshotId = trajectory.sourceSnapshotId ?? relatedNarrative?.sourceSnapshotId;
    const evidenceId = trajectory.evidenceId ?? relatedNarrative?.evidenceId ?? evidenceIds[0];
    const probability = Math.min(0.65, 0.35 + trajectory.confidence * 0.25 + Math.min(0.1, evidenceIds.length * 0.02));

    forecasts.push({
      projectId: context.projectId,
      ...(context.projectCheckId ? { projectCheckId: context.projectCheckId } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(sourceSnapshotId ? { sourceSnapshotId } : {}),
      ...(evidenceId ? { evidenceId } : {}),
      forecastType: `trajectory:${trajectory.signalType}`,
      horizonMonths: 12,
      statement: `При сохранении наблюдаемой динамики сигнал «${trajectory.signalType}» может усилиться в течение 12 месяцев.`,
      probability,
      assumptions: [
        "Новые официальные документы продолжат подтверждать текущую динамику.",
        "Не произойдет отмена программы или существенное изменение бюджетных приоритетов.",
        "Источники останутся сопоставимыми по уровню полномочий и предмету регулирования.",
      ],
      falsificationConditions: [
        "Появился официальный акт, отменяющий или сокращающий соответствующее направление.",
        "Следующие два подтвержденных источника показывают противоположную динамику.",
        "Бюджетные обязательства не появились в установленном горизонте.",
      ],
      evidenceIds,
      confidence: probability,
      epistemicStatus: "hypothesis",
      truthStatus: "manual_review",
      engineVersion: ENGINE_VERSION,
      canSupportEligibility: false,
    });
  }

  return forecasts;
}
