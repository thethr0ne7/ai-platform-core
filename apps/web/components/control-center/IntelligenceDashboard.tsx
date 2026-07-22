'use client'

import type { ReactNode } from 'react'
import { BrainCircuit, CheckCircle2, GitBranch, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react'
import { useGovernmentIntelligence } from '@/hooks/useGovernmentIntelligence'

type View = 'overview' | 'trajectories' | 'graph' | 'decision-cards'

const labels: Record<string, string> = {
  manual_review: 'Нужна проверка',
  completed: 'Завершено',
  failed: 'Ошибка',
  running: 'В работе',
  published: 'Опубликовано',
  draft: 'Черновик',
  rejected: 'Отклонено',
  mismatch: 'Не подходит',
  match: 'Подходит',
  insufficient_data: 'Недостаточно данных',
  mention: 'Упоминание',
  not_actionable: 'Не является готовой возможностью',
  up: 'Рост',
  down: 'Снижение',
  stable: 'Без изменений',
  emerging: 'Формируется',
  terminating: 'Завершается',
  insufficient_history: 'Недостаточно истории',
  project_report: 'Отчёт по проекту',
  official_source: 'Официальный источник',
  project_document: 'Документ проекта',
  mixed: 'Смешанный анализ',
  organization: 'Организации',
  authority: 'Органы власти',
  person: 'Люди',
  official: 'Должностные лица',
  programme: 'Программы',
  support_measure: 'Меры поддержки',
  territory: 'Территории',
  date: 'Даты',
  money: 'Суммы',
  indicator: 'Показатели',
  legal_document: 'Нормативные документы',
  project: 'Проекты',
  other: 'Другие сущности',
  funding_increase: 'Увеличение финансирования',
  funding_reduction: 'Сокращение финансирования',
  new_support_measure: 'Новая мера поддержки',
  eligibility_change: 'Изменение условий участия',
  territorial_priority: 'Территориальный приоритет',
  sector_priority: 'Отраслевой приоритет',
  application_window: 'Срок подачи заявок',
  legal_constraint: 'Правовое ограничение',
  budget_commitment: 'Бюджетное обязательство',
  procurement_activity: 'Закупочная активность',
  institutional_narrative: 'Повторяющаяся государственная тема',
  early_policy_signal: 'Ранний государственный сигнал',
  programme_termination: 'Завершение программы',
  rhetoric: 'Публичная риторика',
  programme: 'Программа',
  budget: 'Бюджет',
  legal_act: 'Нормативный акт',
  procurement: 'Закупка',
  manages: 'Управляет',
  applies_in: 'Действует на территории',
  intended_for: 'Предназначена для',
  territorial_scope: 'Территория действия',
  requires_primary_evidence: 'Требует первичного источника',
  has_requirement: 'Содержит требование',
  agriculture: 'Сельское хозяйство',
  rural_development: 'Развитие сельских территорий',
  tourism: 'Туризм',
  technology: 'Технологии',
  industry: 'Промышленность',
  export: 'Экспорт',
  control: 'Контроль и отчётность',
}

const contractLabels: Record<string, string> = {
  signal_is_fact: 'Сигнал не считается подтверждённым фактом',
  trend_is_requirement: 'Тенденция не считается обязательным требованием',
  forecast_is_eligibility: 'Прогноз не определяет соответствие условиям',
  narrative_is_legal_basis: 'Повторяющаяся тема не является правовым основанием',
}

function value(source: unknown, fallback = '—') {
  return typeof source === 'string' || typeof source === 'number' ? String(source) : fallback
}

function translated(source: unknown, fallback = '—') {
  const raw = value(source, fallback)
  return labels[raw] ?? raw
}

function metricValue(source: unknown) {
  const raw = value(source, '—')
  const parsed = Date.parse(raw)
  if (raw.includes('T') && Number.isFinite(parsed)) {
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(parsed)
  }
  return translated(raw)
}

export function IntelligenceDashboard({ view = 'overview' }: { view?: View }) {
  const { data, loading, error } = useGovernmentIntelligence()
  const totals = data?.totals ?? {}

  if (loading) return <div className="glass-surface rounded-[28px] p-6 text-sm text-mist/55">Загружаем аналитическое ядро…</div>
  if (error || !data) return <div className="glass-surface rounded-[28px] p-6 text-sm text-mist/55">{error ?? 'Данных пока нет.'}</div>

  return (
    <div className="space-y-4">
      <section className="glass-surface overflow-hidden rounded-[30px] p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="status-pill"><BrainCircuit size={15} /> VER436SIA работает внутри основной платформы</div>
            <h2 className="mt-4 text-3xl font-semibold sm:text-5xl">Движок государственной аналитики</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-mist/60">Сущности, события, связи, траектории, повторяющиеся темы и прогнозы работают только как аналитический слой. Юридические выводы определяются доказательствами, проверкой условий и финальной проверкой фактов.</p>
          </div>
          <div className="clay-inset rounded-[22px] p-4 text-sm">
            <p className="text-mist/40">Версия движка</p>
            <p className="mt-2 font-semibold text-signal">{data.engine_version}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Запуски анализа" number={totals.runs} />
        <Metric title="Найденные сущности" number={totals.entities} />
        <Metric title="Связи в графе" number={totals.relations} />
        <Metric title="Карточки решений" number={totals.decision_cards} note={`опубликовано: ${value(totals.published_decision_cards, '0')}`} />
      </div>

      {view === 'overview' && <Overview data={data} />}
      {view === 'trajectories' && <Rows title="Траектории" icon={<TrendingUp size={18} />} rows={data.trajectories ?? []} primary="signal_type" secondary="direction" metric="average_confidence" />}
      {view === 'graph' && <Rows title="Граф связей" icon={<GitBranch size={18} />} rows={data.relation_types ?? []} primary="predicate" metric="count" />}
      {view === 'decision-cards' && <Rows title="Карточки решений" icon={<CheckCircle2 size={18} />} rows={data.decision_cards ?? []} primary="eligibility_status" secondary="publish_status" metric="count" />}

      <section className="glass-surface rounded-[28px] p-5 sm:p-6">
        <div className="flex items-center gap-3"><ShieldCheck className="text-signal" size={19} /><h3 className="text-xl font-semibold">Непереходимые границы</h3></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Object.entries(data.epistemic_contract ?? {}).map(([key]) => (
            <div key={key} className="clay-inset flex gap-3 rounded-[18px] p-4 text-sm">
              <ShieldCheck className="mt-0.5 shrink-0 text-signal" size={16} />
              <span>{contractLabels[key] ?? key}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Overview({ data }: { data: NonNullable<ReturnType<typeof useGovernmentIntelligence>['data']> }) {
  return <div className="grid gap-4 xl:grid-cols-2">
    <Rows title="Сигналы" icon={<Sparkles size={18} />} rows={data.signal_types ?? []} primary="type" secondary="stage" metric="count" />
    <Rows title="Последние запуски" icon={<BrainCircuit size={18} />} rows={data.latest_runs ?? []} primary="input_kind" secondary="status" metric="created_at" />
    <Rows title="Сущности" icon={<GitBranch size={18} />} rows={data.entity_types ?? []} primary="type" metric="count" />
    <Rows title="Повторяющиеся темы" icon={<TrendingUp size={18} />} rows={data.narratives ?? []} primary="theme" secondary="transition_stage" metric="count" />
  </div>
}

function Metric({ title, number, note }: { title: string; number: unknown; note?: string }) {
  return <div className="glass-surface rounded-[24px] p-4"><p className="text-xs text-mist/45">{title}</p><p className="mt-4 text-3xl font-semibold text-signal">{value(number, '0')}</p>{note && <p className="mt-2 text-[11px] text-mist/35">{note}</p>}</div>
}

function Rows({ title, icon, rows, primary, secondary, metric }: { title: string; icon: ReactNode; rows: Array<Record<string, unknown>>; primary: string; secondary?: string; metric?: string }) {
  return (
    <section className="glass-surface rounded-[28px] p-5 sm:p-6">
      <div className="flex items-center gap-3"><span className="text-signal">{icon}</span><h3 className="text-xl font-semibold">{title}</h3></div>
      <div className="mt-4 space-y-2">
        {rows.length ? rows.slice(0, 12).map((row, index) => (
          <div key={`${value(row[primary])}-${index}`} className="clay-inset flex min-w-0 items-center justify-between gap-3 rounded-[18px] p-4">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">{translated(row[primary])}</p>
              {secondary ? <p className="mt-1 break-words text-xs text-mist/40">{translated(row[secondary])}</p> : null}
            </div>
            {metric ? <span className="shrink-0 text-sm font-semibold text-signal">{metricValue(row[metric])}</span> : null}
          </div>
        )) : <p className="rounded-[18px] border border-dashed border-white/10 p-4 text-sm text-mist/45">Данные появятся после нового анализа проекта.</p>}
      </div>
    </section>
  )
}
