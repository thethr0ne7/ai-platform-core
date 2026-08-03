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

function stableSourceIdentity(values: unknown[], sourceId?: string): string {
  if (sourceId) return `source:${sourceId}`;
  for (const value of values) {
    const normalized = normalizeKey(text(value));
    if (normalized) return normalized.slice(0, 240);
  }
  return "source:unknown";
}

function semanticSignalKey(input: {
  projectId: string;
  type: SignalType;
  sourceIdentity: string;
  title: string;
  summary: string;
  level: string;
  region?: string;
  sectors: string[];
  subject?: string;
}): string {
  const sectors = [...input.sectors].map(normalizeKey).filter(Boolean).sort().join(",");
  const subject = normalizeKey(input.subject || `${input.title} ${input.summary}`).slice(0, 320);
  return [
    input.projectId,
    input.type,
    input.sourceIdentity,
    normalizeKey(input.level),
    normalizeKey(input.region || ""),
    sectors,
    subject,
  ].join(":");
}

function earliest(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}

function latest(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function mergeSignal(previous: RuntimeSignal, next: RuntimeSignal): RuntimeSignal {
  const preferred = next.confidence > previous.confidence ? next : previous;
  const evidenceIds = Array.from(new Set([...previous.evidenceIds, ...next.evidenceIds]));
  return {
    ...preferred,
    key: previous.key,
    sourceId: previous.sourceId ?? next.sourceId,
    sourceSnapshotId: previous.sourceSnapshotId ?? next.sourceSnapshotId,
    evidenceId: previous.evidenceId ?? next.evidenceId,
    firstDetectedAt: earliest(previous.firstDetectedAt, next.firstDetectedAt),
    lastConfirmedAt: latest(previous.lastConfirmedAt, next.lastConfirmedAt),
    evidenceIds,
    confidence: Math.max(previous.confidence, next.confidence),
    truthStatus: previous.truthStatus === "verified" || next.truthStatus === "verified" ? "verified" : "unverified",
  };
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
    signals.set(signal.key, previous ? mergeSignal(previous, signal) : signal);
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
    const sectors = asStrings(existing.sectors);
    const level = levelOf(existing.level);
    const title = text(existing.title) || inferred.title;
    const summary = text(existing.summary);
    const region = text(existing.region);
    const sourceIdentity = stableSourceIdentity([
      existing.source_id,
      existing.source_key,
      existing.source_name,
      existing.authority,
      existing.document_url,
      summary,
    ], sourceId);
    const key = semanticSignalKey({
      projectId: context.projectId,
      type: inferred.type,
      sourceIdentity,
      title,
      summary,
      level,
      region,
      sectors,
      subject: text(existing.document_url) || text(existing.document_title) || `${title} ${summary}`,
    });

    add({
      projectId: context.projectId,
      ...(context.projectCheckId ? { projectCheckId: context.projectCheckId } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(text(existing.source_snapshot_id) ? { sourceSnapshotId: text(existing.source_snapshot_id) } : {}),
      ...(evidenceId ? { evidenceId } : {}),
      key,
      type: inferred.type,
      title,
      summary,
      level,
      ...(region ? { region } : {}),
      sectors,
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
    const sectors = asStrings(change.sectors);
    const level = levelOf(change.level);
    const title = inferred.title;
    const summary = text(change.summary) || `Сигнал выявлен в изменении документа «${text(change.document_title)}».`;
    const region = text(change.region);
    const sourceIdentity = stableSourceIdentity([
      change.source_id,
      change.source_key,
      change.document_url,
      change.source_name,
      change.authority,
    ], sourceId);
    const key = semanticSignalKey({
      projectId: context.projectId,
      type: inferred.type,
      sourceIdentity,
      title,
      summary,
      level,
      region,
      sectors,
      subject: `${text(change.change_type)} ${text(change.document_url)} ${text(change.document_title)}`,
    });

    add({
      projectId: context.projectId,
      ...(context.projectCheckId ? { projectCheckId: context.projectCheckId } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(text(change.source_snapshot_id) ? { sourceSnapshotId: text(change.source_snapshot_id) } : {}),
      ...(evidenceId ? { evidenceId } : {}),
      key,
      type: inferred.type,
      title,
      summary,
      level,
      ...(region ? { region } : {}),
      sectors,
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

  return Array.from(signals.values()).sort((left, right) => {
    const confirmed = (right.lastConfirmedAt || right.firstDetectedAt).localeCompare(left.lastConfirmedAt || left.firstDetectedAt);
    return confirmed || right.confidence - left.confidence;
  });
}
