import {
  ENGINE_VERSION,
  type IntelligenceContext,
  type RuntimeNarrative,
  type RuntimeSignal,
} from "./types.ts";

const THEMES: Record<string, string[]> = {
  agriculture: ["сельское хозяйство", "агропромышлен", "сельхоз", "кфх", "фермер"],
  rural_development: ["сельские территории", "инфраструктура", "благоустройство", "жилищное развитие"],
  tourism: ["туризм", "агротуризм", "гостевые дома", "туристическая инфраструктура"],
  technology: ["искусственный интеллект", "цифровизация", "автоматизация", "роботизация"],
  industry: ["промышленность", "производство", "оборудование", "импортозамещение"],
  export: ["экспорт", "внешние рынки", "сертификация", "логистика"],
  control: ["контроль", "мониторинг", "отчетность", "показатель", "kpi"],
};

function transitionStage(text: string, signals: RuntimeSignal[]): RuntimeNarrative["transitionStage"] {
  if (signals.some((signal) => signal.type === "procurement_activity") || /закупк|контракт|тендер/i.test(text)) return "procurement";
  if (signals.some((signal) => signal.type === "budget_commitment") || /бюджет|ассигнован|лимит/i.test(text)) return "budget";
  if (/приказ|постановление|федеральный закон|официальное опубликование/i.test(text)) return "legal_act";
  if (/государственная программа|мера поддержки|конкурс|отбор/i.test(text)) return "programme";
  return "rhetoric";
}

export function detectNarratives(context: IntelligenceContext, signals: RuntimeSignal[]): RuntimeNarrative[] {
  const serialized = JSON.stringify(context.report).toLocaleLowerCase("ru-RU");
  const narratives: RuntimeNarrative[] = [];
  const evidenceIds = Array.from(new Set(signals.flatMap((signal) => signal.evidenceIds)));
  const stage = transitionStage(serialized, signals);

  for (const [theme, terms] of Object.entries(THEMES)) {
    const repeatedTerms = terms.filter((term) => serialized.includes(term));
    if (repeatedTerms.length < 2) continue;
    const relatedSignals = signals.filter((signal) =>
      repeatedTerms.some((term) => `${signal.title} ${signal.summary}`.toLocaleLowerCase("ru-RU").includes(term))
    );
    const sourceId = relatedSignals.find((signal) => signal.sourceId)?.sourceId;
    const sourceSnapshotId = relatedSignals.find((signal) => signal.sourceSnapshotId)?.sourceSnapshotId;
    const evidenceId = relatedSignals.find((signal) => signal.evidenceId)?.evidenceId;

    narratives.push({
      projectId: context.projectId,
      ...(context.projectCheckId ? { projectCheckId: context.projectCheckId } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(sourceSnapshotId ? { sourceSnapshotId } : {}),
      ...(evidenceId ? { evidenceId } : {}),
      theme,
      repeatedTerms,
      transitionStage: stage,
      evidenceIds,
      confidence: Math.min(0.8, 0.35 + repeatedTerms.length * 0.1 + relatedSignals.length * 0.05),
      epistemicStatus: "inferred",
      truthStatus: "unverified",
      engineVersion: ENGINE_VERSION,
      canSupportEligibility: false,
    });
  }

  return narratives;
}
