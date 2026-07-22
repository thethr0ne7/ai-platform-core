import {
  ENGINE_VERSION,
  type IntelligenceContext,
  type RuntimeSignal,
  type RuntimeTrajectory,
  type SignalType,
} from "./types.ts";

function timestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function directionFor(type: SignalType, count: number): RuntimeTrajectory["direction"] {
  if (count < 2) return "insufficient_history";
  if (type === "funding_reduction" || type === "programme_termination") return "down";
  if (type === "funding_increase" || type === "new_support_measure" || type === "budget_commitment") return "up";
  if (type === "early_policy_signal" || type === "institutional_narrative") return "emerging";
  return "stable";
}

export function detectTrajectories(context: IntelligenceContext, signals: RuntimeSignal[]): RuntimeTrajectory[] {
  const grouped = new Map<SignalType, RuntimeSignal[]>();
  for (const signal of signals) grouped.set(signal.type, [...(grouped.get(signal.type) ?? []), signal]);

  const trajectories: RuntimeTrajectory[] = [];
  for (const [signalType, items] of grouped) {
    const ordered = [...items].sort((left, right) => timestamp(left.firstDetectedAt) - timestamp(right.firstDetectedAt));
    if (ordered.length < 2) continue;
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (!first || !last) continue;
    const periodMs = Math.max(1, timestamp(last.lastConfirmedAt ?? last.firstDetectedAt) - timestamp(first.firstDetectedAt));
    const periodDays = Math.max(1, periodMs / 86_400_000);
    const velocity = Number((ordered.length / periodDays).toFixed(4));
    const evidenceIds = Array.from(new Set(ordered.flatMap((signal) => signal.evidenceIds)));

    trajectories.push({
      projectId: context.projectId,
      ...(context.projectCheckId ? { projectCheckId: context.projectCheckId } : {}),
      ...(last.sourceId ? { sourceId: last.sourceId } : {}),
      ...(last.sourceSnapshotId ? { sourceSnapshotId: last.sourceSnapshotId } : {}),
      ...(last.evidenceId ? { evidenceId: last.evidenceId } : {}),
      signalType,
      direction: directionFor(signalType, ordered.length),
      periodStart: first.firstDetectedAt,
      periodEnd: last.lastConfirmedAt ?? last.firstDetectedAt,
      velocity,
      acceleration: ordered.length >= 3 ? Number(((ordered.length - 1) / periodDays).toFixed(4)) : 0,
      evidenceIds,
      confidence: Math.min(0.82, 0.35 + ordered.length * 0.08 + Math.min(0.15, evidenceIds.length * 0.03)),
      epistemicStatus: "inferred",
      truthStatus: evidenceIds.length > 0 ? "manual_review" : "unverified",
      engineVersion: ENGINE_VERSION,
      canSupportEligibility: false,
    });
  }

  return trajectories;
}
