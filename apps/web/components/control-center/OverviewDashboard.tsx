'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  Activity,
  ArrowUpRight,
  BookOpenText,
  Building2,
  CheckCircle2,
  Database,
  FileSearch,
  ListChecks,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useCoverage } from '@/hooks/useCoverage'
import { usePlatformStats } from '@/hooks/usePlatformStats'

export function OverviewDashboard() {
  const stats = usePlatformStats()
  const coverage = useCoverage()
  const snapshot = coverage.data

  const institutionsCatalog = numberValue(snapshot, 'institutions_catalog')
  const institutionsReady = numberValue(snapshot, 'institutions_route_ready')
  const programsTotal = numberValue(snapshot, 'programs_total') || stats.data?.programs_total || 0
  const programsVerified = numberValue(snapshot, 'programs_verified')
  const jobsTotal = numberValue(snapshot, 'jobs_total') || stats.data?.ingestion_jobs_total || 0
  const jobsDone = numberValue(snapshot, 'jobs_done')
  const jobsFailed = numberValue(snapshot, 'jobs_failed')

  return (
    <main className="space-y-4 py-4">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
        <article className="glass-surface relative overflow-hidden rounded-[34px] p-6 md:p-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-signal/[.08] blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-signal/25 bg-signal/[.1] px-3 py-2 text-[11px] font-medium text-signal">
              <span className="signal-dot" /> Система работает
            </span>

            <h2 className="mt-8 max-w-4xl text-[clamp(2.35rem,5vw,5rem)] font-semibold leading-[.94] tracking-[-.06em] text-mist">
              Видно, что происходит и что делать дальше.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-mist/55 md:text-base">
              Здесь собраны данные, программы поддержки, состояние источников и работа производственного контура.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="primary-cta" href="/control-center/government">
                Смотреть программы <ArrowUpRight size={16} />
              </Link>
              <Link className="secondary-cta" href="/control-center/health">
                Проверить систему <Activity size={16} />
              </Link>
            </div>
          </div>
        </article>

        <article className="glass-surface rounded-[34px] p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Коротко о главном</p>
              <h3 className="section-title">Текущее состояние</h3>
            </div>
            <div className="brand-mark h-11 w-11">
              <Sparkles size={18} />
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <StateTile label="Источники" value="Подключены" />
            <StateTile label="Проверка данных" value="Включена" />
            <StateTile label="Публикация" value="Автоматическая" />
            <StateTile label="Основная версия" value="Работает" />
          </div>
        </article>
      </section>

      {stats.error ? <StatusPanel title="Не удалось получить общие показатели" message={stats.error} /> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={<Building2 size={19} />} label="Организации" value={stats.data?.institutions_total} loading={stats.loading} />
        <MetricCard icon={<BookOpenText size={19} />} label="Программы" value={stats.data?.programs_total} loading={stats.loading} />
        <MetricCard icon={<RadioTower size={19} />} label="Источники" value={stats.data?.sources_total} loading={stats.loading} />
        <MetricCard icon={<ListChecks size={19} />} label="Задачи на сбор" value={stats.data?.ingestion_jobs_total} loading={stats.loading} />
        <MetricCard icon={<Sparkles size={19} />} label="Запуски фабрики" value={stats.data?.factory_runs_total} loading={stats.loading} />
      </section>

      <section className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
        <article className="glass-surface rounded-[32px] p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Готовность данных</p>
              <h3 className="section-title">Насколько заполнена база</h3>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-signal/25 bg-signal/[.08] px-3 py-2 text-[11px] font-medium text-signal">
              <RefreshCw size={14} /> {coverage.loading ? 'Обновляем' : coverage.error ? 'Нужна проверка' : 'Данные получены'}
            </span>
          </div>

          {coverage.error ? (
            <StatusPanel title="Не удалось получить данные о заполнении" message={coverage.error} compact />
          ) : (
            <div className="mt-7 space-y-6">
              <ProgressRow
                title="Организации готовы к поиску"
                current={institutionsReady}
                total={institutionsCatalog}
                detail={`${institutionsReady.toLocaleString('ru-RU')} из ${institutionsCatalog.toLocaleString('ru-RU')}`}
              />
              <ProgressRow
                title="Программы подтверждены источниками"
                current={programsVerified}
                total={programsTotal}
                detail={`${programsVerified.toLocaleString('ru-RU')} подтверждено`}
              />
              <ProgressRow
                title="Задачи по сбору выполнены"
                current={jobsDone}
                total={jobsTotal}
                detail={`${jobsFailed.toLocaleString('ru-RU')} требуют внимания`}
              />
            </div>
          )}

          <div className="mt-7 grid gap-3 md:grid-cols-3">
            <SmallNumber label="Всего организаций" value={institutionsCatalog} />
            <SmallNumber label="Готовы к поиску" value={institutionsReady} accent />
            <SmallNumber label="Ошибки сбора" value={jobsFailed} />
          </div>
        </article>

        <article className="glass-surface rounded-[32px] p-5 md:p-7">
          <div className="section-head">
            <div>
              <p className="eyebrow">Порядок работы</p>
              <h3 className="section-title">Как проходит задача</h3>
            </div>
            <ShieldCheck size={19} className="text-signal" />
          </div>

          <div className="space-y-3">
            <StepRow number="1" title="Понять цель" status="Готово" done />
            <StepRow number="2" title="Составить план" status="Готово" done />
            <StepRow number="3" title="Собрать решение" status="В работе" active />
            <StepRow number="4" title="Проверить результат" status="Далее" />
            <StepRow number="5" title="Опубликовать" status="Далее" />
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)]">
        <article className="glass-surface rounded-[32px] p-5 md:p-7">
          <div className="section-head">
            <div>
              <p className="eyebrow">Подключённые части</p>
              <h3 className="section-title">Что уже работает</h3>
            </div>
            <FileSearch size={19} className="text-signal" />
          </div>
          <div className="space-y-3">
            <ModuleRow name="Поиск мер поддержки" status="Работает" />
            <ModuleRow name="Проверка официальных источников" status="Работает" />
            <ModuleRow name="Автоматический сбор данных" status="Готов" />
            <ModuleRow name="Память решений" status="Под защитой" />
          </div>
        </article>

        <article className="glass-surface rounded-[32px] p-5 md:p-7">
          <div className="section-head">
            <div>
              <p className="eyebrow">Последние запуски</p>
              <h3 className="section-title">Что происходило недавно</h3>
            </div>
            <span className="flex items-center gap-2 text-[11px] text-signal"><span className="signal-dot" /> Обновляется</span>
          </div>

          <div className="space-y-3">
            {stats.loading ? (
              <div className="clay-inset rounded-[22px] p-5 text-sm text-mist/45">Получаем последние запуски…</div>
            ) : stats.data?.recent_runs.length ? (
              stats.data.recent_runs.map((run, index) => (
                <div key={run.id ?? index} className="clay-inset grid gap-3 rounded-[22px] p-4 md:grid-cols-[40px_minmax(0,1fr)_110px] md:items-center">
                  <span className="grid h-9 w-9 place-items-center rounded-[14px] bg-mist/[.05] text-xs text-mist/40">{index + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-mist/85">Запуск производственного контура</p>
                    <p className="mt-1 text-[11px] text-mist/40">{formatTimestamp(run.started_at)}</p>
                  </div>
                  <span className="w-fit rounded-full border border-signal/25 bg-signal/[.08] px-3 py-1.5 text-[10px] font-medium text-signal md:justify-self-end">
                    {translateStatus(run.status)}
                  </span>
                </div>
              ))
            ) : (
              <div className="clay-inset rounded-[22px] p-7 text-center">
                <CheckCircle2 className="mx-auto text-signal" size={24} />
                <p className="mt-3 text-sm font-medium">Журнал готов</p>
                <p className="mt-1 text-xs text-mist/45">Новые события появятся после следующего запуска.</p>
              </div>
            )}
          </div>
        </article>
      </section>
    </main>
  )
}

function MetricCard({ icon, label, value, loading }: { icon: ReactNode; label: string; value?: number; loading: boolean }) {
  return (
    <article className="glass-surface group rounded-[28px] p-5 transition duration-300 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-[17px] border border-signal/20 bg-signal/[.09] text-signal">{icon}</div>
        <ArrowUpRight size={15} className="text-mist/20 transition group-hover:text-signal" />
      </div>
      <strong className="mt-7 block text-4xl font-semibold tabular-nums tracking-[-.05em] text-mist">
        {loading ? '…' : (value ?? 0).toLocaleString('ru-RU')}
      </strong>
      <p className="mt-2 text-xs text-mist/45">{label}</p>
    </article>
  )
}

function StateTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="clay-inset rounded-[20px] p-4">
      <p className="text-[11px] text-mist/40">{label}</p>
      <p className="mt-2 flex items-center gap-2 text-sm font-medium text-mist/85"><span className="signal-dot" /> {value}</p>
    </div>
  )
}

function ProgressRow({ title, current, total, detail }: { title: string; current: number; total: number; detail: string }) {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-mist/85">{title}</p>
          <p className="mt-1 text-[11px] text-mist/40">{detail}</p>
        </div>
        <span className="font-medium tabular-nums text-signal">{percent}%</span>
      </div>
      <div className="clay-inset mt-3 h-3 overflow-hidden rounded-full p-[3px]">
        <div className="h-full rounded-full bg-signal transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function SmallNumber({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="clay-inset rounded-[22px] p-4">
      <p className="text-[11px] text-mist/40">{label}</p>
      <p className={`mt-3 text-2xl font-semibold tabular-nums ${accent ? 'text-signal' : 'text-mist'}`}>{value.toLocaleString('ru-RU')}</p>
    </div>
  )
}

function StepRow({ number, title, status, done = false, active = false }: { number: string; title: string; status: string; done?: boolean; active?: boolean }) {
  return (
    <div className={`grid grid-cols-[42px_minmax(0,1fr)_72px] items-center gap-3 rounded-[22px] border p-3 ${active ? 'border-signal/30 bg-signal/[.08]' : 'border-mist/[.07] bg-ink/35'}`}>
      <span className={`grid h-9 w-9 place-items-center rounded-[14px] ${done || active ? 'bg-signal text-ink' : 'bg-mist/[.05] text-mist/35'}`}>{number}</span>
      <span className="text-sm text-mist/80">{title}</span>
      <span className={`text-right text-[10px] ${done || active ? 'text-signal' : 'text-mist/30'}`}>{status}</span>
    </div>
  )
}

function ModuleRow({ name, status }: { name: string; status: string }) {
  return (
    <div className="clay-inset flex items-center justify-between gap-4 rounded-[22px] p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-[14px] bg-signal/[.1] text-signal"><Database size={16} /></span>
        <p className="text-sm text-mist/80">{name}</p>
      </div>
      <span className="text-[10px] font-medium text-signal">{status}</span>
    </div>
  )
}

function StatusPanel({ title, message, compact = false }: { title: string; message: string; compact?: boolean }) {
  return (
    <div className={`rounded-[22px] border border-signal/25 bg-signal/[.07] text-mist ${compact ? 'mt-5 p-4' : 'p-5'}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-mist/50">{message}</p>
    </div>
  )
}

function numberValue(record: Record<string, unknown> | null, key: string): number {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function formatTimestamp(value?: string): string {
  if (!value) return 'Время не указано'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
}

function translateStatus(status?: string): string {
  const value = status?.toLowerCase()
  if (value === 'completed' || value === 'success' || value === 'ready') return 'Готово'
  if (value === 'running' || value === 'active') return 'В работе'
  if (value === 'failed' || value === 'error') return 'Нужна проверка'
  return 'Записано'
}
