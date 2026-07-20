"use client";

import { AlertTriangle, ArrowUpRight, CheckCircle2, FileText, Landmark, MapPinned, Route, Target } from "lucide-react";

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
  metadata?: Record<string, unknown>;
};

function text(value: unknown, fallback = "—") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function GovernmentOpportunityReport({ report }: { report: GovernmentOpportunityReportData }) {
  const summary = report.executive_summary ?? {};
  const measures = report.support_measures ?? [];
  const priorities = report.national_priorities ?? [];
  const factors = report.territorial_context?.factors ?? [];
  const roadmap = report.roadmap ?? [];
  const sources = report.sources ?? [];

  return (
    <section className="mt-6 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Меры поддержки" value={String(measures.length)} />
        <Metric label="Приоритеты" value={String(priorities.length)} />
        <Metric label="Территориальные факторы" value={String(factors.length)} />
        <Metric label="Официальные источники" value={String(sources.length)} />
      </div>

      <div className="rounded-[24px] border border-white/10 bg-white/[.025] p-5">
        <div className="flex items-start gap-3"><Target className="mt-1 shrink-0 text-signal" size={20} /><div><h2 className="text-xl font-semibold">Вывод по проекту</h2><p className="mt-2 text-sm leading-6 text-mist">{text(summary.conclusion)}</p></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Fact label="Регион" value={text(summary.region)} />
          <Fact label="Направление" value={text(summary.activity)} />
          <Fact label="Форма заявителя" value={text(summary.legal_form, "Не выбрана")} />
          <Fact label="Земля" value={text(summary.land_status, "Не подтверждена")} />
        </div>
      </div>

      {report.blockers?.length > 0 && (
        <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/[.04] p-5">
          <div className="flex items-center gap-2"><AlertTriangle size={18} /><h2 className="font-semibold">Критические блокеры</h2></div>
          <ul className="mt-3 space-y-2 text-sm text-mist">{report.blockers.map((item) => <li key={item}>• {item}</li>)}</ul>
        </div>
      )}

      <ReportList title="Подходящие меры поддержки" icon={<Landmark size={19} />} empty="Подтверждённые меры пока не загружены в реестр официальных источников.">
        {measures.map((measure) => (
          <article key={String(measure.id)} className="rounded-2xl border border-white/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{text(measure.title)}</h3><p className="mt-1 text-xs text-mist">{text(measure.authority)} · {text(measure.level)}</p></div><span className="rounded-full border border-white/10 px-2.5 py-1 text-xs">{String(measure.score ?? 0)}%</span></div>
            <p className="mt-3 text-sm leading-6 text-mist">{text(measure.summary, "Описание будет добавлено после подтверждённого извлечения из официального документа.")}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white/[.04] px-2.5 py-1">{text(measure.measure_type)}</span><span className="rounded-full bg-white/[.04] px-2.5 py-1">{text(measure.eligibility_status)}</span></div>
            {typeof measure.official_url === "string" && measure.official_url && <a className="mt-3 inline-flex items-center gap-1 text-sm text-signal" href={measure.official_url} target="_blank" rel="noreferrer">Официальный источник <ArrowUpRight size={14} /></a>}
          </article>
        ))}
      </ReportList>

      <ReportList title="Национальные и отраслевые приоритеты" icon={<FileText size={19} />} empty="Приоритеты пока не извлечены из официальных документов.">
        {priorities.map((item) => <article key={String(item.id ?? item.title)} className="rounded-2xl border border-white/10 p-4"><h3 className="font-semibold">{text(item.title)}</h3><p className="mt-2 text-sm text-mist">{text(item.authority)}</p>{typeof item.official_url === "string" && item.official_url && <a className="mt-3 inline-flex items-center gap-1 text-sm text-signal" href={item.official_url} target="_blank" rel="noreferrer">Документ <ArrowUpRight size={14} /></a>}</article>)}
      </ReportList>

      <ReportList title="Территориальные особенности" icon={<MapPinned size={19} />} empty="Официальные территориальные факторы ещё не загружены.">
        {factors.map((item) => <article key={String(item.id ?? item.title)} className="rounded-2xl border border-white/10 p-4"><h3 className="font-semibold">{text(item.title)}</h3><p className="mt-2 text-sm leading-6 text-mist">{text(item.description)}</p></article>)}
      </ReportList>

      <ReportList title="Путь реализации" icon={<Route size={19} />} empty="Маршрут не сформирован.">
        {roadmap.map((step, index) => <article key={`${String(step.title)}-${index}`} className="rounded-2xl border border-white/10 p-4"><div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-xs">{index + 1}</span><div><h3 className="font-semibold">{text(step.title)}</h3><p className="mt-1 text-xs text-mist">{text(step.stage)} · {text(step.authority)}</p><p className="mt-2 text-sm leading-6 text-mist">{text(step.description)}</p><p className="mt-2 text-xs">Результат: {text(step.expected_document)}</p></div></div></article>)}
      </ReportList>

      <div className="rounded-[24px] border border-white/10 p-5">
        <div className="flex items-center gap-2"><CheckCircle2 size={18} /><h2 className="font-semibold">Статус источников</h2></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{sources.map((source) => <div key={String(source.source_key)} className="rounded-xl bg-white/[.03] p-3"><p className="text-sm">{text(source.name)}</p><p className="mt-1 text-xs text-mist">{text(source.level)} · {text(source.status)}</p></div>)}</div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-xs text-mist">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>; }
function Fact({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-white/[.03] p-3"><p className="text-xs text-mist">{label}</p><p className="mt-1 text-sm">{value}</p></div>; }
function ReportList({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode }) { const list = Array.isArray(children) ? children : [children]; const has = list.some(Boolean); return <div className="rounded-[24px] border border-white/10 p-5"><div className="flex items-center gap-2">{icon}<h2 className="font-semibold">{title}</h2></div><div className="mt-4 space-y-3">{has ? children : <p className="text-sm leading-6 text-mist">{empty}</p>}</div></div>; }
