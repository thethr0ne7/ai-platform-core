'use client'

import { BrainCircuit, CheckCircle2, GitBranch, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react'
import { useGovernmentIntelligence } from '@/hooks/useGovernmentIntelligence'

type View = 'overview' | 'trajectories' | 'graph' | 'decision-cards'

const labels: Record<string, string> = {
  manual_review: 'Нужна проверка', completed: 'Завершено', failed: 'Ошибка', running: 'В работе',
  published: 'Опубликовано', draft: 'Черновик', mismatch: 'Не подходит', match: 'Подходит',
  insufficient_data: 'Недостаточно данных', mention: 'Упоминание', not_actionable: 'Не является возможностью',
  up: 'Рост', down: 'Снижение', stable: 'Стабильно', emerging: 'Формируется', insufficient_history: 'Мало истории',
}

function value(source: unknown, fallback = '—') {
  return typeof source === 'string' || typeof source === 'number' ? String(source) : fallback
}

export function IntelligenceDashboard({ view = 'overview' }: { view?: View }) {
  const { data, loading, error } = useGovernmentIntelligence()
  const totals = data?.totals ?? {}

  if (loading) return <div className="glass-surface rounded-[28px] p-6 text-sm text-mist/55">Загружаем аналитическое ядро…</div>
  if (error || !data) return <div className="glass-surface rounded-[28px] p-6 text-sm text-mist/55">{error ?? 'Нет данных.'}</div>

  return (
    <div className="space-y-4">
      <section className="glass-surface overflow-hidden rounded-[30px] p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="status-pill"><BrainCircuit size={15} /> VER436SIA внутри AI Platform Core</div>
            <h2 className="mt-4 text-3xl font-semibold sm:text-5xl">Government Intelligence Engine</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-mist/60">Сущности, события, связи, траектории, нарративы и прогнозы работают только как аналитический слой. Юридические выводы по-прежнему определяются Evidence Layer, eligibility и Truth Gate.</p>
          </div>
          <div className="clay-inset rounded-[22px] p-4 text-sm">
            <p className="text-mist/40">Движок</p><p className="mt-2 font-semibold text-signal">{data.engine_version}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Запуски" number={totals.runs} />
        <Metric title="Сущности" number={totals.entities} />
        <Metric title="Связи графа" number={totals.relations} />
        <Metric title="Карточки решений" number={totals.decision_cards} note={`опубликовано ${value(totals.published_decision_cards, '0')}`} />
      </div>

      {view === 'overview' && <Overview data={data} />}
      {view === 'trajectories' && <Rows title="Траектории" icon={<TrendingUp size={18} />} rows={data.trajectories ?? []} primary="signal_type" secondary="direction" metric="average_confidence" />}
      {view === 'graph' && <Rows title="Граф отношений" icon={<GitBranch size={18} />} rows={data.relation_types ?? []} primary="predicate" secondary="count" />}
      {view === 'decision-cards' && <Rows title="Карточки решений" icon={<CheckCircle2 size={18} />} rows={data.decision_cards ?? []} primary="eligibility_status" secondary="publish_status" metric="count" />}

      <section className="glass-surface rounded-[28px] p-5 sm:p-6">
        <div className="flex items-center gap-3"><ShieldCheck className="text-signal" size={19} /><h3 className="text-xl font-semibold">Непереходимые границы</h3></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Object.entries(data.epistemic_contract ?? {}).map(([key, allowed]) => <div key={key} className="clay-inset rounded-[18px] p-4 text-sm"><span className="text-signal">{allowed ? '●' : '○'}</span> {key.replaceAll('_', ' ')}</div>)}
        </div>
      </section>
    </div>
  )
}

function Overview({ data }: { data: NonNullable<ReturnType<typeof useGovernmentIntelligence>['data']> }) {
  return <div className="grid gap-4 xl:grid-cols-2">
    <Rows title="Сигналы" icon={<Sparkles size={18} />} rows={data.signal_types ?? []} primary="type" secondary="stage" metric="count" />
    <Rows title="Последние запуски" icon={<BrainCircuit size={18} />} rows={data.latest_runs ?? []} primary="engine_version" secondary="status" metric="created_at" />
    <Rows title="Сущности" icon={<GitBranch size={18} />} rows={data.entity_types ?? []} primary="type" secondary="count" />
    <Rows title="Нарративы" icon={<TrendingUp size={18} />} rows={data.narratives ?? []} primary="theme" secondary="transition_stage" metric="count" />
  </div>
}

function Metric({ title, number, note }: { title: string; number: unknown; note?: string }) {
  return <div className="glass-surface rounded-[24px] p-4"><p className="text-xs text-mist/45">{title}</p><p className="mt-4 text-3xl font-semibold text-signal">{value(number, '0')}</p>{note && <p className="mt-2 text-[11px] text-mist/35">{note}</p>}</div>
}

function Rows({ title, icon, rows, primary, secondary, metric }: { title: string; icon: React.ReactNode; rows: Array<Record<string, unknown>>; primary: string; secondary: string; metric?: string }) {
  return <section className="glass-surface rounded-[28px] p-5 sm:p-6"><div className="flex items-center gap-3"><span className="text-signal">{icon}</span><h3 className="text-xl font-semibold">{title}</h3></div><div className="mt-4 space-y-2">{rows.length ? rows.slice(0, 12).map((row, index) => <div key={`${value(row[primary])}-${index}`} className="clay-inset flex min-w-0 items-center justify-between gap-3 rounded-[18px] p-4"><div className="min-w-0"><p className="break-words text-sm font-medium">{labels[value(row[primary], '')] ?? value(row[primary])}</p><p className="mt-1 break-words text-xs text-mist/40">{labels[value(row[secondary], '')] ?? value(row[secondary])}</p></div>{metric && <span className="shrink-0 text-sm font-semibold text-signal">{value(row[metric])}</span>}</div>) : <p className="rounded-[18px] border border-dashed border-white/10 p-4 text-sm text-mist/45">Данные появятся после нового анализа проекта.</p>}</div></section>
}
