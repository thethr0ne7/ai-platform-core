import {
  ENGINE_VERSION,
  type IntelligenceContext,
  type RuntimeEvent,
  type RuntimeSignal,
  type SignalType,
  asRecord,
  asRecords,
  asStrings,
  boundedConfidence,
  normalizeKey,
  text,
} from "./types.ts";

const SIGNAL_PATTERNS: Array<{ type: SignalType; pattern: RegExp; title: string }> = [
  { type: "funding_increase", pattern: /(увелич|дополнительн|расшир.*финанс|рост.*финанс)/i, title: "Увеличение финансирования" },
  { type: "funding_reduction", pattern: /(сокращ|уменьш|снижен.*финанс|урез)/i, title: "Сокращение финансирования" },
  { type: "new_support_measure", pattern: /(нов.*мер.*поддерж|запуск.*программ|объявлен.*конкурс|отбор)/i, title: "Новая мера поддержки" },
  { type: "eligibility_change", pattern: /(измен.*требован|получател|заявител|критери.*отбор)/i, title: "Изменение условий участия" },
  { type: "territorial_priority", pattern: /(территор|регион|субъект|муниципал)/i, title: "Территориальный приоритет" },
  { type: "sector_priority", pattern: /(отрасл|сектор|приоритетн.*направлен)/i, title: "Отраслевой приоритет" },
  { type: "application_window", pattern: /(прием.*заяв|подач.*заяв|срок.*заяв|окно.*подач)/i, title: "Окно подачи заявок" },
  { type: "legal_constraint", pattern: /(огранич|запрещ|обязан|не допуска|услови.*обяз)/i, title: "Правовое ограничение" },
  { type: "budget_commitment", pattern: /(бюджет|ассигнован|лимит|финансирован)/i, title: "Бюджетное обязательство" },
  { type: "procurement_activity", pattern: /(закупк|контракт|тендер|госзаказ)/i, title: "Закупочная активность" },
  { type: "programme_termination", pattern: /(прекращ|завершен.*программ|утратил.*сил|отмен)/i, title: "Завершение программы" },
  { type: "institutional_narrative", pattern: /(стратег|приоритет|необходимо|ключев.*задач)/i, title: "Институциональный нарратив" },
];

function inferSignalType(value: string, fallback: SignalType = "early_policy_signal"): { type: SignalType; title: string } {
  for (const candidate of SIGNAL_PATTERNS) {
    if (candidate.pattern.test(value)) return { type: candidate.type, title: candidate.title };
  }
  return { type: fallback, title: "Ранний государственный сигнал" };
}

function levelOf(value: unknown): "federal" | "regional" | "municipal" | "project" {
  const normalized = text(value);
  if (normalized === "regional" || normalized === "municipal" || normalized === "project") return normalized;
  return "federal";
}

function sourceLookup(report: Record<string, unknown>): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const source of asRecords(report.sources)) {
    const id = text(source.id);
    if (!id) continue;
    for (const value of [text(source.name), text(source.authority), text(source.source_key)]) {
      if (value) lookup.set(normalizeKey(value), id);
    }
  }
  return lookup;
}

export function buildEvents(context: IntelligenceContext): RuntimeEvent[] {
  const lookup = sourceLookup(context.report);
  return asRecords(context.report.source_changes).map((change) => {
    const sourceId = lookup.get(normalizeKey(text(change.source_name))) ?? lookup.get(normalizeKey(text(change.authority)));
    return {
      projectId: context.projectId,
      ...(context.projectCheckId ? { projectCheckId: context.projectCheckId } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(text(change.source_snapshot_id) ? { sourceSnapshotId: text(change.source_snapshot_id) } : {}),
      ...(text(change.evidence_id) ? { evidenceId: text(change.evidence_id) } : {}),
      eventType: text(change.change_type) || "source_change",
      ...(text(change.detected_at) ? { occurredAt: text(change.detected_at) } : {}),
      effectiveDates: [],
      payload: {
        title: text(change.document_title),
        url: text(change.document_url),
        summary: text(change.summary),
        severity: text(change.severity),
        authority: text(change.authority),
      },
      confidence: text(change.severity) === "high" ? 0.8 : 0.65,
      epistemicStatus: "observed" as const,
      truthStatus: text(change.evidence_status) === "verified" ? "verified" as const : "unverified" as const,
      engineVersion: ENGINE_VERSION,
      canSupportEligibility: false as const,
    };
  });
}

export function detectSignals(context: IntelligenceContext): RuntimeSignal[] {
  const report = context.report;
  const lookup = sourceLookup(report);
  const signals = new Map<string, RuntimeSignal>();

  const add = (signal: RuntimeSignal) => {
    const previous = signals.get(signal.key);
    if (!previous || signal.confidence > previous.confidence) signals.set(signal.key, signal);
  };

  for (const existing of asRecords(report.intelligence_signals)) {
    const rawType = text(existing.type) as SignalType;
    const inferred = SIGNAL_PATTERNS.some((item) => item.type === rawType)
      ? { type: rawType, title: text(existing.title) || rawType }
      : inferSignalType(`${text(existing.title)} ${text(existing.summary)}`);
    const sourceId = lookup.get(normalizeKey(text(existing.source_name))) ?? lookup.get(normalizeKey(text(existing.authority)));
    const firstDetectedAt = text(existing.first_detected_at) || new Date().toISOString();
    const evidenceIds = asStrings(existing.evidence_ids);
    const evidenceId = text(existing.evidence_id) || evidenceIds[0];
    const key = text(existing.signal_key) || `${context.projectId}:${inferred.type}:${normalizeKey(text(existing.title) || firstDetectedAt)}`;

    add({
      projectId: context.projectId,
      ...(context.projectCheckId ? { projectCheckId: context.projectCheckId } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(text(existing.source_snapshot_id) ? { sourceSnapshotId: text(existing.source_snapshot_id) } : {}),
      ...(evidenceId ? { evidenceId } : {}),
      key,
      type: inferred.type,
      title: text(existing.title) || inferred.title,
      summary: text(existing.summary),
      level: levelOf(existing.level),
      ...(text(existing.region) ? { region: text(existing.region) } : {}),
      sectors: asStrings(existing.sectors),
      firstDetectedAt,
      ...(text(existing.last_confirmed_at) ? { lastConfirmedAt: text(existing.last_confirmed_at) } : {}),
      evidenceIds,
      confidence: boundedConfidence(existing.confidence, 0.55),
      epistemicStatus: "inferred",
      truthStatus: evidenceIds.length > 0 && text(existing.evidence_status) === "verified" ? "verified" : "unverified",
      engineVersion: ENGINE_VERSION,
      canSupportEligibility: false,
    });
  }

  for (const change of asRecords(report.source_changes)) {
    const combined = `${text(change.document_title)} ${text(change.summary)} ${text(change.authority)}`;
    const inferred = inferSignalType(combined);
    const sourceId = lookup.get(normalizeKey(text(change.source_name))) ?? lookup.get(normalizeKey(text(change.authority)));
    const detectedAt = text(change.detected_at) || new Date().toISOString();
    const evidenceId = text(change.evidence_id);
    const key = `${context.projectId}:${inferred.type}:${normalizeKey(text(change.id) || text(change.document_url) || detectedAt)}`;

    add({
      projectId: context.projectId,
      ...(context.projectCheckId ? { projectCheckId: context.projectCheckId } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(text(change.source_snapshot_id) ? { sourceSnapshotId: text(change.source_snapshot_id) } : {}),
      ...(evidenceId ? { evidenceId } : {}),
      key,
      type: inferred.type,
      title: inferred.title,
      summary: text(change.summary) || `Сигнал выявлен в изменении документа «${text(change.document_title)}».`,
      level: levelOf(change.level),
      ...(text(change.region) ? { region: text(change.region) } : {}),
      sectors: asStrings(change.sectors),
      firstDetectedAt: detectedAt,
      lastConfirmedAt: detectedAt,
      evidenceIds: evidenceId ? [evidenceId] : [],
      confidence: text(change.severity) === "high" ? 0.75 : 0.55,
      epistemicStatus: "inferred",
      truthStatus: evidenceId && text(change.evidence_status) === "verified" ? "verified" : "unverified",
      engineVersion: ENGINE_VERSION,
      canSupportEligibility: false,
    });
  }

  return Array.from(signals.values());
}
