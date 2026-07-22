"use client";

import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileCheck2,
  FileText,
  Gauge,
  GitCompareArrows,
  Landmark,
  MapPinned,
  Radar,
  Route,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

export type GovernmentOpportunityReportData = {
  status: string;
  executive_summary: Record<string, unknown>;
  territorial_context: { region?: string; status?: string; factors?: Array<Record<string, unknown>> };
  national_priorities: Array<Record<string, unknown>>;
  project_scenarios: Array<Record<string, unknown>>;
  support_measures: Array<Record<string, unknown>>;
  blockers: string[];
  roadmap: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
  readiness?: {
    score?: number;
    status?: string;
    assessment_level?: string;
    legal_form_ready?: boolean;
    land_ready?: boolean;
    documents_total?: number;
    documents_parsed?: number;
    documents_failed?: number;
    facts_total?: number;
    facts_verified?: number;
    matches_total?: number;
    best_match_score?: number;
    open_tasks?: number;
    eligibility_rules_checked?: number;
    indices?: Record<string, unknown>;
  };
  truth_gate?: {
    version?: string;
    assessment_level?: string;
    verified_evidence?: number;
    documents_parsed?: number;
    eligibility_rules_checked?: number;
    can_claim_match?: boolean;
    can_claim_document_readiness?: boolean;
  };
  documents?: {
    total?: number;
    uploaded?: number;
    queued?: number;
    processing?: number;
    parsed?: number;
    failed?: number;
    needs_ocr?: number;
    unsupported?: number;
    categories?: Array<{ name?: string; count?: number }>;
  };
  project_facts?: Array<Record<string, unknown>>;
  measure_matches?: Array<Record<string, unknown>>;
  intelligence_signals?: Array<Record<string, unknown>>;
  source_changes?: Array<Record<string, unknown>>;
  evidence_summary?: Record<string, unknown>;
  ingestion_health?: {
    latest_run?: Record<string, unknown>;
    recent_failures?: Array<Record<string, unknown>>;
    queued_sources?: number;
    active_endpoints?: number;
  };
  capabilities?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
};

const statusLabels: Record<string, string> = {
  active: "Работает",
  ready: "Готово",
  waiting: "Ожидает данных",
  needs_data: "Нужны данные",
  match: "Подходит",
  mismatch: "Не подходит в текущей форме",
  insufficient_data: "Недостаточно данных",
  manual_review: "Нужна проверка",
  open: "Приём открыт",
  planned: "Запланировано",
  closed: "Приём закрыт",
  permanent: "Действует постоянно",
  unknown: "Статус уточняется",
  completed: "Завершено",
  completed_with_errors: "Завершено с замечаниями",
  failed: "Есть ошибка",
  running: "В работе",
  pending: "Ожидает запуска",
  partial: "Частично готово",
  verified: "Подтверждено",
  unverified: "Не подтверждено",
  inferred: "Определено системой",
  uploaded: "Загружено",
  queued: "В очереди",
  processing: "Обрабатывается",
  parsed: "Разобрано",
  needs_ocr: "Требуется OCR",
  unsupported: "Формат не поддержан",
  skipped: "Пропущено",
  blocked: "Заблокировано",
  preliminary: "Предварительная оценка",
  mention: "Упоминание",
  opportunity_candidate: "Кандидат на возможность",
  verified_measure: "Проверенная мера",
  project_match: "Сопоставлено с проектом",
  actionable_opportunity: "Можно действовать",
  not_actionable: "Пока не является возможностью",
  needs_verification: "Нужно подтвердить",
  actionable: "Доступно действие",
  rejected: "Отклонено",
  matched: "Выполнено",
  missing: "Не хватает данных",
};

const typeLabels: Record<string, string> = {
  grant: "Грант",
  subsidy: "Субсидия",
  loan: "Льготный кредит",
  leasing: "Льготный лизинг",
  guarantee: "Гарантия",
  tax: "Налоговая льгота",
  land: "Земля",
  property: "Имущество",
  infrastructure: "Инфраструктура",
  export: "Экспортная поддержка",
  consulting: "Консультационная поддержка",
  federal: "Федеральный уровень",
  regional: "Региональный уровень",
  municipal: "Муниципальный уровень",
  new_document: "Новый документ",
  amended: "Документ изменён",
  status_change: "Изменился статус",
  deadline_change: "Изменился срок",
  funding_change: "Изменилось финансирование",
  policy: "Изменение политики",
  support: "Мера поддержки",
  priority: "Государственный приоритет",
  territorial: "Территориальный фактор",
};

const readinessIndexLabels: Record<string, string> = {
  project_data: "Данные проекта",
  documents: "Документы",
  legal: "Юридическая готовность",
  financial: "Финансовая готовность",
  eligibility: "Соответствие мерам",
  evidence: "Доказательная база",
  submission: "Готовность к подаче",
};

function text(value: unknown, fallback = "—") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

function label(value: unknown, fallback = "Уточняется") {
  const source = text(value, "");
  return statusLabels[source] ?? typeLabels[source] ?? (source.replaceAll("_", " ") || fallback);
}

function dateLabel(value: unknown) {
  const source = text(value, "");
  if (!source) return "Дата не указана";
  const date = new Date(source);
  return Number.isNaN(date.getTime())
    ? source
    : date.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return text(object.label, text(object.name, text(object.value, text(object.raw, JSON.stringify(object)))));
  }
  return "—";
}

export function GovernmentOpportunityReport({ report }: { report: GovernmentOpportunityReportData }) {
  const summary = report.executive_summary ?? {};
  const readiness = report.readiness ?? {};
  const truthGate = report.truth_gate ?? {};
  const indices = readiness.indices ?? {};
  const documents = report.documents ?? {};
  const facts = report.project_facts ?? [];
  const measures = report.measure_matches?.length ? report.measure_matches : report.support_measures ?? [];
  const scenarios = report.project_scenarios ?? [];
  const signals = report.intelligence_signals ?? [];
  const changes = report.source_changes ?? [];
  const evidence = report.evidence_summary ?? {};
  const ingestion = report.ingestion_health ?? {};
  const capabilities = report.capabilities ?? [];
  const priorities = report.national_priorities ?? [];
  const factors = report.territorial_context?.factors ?? [];
  const roadmap = report.roadmap ?? [];
  const sources = report.sources ?? [];
  const score = Math.max(0, Math.min(100, Math.round(numberValue(readiness.score))));
  const verificationRate = Math.round(numberValue(evidence.verification_rate));
  const confirmedMatches = measures.filter((measure) => measure.eligibility_status === "match");
  const reviewMatches = measures.filter((measure) => measure.eligibility_status === "manual_review" || measure.eligibility_status === "insufficient_data");
  const mismatchMeasures = measures.filter((measure) => measure.eligibility_status === "mismatch");
  const assessmentLevel = text(readiness.assessment_level, text(truthGate.assessment_level, "preliminary"));

  return (
    <section className="mt-6 space-y-4 pb-28">
      <article className="glass-surface relative overflow-hidden rounded-[30px] p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-signal/[.12] blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
          <div>
            <div className="status-pill"><Gauge size={15} /> {label(assessmentLevel, "Оценка проекта")}</div>
            <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-5xl">{text(readiness.status, "Проект проверен")}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-mist/65">{text(summary.conclusion)}</p>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-black/35 shadow-inner">
              <div className="h-full rounded-full bg-signal transition-all" style={{ width: `${score}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-mist/55">
              <span>Итог после ограничений Truth Gate</span><span className="font-semibold text-signal">{score}%</span>
            </div>
          </div>
          <div className="clay-inset grid min-h-44 place-items-center rounded-[28px] p-5 text-center">
            <div>
              <p className="text-6xl font-semibold tracking-[-.06em] text-signal">{score}</p>
              <p className="mt-1 text-sm text-mist/55">из 100</p>
              <p className="mt-4 text-xs leading-5 text-mist/45">
                Балл ограничивается, пока документы, требования и доказательства не подтверждены.
              </p>
            </div>
          </div>
        </div>
      </article>

      <ReportBlock title="Из чего складывается готовность" subtitle="Отдельные индексы вместо одной недостоверной цифры" icon={<Gauge size={19} />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(readinessIndexLabels).map(([key, title]) => (
            <ReadinessIndex key={key} title={title} value={numberValue(indices[key])} />
          ))}
        </div>
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
          <TruthFlag ready={numberValue(truthGate.verified_evidence) > 0} label={`Подтверждённых доказательств: ${numberValue(truthGate.verified_evidence)}`} />
          <TruthFlag ready={numberValue(truthGate.documents_parsed) > 0} label={`Разобрано документов: ${numberValue(truthGate.documents_parsed)}`} />
          <TruthFlag ready={numberValue(truthGate.eligibility_rules_checked) > 0} label={`Проверено наборов требований: ${numberValue(truthGate.eligibility_rules_checked)}`} />
        </div>
      </ReportBlock>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<FileCheck2 size={18} />} title="Документы" value={`${numberValue(documents.parsed)} из ${numberValue(documents.total)}`} note="фактически разобрано" />
        <Metric icon={<ClipboardCheck size={18} />} title="Факты о проекте" value={`${numberValue(readiness.facts_verified)} из ${numberValue(readiness.facts_total)}`} note="подтверждено" />
        <Metric icon={<Landmark size={18} />} title="Подтверждённо подходит" value={String(confirmedMatches.length)} note={`на проверке ${reviewMatches.length} · не подходит ${mismatchMeasures.length}`} />
        <Metric icon={<ShieldCheck size={18} />} title="Доказательная база" value={String(numberValue(evidence.verified_records))} note={`из ${numberValue(evidence.evidence_records)} записей подтверждено`} />
      </div>

      <ReportBlock title="Что реально подключено" subtitle="Статус зависит от фактических данных, а не от наличия интерфейса" icon={<Sparkles size={19} />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.length ? capabilities.map((item, index) => {
            const capabilityName = text(item.name);
            const forcedStatus = capabilityName === "Доказательная база" && numberValue(evidence.verified_records) === 0
              ? "waiting"
              : capabilityName === "Разбор документов" && numberValue(documents.parsed) === 0
                ? "waiting"
                : item.status;
            return (
              <div key={`${capabilityName}-${index}`} className="clay-inset rounded-[22px] p-4">
                <div className="flex items-start justify-between gap-3"><p className="font-medium leading-5">{capabilityName}</p><span className="signal-dot mt-1 shrink-0" /></div>
                <p className="mt-3 text-xs leading-5 text-mist/55">{text(item.detail)}</p>
                <p className="mt-3 text-[11px] font-medium text-signal">{label(forcedStatus)}</p>
              </div>
            );
          }) : <Empty value="Карта возможностей ещё формируется." />}
        </div>
      </ReportBlock>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportBlock title="Варианты реализации" subtitle="Разные юридические и организационные пути" icon={<Target size={19} />}>
          <div className="space-y-3">
            {scenarios.length ? scenarios.map((scenario, index) => (
              <article key={`${text(scenario.title)}-${index}`} className="clay-inset rounded-[22px] p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-signal text-sm font-semibold text-ink">{index + 1}</span>
                  <div><h3 className="font-semibold">{text(scenario.title, `Сценарий ${index + 1}`)}</h3><p className="mt-2 text-sm leading-6 text-mist/60">{text(scenario.description, text(scenario.summary))}</p></div>
                </div>
              </article>
            )) : <Empty value="Сценарии появятся после уточнения исходных данных." />}
          </div>
        </ReportBlock>

        <ReportBlock title="Исходные данные проекта" subtitle="Что система уже знает и чего не хватает" icon={<BookOpenCheck size={19} />}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Fact title="Регион" value={text(summary.region)} />
            <Fact title="Направление" value={text(summary.activity)} />
            <Fact title="Форма заявителя" value={text(summary.legal_form, "Не выбрана")} ready={Boolean(readiness.legal_form_ready)} />
            <Fact title="Земля" value={text(summary.land_status, "Не подтверждена")} ready={Boolean(readiness.land_ready)} />
          </div>
          {report.blockers?.length ? (
            <div className="mt-4 rounded-[22px] border border-signal/20 bg-signal/[.045] p-4">
              <div className="flex items-center gap-2"><AlertCircle className="text-signal" size={18} /><h3 className="font-semibold">Что сейчас мешает</h3></div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-mist/65">{report.blockers.map((item) => <li key={item}>• {item}</li>)}</ul>
            </div>
          ) : null}
        </ReportBlock>
      </div>

      <ReportBlock title="Проверка мер поддержки" subtitle="Каждый вывод разложен на требования, факты и доказательства" icon={<Landmark size={19} />}>
        <div className="grid gap-3 lg:grid-cols-2">
          {measures.length ? measures.map((measure, index) => (
            <MeasureCard key={String(measure.id ?? `${text(measure.title)}-${index}`)} measure={measure} />
          )) : <Empty value="Меры ещё не прошли проверку требований для этого проекта." />}
        </div>
      </ReportBlock>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportBlock title="Документы проекта" subtitle="Загрузка и фактический разбор файлов" icon={<FileText size={19} />}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SmallMetric title="Всего" value={numberValue(documents.total)} />
            <SmallMetric title="Загружено" value={numberValue(documents.uploaded)} />
            <SmallMetric title="Разобрано" value={numberValue(documents.parsed)} accent />
            <SmallMetric title="В очереди" value={numberValue(documents.queued)} />
            <SmallMetric title="Обрабатывается" value={numberValue(documents.processing)} />
            <SmallMetric title="С ошибкой" value={numberValue(documents.failed)} />
            {numberValue(documents.needs_ocr) > 0 && <SmallMetric title="Нужен OCR" value={numberValue(documents.needs_ocr)} />}
            {numberValue(documents.unsupported) > 0 && <SmallMetric title="Не поддержано" value={numberValue(documents.unsupported)} />}
          </div>
          {documents.categories?.length ? (
            <div className="mt-4 space-y-2">
              {documents.categories.map((category, index) => (
                <div key={`${category.name}-${index}`} className="flex items-center justify-between rounded-2xl border border-white/[.07] px-4 py-3 text-sm">
                  <span className="text-mist/65">{text(category.name)}</span><span className="font-semibold text-signal">{numberValue(category.count)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </ReportBlock>

        <ReportBlock title="Факты о проекте" subtitle="Анкета и подтверждённые пользователем данные из документов" icon={<ScanSearch size={19} />}>
          <div className="space-y-2">
            {facts.length ? facts.slice(0, 16).map((fact, index) => (
              <div key={`${text(fact.code)}-${index}`} className="clay-inset rounded-[20px] p-4">
                <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{label(fact.code, `Факт ${index + 1}`)}</p><span className="text-[10px] text-signal">{label(fact.status)}</span></div>
                <p className="mt-2 break-words text-sm leading-6 text-mist/60">{displayValue(fact.value)}</p>
                <p className="mt-2 text-[10px] text-mist/35">Источник: {label(fact.source)} · уверенность {Math.round(numberValue(fact.confidence) * (numberValue(fact.confidence) <= 1 ? 100 : 1))}%</p>
              </div>
            )) : <Empty value="Факты появятся после заполнения проекта, разбора документов и подтверждения найденных значений." />}
          </div>
        </ReportBlock>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportBlock title="Новые изменения" subtitle="Что изменилось в официальных источниках" icon={<GitCompareArrows size={19} />}>
          <div className="space-y-3">
            {changes.length ? changes.map((change, index) => (
              <article key={String(change.id ?? index)} className="clay-inset rounded-[22px] p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] text-signal">{label(change.change_type)}</p><h3 className="mt-2 font-semibold leading-6">{text(change.document_title, "Изменение в официальном документе")}</h3></div><span className="text-[10px] text-mist/40">{dateLabel(change.detected_at)}</span></div>
                <p className="mt-3 text-sm leading-6 text-mist/60">{text(change.summary)}</p><p className="mt-3 text-xs text-mist/40">{text(change.authority)} · {text(change.source_name)}</p>
                {typeof change.document_url === "string" && change.document_url && <a className="mt-3 inline-flex items-center gap-1 text-sm text-signal" href={change.document_url} target="_blank" rel="noreferrer">Открыть документ <ArrowUpRight size={14} /></a>}
              </article>
            )) : <Empty value="Новых подтверждённых изменений для проекта пока нет." />}
          </div>
        </ReportBlock>

        <ReportBlock title="Сигналы" subtitle="Упоминания отделены от проверенных и доступных возможностей" icon={<Radar size={19} />}>
          <div className="space-y-3">
            {signals.length ? signals.map((signal, index) => {
              const confidence = Math.round(numberValue(signal.confidence) * (numberValue(signal.confidence) <= 1 ? 100 : 1));
              return (
                <article key={String(signal.id ?? index)} className="clay-inset rounded-[22px] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-[11px] text-signal">{label(signal.signal_stage, label(signal.type))}</p>
                    <span className="text-xs font-semibold text-signal">{confidence}%</span>
                  </div>
                  <h3 className="mt-2 font-semibold leading-6">{text(signal.title)}</h3>
                  <p className="mt-2 text-sm leading-6 text-mist/60">{text(signal.summary)}</p>
                  <p className="mt-3 text-xs text-mist/40">{label(signal.actionability_status, "Требует проверки")} · горизонт {numberValue(signal.horizon_months)} мес. · {label(signal.level)}</p>
                </article>
              );
            }) : <Empty value="Проверенных сигналов для текущего профиля пока нет." />}
          </div>
        </ReportBlock>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportBlock title="Доказательная база" subtitle="Насколько выводы привязаны к официальным документам" icon={<ShieldCheck size={19} />}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SmallMetric title="Официальные источники" value={numberValue(evidence.official_sources)} />
            <SmallMetric title="Документы" value={numberValue(evidence.source_documents)} />
            <SmallMetric title="Версии" value={numberValue(evidence.source_versions)} />
            <SmallMetric title="Записи доказательств" value={numberValue(evidence.evidence_records)} />
            <SmallMetric title="Подтверждено" value={numberValue(evidence.verified_records)} accent={numberValue(evidence.verified_records) > 0} />
            <SmallMetric title="Доля проверки" value={`${verificationRate}%`} />
          </div>
          <p className="mt-4 rounded-2xl border border-signal/20 bg-signal/[.045] p-4 text-sm leading-6 text-mist/65">
            {numberValue(evidence.verified_records) > 0
              ? `Правило: ${text(evidence.policy, "Только официальные источники")}`
              : "Выводы остаются предварительными: ни одна evidence-запись пока не получила статус verified."}
          </p>
        </ReportBlock>

        <ReportBlock title="Обновление данных" subtitle="Сбор источников, очередь и ошибки" icon={<Activity size={19} />}>
          <IngestionStatus ingestion={ingestion} />
        </ReportBlock>
      </div>

      <ReportBlock title="Пошаговый план" subtitle="Что делать дальше и какой результат получить" icon={<Route size={19} />}>
        <div className="grid gap-3 lg:grid-cols-2">
          {roadmap.length ? roadmap.map((step, index) => (
            <article key={`${text(step.title)}-${index}`} className="clay-inset rounded-[22px] p-4">
              <div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-signal text-sm font-semibold text-ink">{index + 1}</span><div><h3 className="font-semibold">{text(step.title)}</h3><p className="mt-1 text-xs text-signal">{text(step.stage)}{text(step.authority, "") ? ` · ${text(step.authority)}` : ""}</p><p className="mt-2 text-sm leading-6 text-mist/60">{text(step.description)}</p><p className="mt-3 text-xs text-mist/45">Результат: {text(step.expected_document)}</p></div></div>
            </article>
          )) : <Empty value="План появится после завершения анализа." />}
        </div>
      </ReportBlock>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportBlock title="Государственные приоритеты" subtitle="Почему направление может получить поддержку" icon={<FileText size={19} />}><CompactCards items={priorities} empty="Приоритеты пока не извлечены из официальных документов." /></ReportBlock>
        <ReportBlock title="Особенности территории" subtitle="Факторы региона и муниципалитета" icon={<MapPinned size={19} />}><CompactCards items={factors} empty="Территориальные факторы ещё уточняются." /></ReportBlock>
      </div>

      <ReportBlock title="Официальные источники отчёта" subtitle="Документы и ведомства, использованные в выводах" icon={<Database size={19} />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sources.length ? sources.map((source, index) => (
            <div key={String(source.source_key ?? index)} className="clay-inset rounded-[20px] p-4">
              <p className="font-medium leading-5">{text(source.name)}</p><p className="mt-2 text-xs text-mist/45">{label(source.level)} · {label(source.status)}</p>
              {typeof source.url === "string" && source.url && <a className="mt-3 inline-flex items-center gap-1 text-xs text-signal" href={source.url} target="_blank" rel="noreferrer">Открыть <ArrowUpRight size={13} /></a>}
            </div>
          )) : <Empty value="Источники для текущего отчёта ещё собираются." />}
        </div>
      </ReportBlock>
    </section>
  );
}

function MeasureCard({ measure }: { measure: Record<string, unknown> }) {
  const blockers = strings(measure.blockers);
  const missing = strings(measure.missing_data);
  const requirementMatrix = records(measure.requirement_matrix);
  const measureScore = Math.round(numberValue(measure.score));
  const status = text(measure.eligibility_status, "manual_review");

  return (
    <article className="clay-inset rounded-[24px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[11px] text-signal">{label(measure.measure_type)}</p><h3 className="mt-2 text-lg font-semibold leading-6">{text(measure.title)}</h3><p className="mt-2 text-xs leading-5 text-mist/50">{text(measure.authority)}</p></div>
        <span className="rounded-2xl border border-signal/25 bg-signal/[.08] px-3 py-2 text-sm font-semibold text-signal">{measureScore}%</span>
      </div>
      <p className="mt-4 text-sm leading-6 text-mist/65">{text(measure.rationale, text(measure.summary, "Описание уточняется по официальному документу."))}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-signal/20 bg-signal/[.05] px-3 py-1.5 text-signal">{label(status, "Проверяется")}</span><span className="rounded-full border border-white/10 px-3 py-1.5 text-mist/55">{label(measure.status)}</span></div>

      {requirementMatrix.length ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-mist/55">Матрица требований</p>
          {requirementMatrix.map((requirement, index) => (
            <div key={`${text(requirement.requirement_key)}-${index}`} className="rounded-2xl border border-white/[.07] p-3">
              <div className="flex items-start justify-between gap-3"><p className="text-xs font-medium leading-5">{text(requirement.label, `Требование ${index + 1}`)}</p><span className="shrink-0 text-[10px] text-signal">{label(requirement.status)}</span></div>
              <p className="mt-2 text-[11px] leading-5 text-mist/45">Факт: {displayValue(requirement.actual)}</p>
              {text(requirement.source_locator, "") && <p className="mt-1 text-[10px] leading-4 text-mist/35">Основание: {text(requirement.source_locator)}</p>}
            </div>
          ))}
        </div>
      ) : null}

      {blockers.length ? <MiniList title="Что мешает" items={blockers} /> : null}
      {missing.length ? <MiniList title="Что нужно подтвердить" items={missing} /> : null}
      {typeof measure.official_url === "string" && measure.official_url && <a className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-signal" href={measure.official_url} target="_blank" rel="noreferrer">Официальный источник <ArrowUpRight size={14} /></a>}
    </article>
  );
}

function ReportBlock({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="glass-surface rounded-[28px] p-5 sm:p-6"><div className="mb-5 flex items-start gap-3"><div className="brand-mark h-10 w-10 shrink-0 rounded-[16px]">{icon}</div><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-mist/45">{subtitle}</p></div></div>{children}</section>;
}

function Metric({ icon, title, value, note }: { icon: React.ReactNode; title: string; value: string; note: string }) {
  return <div className="glass-surface rounded-[24px] p-4"><div className="flex items-center justify-between"><span className="text-signal">{icon}</span><CheckCircle2 size={14} className="text-signal" /></div><p className="mt-5 text-3xl font-semibold tracking-[-.04em]">{value}</p><p className="mt-2 text-sm text-mist/60">{title}</p><p className="mt-1 text-[11px] text-mist/35">{note}</p></div>;
}

function ReadinessIndex({ title, value }: { title: string; value: number }) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  return <div className="clay-inset rounded-[20px] p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs text-mist/55">{title}</p><span className="text-sm font-semibold text-signal">{bounded}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-signal" style={{ width: `${bounded}%` }} /></div></div>;
}

function TruthFlag({ ready, label: value }: { ready: boolean; label: string }) {
  return <div className="rounded-2xl border border-white/[.07] px-3 py-2 text-mist/55"><span className={ready ? "text-signal" : "text-mist/35"}>{ready ? "●" : "○"}</span> {value}</div>;
}

function SmallMetric({ title, value, accent = false }: { title: string; value: number | string; accent?: boolean }) {
  return <div className="clay-inset rounded-[20px] p-4"><p className="text-[11px] leading-4 text-mist/45">{title}</p><p className={`mt-3 text-2xl font-semibold ${accent ? "text-signal" : "text-mist"}`}>{value}</p></div>;
}

function Fact({ title, value, ready }: { title: string; value: string; ready?: boolean }) {
  return <div className="clay-inset rounded-[20px] p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs text-mist/45">{title}</p>{typeof ready === "boolean" ? <span className={`text-[10px] ${ready ? "text-signal" : "text-mist/35"}`}>{ready ? "Готово" : "Нужно уточнить"}</span> : null}</div><p className="mt-2 text-sm leading-6">{value}</p></div>;
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return <div className="mt-4 rounded-2xl border border-white/[.07] p-3"><p className="text-xs font-medium text-mist/55">{title}</p><ul className="mt-2 space-y-1 text-xs leading-5 text-mist/50">{items.map((item) => <li key={item}>• {item}</li>)}</ul></div>;
}

function Empty({ value }: { value: string }) {
  return <div className="col-span-full rounded-[22px] border border-dashed border-white/10 p-5 text-sm leading-6 text-mist/45">{value}</div>;
}

function CompactCards({ items, empty }: { items: Array<Record<string, unknown>>; empty: string }) {
  if (!items.length) return <Empty value={empty} />;
  return <div className="space-y-3">{items.map((item, index) => <article key={String(item.id ?? item.title ?? index)} className="clay-inset rounded-[20px] p-4"><h3 className="font-semibold leading-6">{text(item.title)}</h3><p className="mt-2 text-sm leading-6 text-mist/60">{text(item.description, text(item.summary, text(item.authority)))}</p>{typeof item.official_url === "string" && item.official_url && <a className="mt-3 inline-flex items-center gap-1 text-sm text-signal" href={item.official_url} target="_blank" rel="noreferrer">Официальный документ <ArrowUpRight size={14} /></a>}</article>)}</div>;
}

function IngestionStatus({ ingestion }: { ingestion: NonNullable<GovernmentOpportunityReportData["ingestion_health"]> }) {
  const latest = ingestion.latest_run ?? {};
  const failures = ingestion.recent_failures ?? [];
  return <div><div className="grid grid-cols-2 gap-3"><SmallMetric title="Активные точки сбора" value={numberValue(ingestion.active_endpoints)} accent /><SmallMetric title="Источники в очереди" value={numberValue(ingestion.queued_sources)} /><SmallMetric title="Обработано за запуск" value={numberValue(latest.sources_processed)} /><SmallMetric title="Ошибок за запуск" value={numberValue(latest.failed_count)} /></div><div className="mt-4 clay-inset rounded-[20px] p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">Последнее обновление</p><span className="text-xs text-signal">{label(latest.status)}</span></div><p className="mt-2 text-xs leading-5 text-mist/45">{dateLabel(latest.finished_at ?? latest.started_at)} · найдено {numberValue(latest.discovered_count)} · сохранено {numberValue(latest.persisted_count)}</p></div>{failures.length ? <div className="mt-4"><p className="mb-2 text-xs font-medium text-mist/55">Источники, требующие восстановления</p><div className="space-y-2">{failures.map((failure, index) => <div key={`${text(failure.source_key)}-${index}`} className="rounded-2xl border border-signal/15 bg-signal/[.035] p-3"><p className="text-sm font-medium">{text(failure.source_key, "Источник")}</p><p className="mt-1 text-xs leading-5 text-mist/45">{text(failure.error)}</p></div>)}</div></div> : null}</div>;
}
