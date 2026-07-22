"use client";

import type { ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
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
import {
  confidencePercent,
  dateLabel,
  displayValue,
  friendlySourceError,
  label,
  numberValue,
  records,
  strings,
  text,
} from "../lib/government-report-format";

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
    verified_rules?: number;
    required_rules?: number;
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

const readinessIndexLabels: Record<string, string> = {
  project_data: "Данные проекта",
  documents: "Документы",
  legal: "Юридическая готовность",
  financial: "Финансовая готовность",
  eligibility: "Соответствие мерам",
  evidence: "Доказательная база",
  submission: "Готовность к подаче",
};

const navigation = [
  ["report-summary", "Итог"],
  ["report-measures", "Меры"],
  ["report-documents", "Документы"],
  ["report-evidence", "Доказательства"],
  ["report-actions", "Действия"],
] as const;

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
  const nextAction = roadmap[0];

  return (
    <section className="report-workspace mt-6 space-y-4 pb-28">
      <nav className="report-nav" aria-label="Разделы отчёта">
        {navigation.map(([href, title]) => <a key={href} href={`#${href}`}>{title}</a>)}
      </nav>

      <article id="report-summary" className="report-hero glass-surface scroll-mt-24 overflow-hidden rounded-[30px] p-5 sm:p-7">
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
          <div className="min-w-0">
            <div className="status-pill"><Gauge size={15} /> {label(assessmentLevel, "Оценка проекта")}</div>
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold leading-[1.08] tracking-[-.035em] sm:text-5xl">{text(readiness.status, "Проект проверен")}</h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-mist/65">{text(summary.conclusion)}</p>
            <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-black/35 shadow-inner"><div className="h-full rounded-full bg-signal" style={{ width: `${score}%` }} /></div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-mist/50"><span>Итог после ограничений проверки фактов</span><span className="font-semibold text-signal">{score}%</span></div>
          </div>
          <div className="clay-inset grid min-h-40 place-items-center rounded-[28px] p-5 text-center">
            <div><p className="text-6xl font-semibold tracking-[-.07em] text-signal">{score}</p><p className="mt-1 text-sm text-mist/55">из 100</p><p className="mt-4 text-xs leading-5 text-mist/45">Балл не повышается без подтверждённых требований и источников.</p></div>
          </div>
        </div>
        {nextAction ? (
          <div className="mt-5 grid gap-3 rounded-[22px] border border-signal/20 bg-signal/[.045] p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
            <div className="brand-mark h-10 w-10 rounded-[16px]"><Route size={18} /></div>
            <div className="min-w-0"><p className="text-[11px] font-medium text-signal">Следующее действие</p><h3 className="mt-1 font-semibold leading-6">{text(nextAction.title)}</h3><p className="mt-1 text-sm leading-6 text-mist/60">{text(nextAction.description)}</p></div>
          </div>
        ) : null}
      </article>

      <div className="report-metrics-grid">
        <Metric icon={<FileCheck2 size={18} />} title="Документы" value={`${numberValue(documents.parsed)} из ${numberValue(documents.total)}`} note="разобрано" />
        <Metric icon={<ClipboardCheck size={18} />} title="Факты проекта" value={`${numberValue(readiness.facts_verified)} из ${numberValue(readiness.facts_total)}`} note="подтверждено" />
        <Metric icon={<Landmark size={18} />} title="Подходит" value={String(confirmedMatches.length)} note={`на проверке ${reviewMatches.length} · не подходит ${mismatchMeasures.length}`} />
        <Metric icon={<ShieldCheck size={18} />} title="Доказательства" value={String(numberValue(evidence.verified_records))} note={`из ${numberValue(evidence.evidence_records)} подтверждено`} />
      </div>

      <ReportBlock title="Готовность по направлениям" subtitle="Система показывает отдельные показатели, а не маскирует пробелы одной цифрой" icon={<Gauge size={19} />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(readinessIndexLabels).map(([key, title]) => <ReadinessIndex key={key} title={title} value={numberValue(indices[key])} />)}
        </div>
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
          <TruthFlag ready={numberValue(truthGate.verified_evidence) > 0} label={`Подтверждённых доказательств: ${numberValue(truthGate.verified_evidence)}`} />
          <TruthFlag ready={numberValue(truthGate.documents_parsed) > 0} label={`Разобрано документов: ${numberValue(truthGate.documents_parsed)}`} />
          <TruthFlag ready={numberValue(truthGate.verified_rules) > 0} label={`Подтверждено требований: ${numberValue(truthGate.verified_rules)} из ${numberValue(truthGate.required_rules)}`} />
        </div>
      </ReportBlock>

      <ReportBlock id="report-measures" title="Меры поддержки" subtitle="Сначала показываем решение и блокеры; подробная матрица открывается по запросу" icon={<Landmark size={19} />}>
        <div className="grid gap-3 xl:grid-cols-2">
          {measures.length ? measures.map((measure, index) => <MeasureCard key={String(measure.id ?? `${text(measure.title)}-${index}`)} measure={measure} />) : <Empty value="Меры ещё не прошли проверку требований для этого проекта." />}
        </div>
      </ReportBlock>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportBlock title="Исходные данные" subtitle="Что система использует при проверке" icon={<BookOpenCheck size={19} />}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Fact title="Регион" value={text(summary.region)} />
            <Fact title="Направление" value={text(summary.activity)} />
            <Fact title="Форма заявителя" value={text(summary.legal_form, "Не выбрана")} ready={Boolean(readiness.legal_form_ready)} />
            <Fact title="Земля" value={text(summary.land_status, "Не подтверждена")} ready={Boolean(readiness.land_ready)} />
          </div>
          {report.blockers?.length ? <MiniList title="Что сейчас мешает" items={report.blockers} emphasized /> : null}
        </ReportBlock>

        <ReportBlock title="Варианты реализации" subtitle="Юридические и организационные пути" icon={<Target size={19} />}>
          <div className="space-y-3">{scenarios.length ? scenarios.map((scenario, index) => <NumberedCard key={`${text(scenario.title)}-${index}`} number={index + 1} title={text(scenario.title, `Сценарий ${index + 1}`)} description={text(scenario.description, text(scenario.summary))} />) : <Empty value="Сценарии появятся после уточнения исходных данных." />}</div>
        </ReportBlock>
      </div>

      <div id="report-documents" className="grid scroll-mt-24 gap-4 xl:grid-cols-2">
        <ReportBlock title="Документы проекта" subtitle="Загрузка и фактический разбор файлов" icon={<FileText size={19} />}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SmallMetric title="Всего" value={numberValue(documents.total)} />
            <SmallMetric title="Разобрано" value={numberValue(documents.parsed)} accent />
            <SmallMetric title="В очереди" value={numberValue(documents.queued)} />
            <SmallMetric title="Обрабатывается" value={numberValue(documents.processing)} />
            <SmallMetric title="С ошибкой" value={numberValue(documents.failed)} />
            <SmallMetric title="Нужно распознать" value={numberValue(documents.needs_ocr)} />
          </div>
          {documents.categories?.length ? <div className="mt-4 space-y-2">{documents.categories.map((category, index) => <div key={`${category.name}-${index}`} className="compact-row"><span>{text(category.name)}</span><strong>{numberValue(category.count)}</strong></div>)}</div> : null}
        </ReportBlock>

        <ReportBlock title="Факты из документов" subtitle="Только подтверждённые пользователем значения участвуют в расчётах" icon={<ScanSearch size={19} />}>
          <div className="space-y-2">{facts.length ? facts.slice(0, 12).map((fact, index) => <div key={`${text(fact.code)}-${index}`} className="clay-inset rounded-[20px] p-4"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"><p className="min-w-0 text-sm font-medium">{label(fact.code, `Факт ${index + 1}`)}</p><StatusBadge status={fact.status} /></div><p className="mt-2 break-words text-sm leading-6 text-mist/65">{displayValue(fact.value)}</p><p className="mt-2 text-[10px] leading-4 text-mist/35">Источник: {label(fact.source)} · уверенность {confidencePercent(fact.confidence)}%</p></div>) : <Empty value="Факты появятся после заполнения проекта, разбора документов и подтверждения найденных значений." />}</div>
        </ReportBlock>
      </div>

      <div id="report-evidence" className="grid scroll-mt-24 gap-4 xl:grid-cols-2">
        <ReportBlock title="Доказательная база" subtitle="Юридический вывод возможен только после проверки первичного документа" icon={<ShieldCheck size={19} />}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SmallMetric title="Источники" value={numberValue(evidence.official_sources)} />
            <SmallMetric title="Документы" value={numberValue(evidence.source_documents)} />
            <SmallMetric title="Версии" value={numberValue(evidence.source_versions)} />
            <SmallMetric title="Записи" value={numberValue(evidence.evidence_records)} />
            <SmallMetric title="Подтверждено" value={numberValue(evidence.verified_records)} accent={numberValue(evidence.verified_records) > 0} />
            <SmallMetric title="Доля проверки" value={`${verificationRate}%`} />
          </div>
          <div className="mt-4 rounded-[20px] border border-signal/20 bg-signal/[.045] p-4 text-sm leading-6 text-mist/65">{numberValue(evidence.verified_records) > 0 ? `Правило: ${text(evidence.policy, "Только официальные источники")}` : "Выводы остаются предварительными: первичные цитаты и требования ещё не подтверждены."}</div>
        </ReportBlock>

        <ReportBlock title="Состояние источников" subtitle="Технические сбои переведены в понятные категории" icon={<Activity size={19} />}>
          <IngestionStatus ingestion={ingestion} />
        </ReportBlock>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportBlock title="Новые изменения" subtitle="Что изменилось в официальных источниках" icon={<GitCompareArrows size={19} />}>
          <div className="space-y-3">{changes.length ? changes.slice(0, 8).map((change, index) => <article key={String(change.id ?? index)} className="clay-inset rounded-[22px] p-4"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><p className="text-[11px] text-signal">{label(change.change_type)}</p><h3 className="mt-2 break-words font-semibold leading-6">{text(change.document_title, "Изменение в официальном документе")}</h3></div><span className="text-[10px] text-mist/40">{dateLabel(change.detected_at)}</span></div><p className="mt-3 text-sm leading-6 text-mist/60">{text(change.summary)}</p>{typeof change.document_url === "string" && change.document_url && <a className="report-link" href={change.document_url} target="_blank" rel="noreferrer">Открыть документ <ArrowUpRight size={14} /></a>}</article>) : <Empty value="Новых подтверждённых изменений для проекта пока нет." />}</div>
        </ReportBlock>

        <ReportBlock title="Аналитические сигналы" subtitle="Сигнал не является фактом или основанием для участия" icon={<Radar size={19} />}>
          <div className="space-y-3">{signals.length ? signals.slice(0, 8).map((signal, index) => <article key={String(signal.id ?? index)} className="clay-inset rounded-[22px] p-4"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><p className="text-[11px] text-signal">{label(signal.signal_stage, label(signal.type))}</p><span className="text-xs font-semibold text-signal">{confidencePercent(signal.confidence)}%</span></div><h3 className="mt-2 break-words font-semibold leading-6">{text(signal.title)}</h3><p className="mt-2 text-sm leading-6 text-mist/60">{text(signal.summary)}</p><p className="mt-3 text-xs leading-5 text-mist/40">{label(signal.actionability_status, "Требует проверки")} · горизонт {numberValue(signal.horizon_months)} мес.</p></article>) : <Empty value="Проверенных сигналов для текущего профиля пока нет." />}</div>
        </ReportBlock>
      </div>

      <ReportBlock id="report-actions" title="Пошаговый маршрут" subtitle="Действия расположены по порядку и привязаны к ожидаемому результату" icon={<Route size={19} />}>
        <div className="grid gap-3 lg:grid-cols-2">{roadmap.length ? roadmap.map((step, index) => <NumberedCard key={`${text(step.title)}-${index}`} number={index + 1} title={text(step.title)} eyebrow={[text(step.stage, ""), text(step.authority, "")].filter(Boolean).join(" · ")} description={text(step.description)} footer={`Результат: ${text(step.expected_document)}`} />) : <Empty value="План появится после завершения анализа." />}</div>
      </ReportBlock>

      <ReportBlock title="Подключённые возможности" subtitle="Статус отражает реальные данные, а не наличие экрана" icon={<Sparkles size={19} />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{capabilities.length ? capabilities.map((item, index) => { const capabilityName = text(item.name); const forcedStatus = capabilityName === "Доказательная база" && numberValue(evidence.verified_records) === 0 ? "waiting" : capabilityName === "Разбор документов" && numberValue(documents.parsed) === 0 ? "waiting" : item.status; return <div key={`${capabilityName}-${index}`} className="clay-inset rounded-[22px] p-4"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><p className="min-w-0 font-medium leading-5">{capabilityName}</p><StatusBadge status={forcedStatus} /></div><p className="mt-3 text-xs leading-5 text-mist/55">{text(item.detail)}</p></div>; }) : <Empty value="Карта возможностей ещё формируется." />}</div>
      </ReportBlock>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportBlock title="Государственные приоритеты" subtitle="Почему направление может получить поддержку" icon={<FileText size={19} />}><CompactCards items={priorities} empty="Приоритеты пока не извлечены из официальных документов." /></ReportBlock>
        <ReportBlock title="Особенности территории" subtitle="Факторы региона и муниципалитета" icon={<MapPinned size={19} />}><CompactCards items={factors} empty="Территориальные факторы ещё уточняются." /></ReportBlock>
      </div>

      <ReportBlock title="Официальные источники отчёта" subtitle="Документы и ведомства, использованные в выводах" icon={<Database size={19} />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sources.length ? sources.map((source, index) => <div key={String(source.source_key ?? index)} className="clay-inset rounded-[20px] p-4"><p className="break-words font-medium leading-5">{text(source.name)}</p><p className="mt-2 text-xs text-mist/45">{label(source.level)} · {label(source.status)}</p>{typeof source.url === "string" && source.url && <a className="report-link text-xs" href={source.url} target="_blank" rel="noreferrer">Открыть источник <ArrowUpRight size={13} /></a>}</div>) : <Empty value="Источники для текущего отчёта ещё собираются." />}</div>
      </ReportBlock>
    </section>
  );
}

function MeasureCard({ measure }: { measure: Record<string, unknown> }) {
  const blockers = strings(measure.blockers);
  const missing = strings(measure.missing_data);
  const requirementMatrix = records(measure.requirement_matrix);
  const score = Math.max(0, Math.min(100, Math.round(numberValue(measure.score))));
  const status = text(measure.eligibility_status, "manual_review");
  const matched = requirementMatrix.filter((item) => ["matched", "verified", "match"].includes(text(item.status, ""))).length;

  return <article className="measure-card clay-inset rounded-[26px] p-4 sm:p-5">
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_72px] sm:items-start">
      <div className="min-w-0"><p className="text-[11px] font-medium text-signal">{label(measure.measure_type)}</p><h3 className="mt-2 break-words text-xl font-semibold leading-7">{text(measure.title)}</h3><p className="mt-2 text-xs leading-5 text-mist/50">{text(measure.authority)}</p></div>
      <div className="score-badge"><strong>{score}%</strong><span>совпадение</span></div>
    </div>
    <p className="mt-4 text-sm leading-6 text-mist/65">{text(measure.rationale, text(measure.summary, "Описание уточняется по официальному документу."))}</p>
    <div className="mt-4 flex flex-wrap gap-2"><StatusBadge status={status} /><StatusBadge status={measure.status} quiet /></div>
    {requirementMatrix.length ? <details className="requirement-details mt-4"><summary><span>Требования</span><span>{matched} из {requirementMatrix.length} выполнено</span><ChevronDown size={16} /></summary><div className="mt-3 space-y-2">{requirementMatrix.map((requirement, index) => <RequirementRow key={`${text(requirement.requirement_key)}-${index}`} requirement={requirement} index={index} />)}</div></details> : null}
    {blockers.length ? <MiniList title="Что мешает" items={blockers} emphasized /> : null}
    {missing.length ? <MiniList title="Что нужно подтвердить" items={missing} /> : null}
    {typeof measure.official_url === "string" && measure.official_url && <a className="report-link" href={measure.official_url} target="_blank" rel="noreferrer">Официальный источник <ArrowUpRight size={14} /></a>}
  </article>;
}

function RequirementRow({ requirement, index }: { requirement: Record<string, unknown>; index: number }) {
  const actual = displayValue(requirement.actual);
  const locator = text(requirement.source_locator, "");
  return <div className="requirement-row rounded-[18px] border border-white/[.07] p-3.5">
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"><p className="min-w-0 text-sm font-medium leading-5">{text(requirement.label, `Требование ${index + 1}`)}</p><StatusBadge status={requirement.status} /></div>
    <div className="mt-3 grid gap-2 text-xs leading-5 text-mist/55 sm:grid-cols-[120px_minmax(0,1fr)]"><span className="text-mist/35">Факт проекта</span><span className="min-w-0 break-words">{actual}</span>{locator ? <><span className="text-mist/35">Основание</span><span className="min-w-0 break-words">{locator}</span></> : null}</div>
  </div>;
}

function IngestionStatus({ ingestion }: { ingestion: NonNullable<GovernmentOpportunityReportData["ingestion_health"]> }) {
  const latest = ingestion.latest_run ?? {};
  const failures = ingestion.recent_failures ?? [];
  const uniqueFailures = Array.from(new Map(failures.map((failure) => [text(failure.source_key, String(Math.random())), failure])).values()).slice(0, 6);
  return <div>
    <div className="grid grid-cols-2 gap-3"><SmallMetric title="Точки сбора" value={numberValue(ingestion.active_endpoints)} accent /><SmallMetric title="В очереди" value={numberValue(ingestion.queued_sources)} /><SmallMetric title="Обработано" value={numberValue(latest.sources_processed)} /><SmallMetric title="Ошибок" value={numberValue(latest.failed_count)} /></div>
    <div className="mt-4 clay-inset rounded-[20px] p-4"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><p className="font-medium">Последнее обновление</p><StatusBadge status={latest.status} /></div><p className="mt-2 text-xs leading-5 text-mist/45">{dateLabel(latest.finished_at ?? latest.started_at)} · найдено {numberValue(latest.discovered_count)} · сохранено {numberValue(latest.persisted_count)}</p></div>
    {uniqueFailures.length ? <details className="requirement-details mt-4"><summary><span>Нужна повторная проверка</span><span>{uniqueFailures.length} источников</span><ChevronDown size={16} /></summary><div className="mt-3 space-y-2">{uniqueFailures.map((failure, index) => <SourceFailure key={`${text(failure.source_key)}-${index}`} failure={failure} />)}</div></details> : <div className="mt-4 rounded-[20px] border border-white/[.07] p-4 text-sm text-mist/55">Серьёзных ошибок последнего запуска нет.</div>}
  </div>;
}

function SourceFailure({ failure }: { failure: Record<string, unknown> }) {
  const friendly = friendlySourceError(failure);
  return <div className="rounded-[18px] border border-signal/15 bg-signal/[.03] p-3.5"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><p className="break-words text-sm font-medium">{friendly.title}</p><p className="mt-1 text-xs leading-5 text-mist/50">{friendly.detail}</p></div><span className="status-chip">{friendly.category}</span></div><details className="technical-details mt-2"><summary>Технические сведения</summary><p>{text(failure.source_key, "Источник")}</p>{friendly.url ? <p>{friendly.url}</p> : null}<p>{friendly.technical}</p></details></div>;
}

function ReportBlock({ id, title, subtitle, icon, children }: { id?: string; title: string; subtitle: string; icon: ReactNode; children: ReactNode }) {
  return <section id={id} className="glass-surface scroll-mt-24 rounded-[28px] p-4 sm:p-6"><div className="mb-5 grid grid-cols-[40px_minmax(0,1fr)] items-start gap-3"><div className="brand-mark h-10 w-10 rounded-[16px]">{icon}</div><div className="min-w-0"><h2 className="text-xl font-semibold leading-7">{title}</h2><p className="mt-1 text-xs leading-5 text-mist/45">{subtitle}</p></div></div>{children}</section>;
}

function Metric({ icon, title, value, note }: { icon: ReactNode; title: string; value: string; note: string }) {
  return <div className="glass-surface min-w-0 rounded-[24px] p-4"><span className="text-signal">{icon}</span><p className="mt-4 break-words text-3xl font-semibold tracking-[-.04em]">{value}</p><p className="mt-2 text-sm text-mist/60">{title}</p><p className="mt-1 break-words text-[11px] leading-4 text-mist/35">{note}</p></div>;
}

function ReadinessIndex({ title, value }: { title: string; value: number }) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  return <div className="clay-inset rounded-[20px] p-4"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><p className="text-xs text-mist/55">{title}</p><span className="text-sm font-semibold text-signal">{bounded}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-signal" style={{ width: `${bounded}%` }} /></div></div>;
}

function TruthFlag({ ready, label: value }: { ready: boolean; label: string }) {
  return <div className="flex items-start gap-2 rounded-2xl border border-white/[.07] px-3 py-2.5 leading-5 text-mist/55">{ready ? <CheckCircle2 className="mt-0.5 shrink-0 text-signal" size={14} /> : <CircleDashed className="mt-0.5 shrink-0 text-mist/35" size={14} />}<span>{value}</span></div>;
}

function StatusBadge({ status, quiet = false }: { status: unknown; quiet?: boolean }) {
  const source = text(status, "unknown");
  const positive = ["match", "matched", "verified", "completed", "ready", "healthy", "active", "parsed"].includes(source);
  return <span className={`status-chip ${positive && !quiet ? "status-chip-active" : ""}`}>{label(source)}</span>;
}

function SmallMetric({ title, value, accent = false }: { title: string; value: number | string; accent?: boolean }) {
  return <div className="clay-inset min-w-0 rounded-[20px] p-3.5 sm:p-4"><p className="break-words text-[11px] leading-4 text-mist/45">{title}</p><p className={`mt-3 break-words text-2xl font-semibold ${accent ? "text-signal" : "text-mist"}`}>{value}</p></div>;
}

function Fact({ title, value, ready }: { title: string; value: string; ready?: boolean }) {
  return <div className="clay-inset min-w-0 rounded-[20px] p-4"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><p className="text-xs text-mist/45">{title}</p>{typeof ready === "boolean" ? <StatusBadge status={ready ? "ready" : "needs_data"} /> : null}</div><p className="mt-2 break-words text-sm leading-6">{value}</p></div>;
}

function MiniList({ title, items, emphasized = false }: { title: string; items: string[]; emphasized?: boolean }) {
  return <div className={`mt-4 rounded-[20px] border p-4 ${emphasized ? "border-signal/20 bg-signal/[.035]" : "border-white/[.07]"}`}><p className="text-xs font-medium text-mist/60">{title}</p><ul className="mt-2 space-y-2 text-sm leading-6 text-mist/55">{items.map((item, index) => <li key={`${item}-${index}`} className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" /><span className="min-w-0 break-words">{item}</span></li>)}</ul></div>;
}

function Empty({ value }: { value: string }) {
  return <div className="col-span-full rounded-[22px] border border-dashed border-white/10 p-5 text-sm leading-6 text-mist/45">{value}</div>;
}

function NumberedCard({ number, title, description, eyebrow, footer }: { number: number; title: string; description: string; eyebrow?: string; footer?: string }) {
  return <article className="clay-inset rounded-[22px] p-4"><div className="grid grid-cols-[32px_minmax(0,1fr)] items-start gap-3"><span className="grid h-8 w-8 place-items-center rounded-xl bg-signal text-sm font-semibold text-ink">{number}</span><div className="min-w-0"><h3 className="break-words font-semibold leading-6">{title}</h3>{eyebrow ? <p className="mt-1 text-xs leading-5 text-signal">{eyebrow}</p> : null}<p className="mt-2 text-sm leading-6 text-mist/60">{description}</p>{footer ? <p className="mt-3 text-xs leading-5 text-mist/45">{footer}</p> : null}</div></div></article>;
}

function CompactCards({ items, empty }: { items: Array<Record<string, unknown>>; empty: string }) {
  if (!items.length) return <Empty value={empty} />;
  return <div className="space-y-3">{items.map((item, index) => <article key={String(item.id ?? item.title ?? index)} className="clay-inset rounded-[20px] p-4"><h3 className="break-words font-semibold leading-6">{text(item.title)}</h3><p className="mt-2 text-sm leading-6 text-mist/60">{text(item.description, text(item.summary, text(item.authority)))}</p>{typeof item.official_url === "string" && item.official_url && <a className="report-link" href={item.official_url} target="_blank" rel="noreferrer">Официальный документ <ArrowUpRight size={14} /></a>}</article>)}</div>;
}
