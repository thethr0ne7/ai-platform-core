'use client'

import type { ReactNode } from 'react'
import {
  Activity,
  ArrowUpRight,
  BookOpenText,
  Building2,
  CheckCircle2,
  CircleGauge,
  Database,
  FileSearch,
  GitBranch,
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
    <main className="space-y-3 py-3">
      <section className="glass-surface relative overflow-hidden rounded-[28px] px-5 py-6 md:px-7 md:py-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_20%,rgba(184,255,90,.12),transparent_26%),radial-gradient(circle_at_70%_100%,rgba(139,92,255,.13),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal/70 to-transparent" />

        <div className="relative grid gap-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)] xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-signal/20 bg-signal/[.055] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.18em] text-signal">
                <span className="signal-dot" /> Production online
              </span>
              <span className="rounded-full border border-white/[.07] bg-white/[.025] px-3 py-1.5 text-[10px] uppercase tracking-[.16em] text-white/45">
                Build 0.54 / Interface pass
              </span>
            </div>

            <p className="mt-8 text-[10px] font-semibold uppercase tracking-[.28em] text-white/35">
              AI Platform Core · Operational command center
            </p>
            <h2 className="mt-3 max-w-4xl text-[clamp(2.4rem,5.5vw,5.4rem)] font-semibold leading-[.9] tracking-[-.065em]">
              Платформа видит систему <span className="bg-gradient-to-r from-signal via-emerald-300 to-violet bg-clip-text text-transparent">целиком.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-mist md:text-base">
              Единый слой управления данными, доказательствами, Government Intelligence и производственными контурами AI Factory.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button className="primary-cta" type="button">
                Открыть активный контур <ArrowUpRight size={15} />
              </button>
              <button className="secondary-cta" type="button">
                <RefreshCw size={15} /> Синхронизировать статус
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SystemBadge icon={<ShieldCheck size={16} />} label="Evidence gate" value="ENFORCED" tone="signal" />
            <SystemBadge icon={<Database size={16} />} label="Data plane" value="SUPABASE" tone="violet" />
            <SystemBadge icon={<GitBranch size={16} />} label="Delivery" value="VERCEL" tone="violet" />
            <SystemBadge icon={<Activity size={16} />} label="Runtime" value="HEALTHY" tone="signal" />
          </div>
        </div>
      </section>

      {stats.error ? <StatusPanel title="Метрики платформы недоступны" message={stats.error} /> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={<Building2 size={18} />}
          label="Организации"
          value={stats.data?.institutions_total}
          loading={stats.loading}
          code="DATA.01"
          tone="signal"
        />
        <MetricCard
          icon={<BookOpenText size={18} />}
          label="Программы"
          value={stats.data?.programs_total}
          loading={stats.loading}
          code="DATA.02"
          tone="violet"
        />
        <MetricCard
          icon={<RadioTower size={18} />}
          label="Источники"
          value={stats.data?.sources_total}
          loading={stats.loading}
          code="INTAKE.03"
          tone="signal"
        />
        <MetricCard
          icon={<ListChecks size={18} />}
          label="Задачи ingestion"
          value={stats.data?.ingestion_jobs_total}
          loading={stats.loading}
          code="QUEUE.04"
          tone="amber"
        />
        <MetricCard
          icon={<Sparkles size={18} />}
          label="Запуски фабрики"
          value={stats.data?.factory_runs_total}
          loading={stats.loading}
          code="FACTORY.05"
          tone="violet"
        />
      </section>

      <section className="grid gap-3 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,.65fr)]">
        <article className="glass-surface rounded-[26px] p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">DATA COVERAGE GATE</p>
              <h3 className="section-title">Готовность федерального массива</h3>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-signal/15 bg-signal/[.045] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-signal">
              <CircleGauge size={13} /> {coverage.loading ? 'SYNCING' : coverage.error ? 'DEGRADED' : 'ACTIVE'}
            </span>
          </div>

          {coverage.error ? (
            <StatusPanel title="Снимок покрытия недоступен" message={coverage.error} compact />
          ) : (
            <div className="mt-7 space-y-6">
              <CoverageRow
                code="01"
                title="Организации готовы к маршрутизации"
                current={institutionsReady}
                total={institutionsCatalog}
                detail={`${institutionsReady.toLocaleString('ru-RU')} из ${institutionsCatalog.toLocaleString('ru-RU')} прошли route-ready gate`}
                tone="signal"
              />
              <CoverageRow
                code="02"
                title="Программы подтверждены источниками"
                current={programsVerified}
                total={programsTotal}
                detail={`${programsVerified.toLocaleString('ru-RU')} верифицированных программ`}
                tone="violet"
              />
              <CoverageRow
                code="03"
                title="Очередь ingestion обработана"
                current={jobsDone}
                total={jobsTotal}
                detail={`${jobsFailed.toLocaleString('ru-RU')} задач требуют восстановления`}
                tone="amber"
              />
            </div>
          )}

          <div className="mt-7 grid gap-3 md:grid-cols-3">
            <GateTile label="Каталог" value={institutionsCatalog} state="loaded" />
            <GateTile label="Route-ready" value={institutionsReady} state="verified" />
            <GateTile label="Failed jobs" value={jobsFailed} state={jobsFailed > 0 ? 'attention' : 'verified'} />
          </div>
        </article>

        <article className="glass-surface rounded-[26px] p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">FACTORY PIPELINE</p>
              <h3 className="section-title">Производственный цикл</h3>
            </div>
            <span className="text-[10px] uppercase tracking-[.18em] text-white/30">11 nodes</span>
          </div>

          <div className="mt-6 space-y-2">
            {[
              ['01', 'INPUT', 'ready'],
              ['02', 'CLARIFY', 'ready'],
              ['03', 'PLAN', 'ready'],
              ['04', 'ARCHITECT', 'active'],
              ['05', 'PRODUCE', 'queued'],
              ['06', 'VALIDATE', 'queued'],
            ].map(([index, label, state]) => (
              <div
                key={label}
                className={`grid grid-cols-[36px_minmax(0,1fr)_72px] items-center gap-3 rounded-2xl border px-3 py-3 ${
                  state === 'active'
                    ? 'border-signal/25 bg-signal/[.055]'
                    : 'border-white/[.055] bg-white/[.018]'
                }`}
              >
                <span className="font-mono text-[10px] text-white/30">{index}</span>
                <span className="font-mono text-xs tracking-[.12em] text-white/75">{label}</span>
                <span
                  className={`text-right font-mono text-[9px] uppercase tracking-[.12em] ${
                    state === 'active' ? 'text-signal' : state === 'ready' ? 'text-white/45' : 'text-white/20'
                  }`}
                >
                  {state}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <article className="glass-surface rounded-[26px] p-5 md:p-6">
          <div className="section-head">
            <div>
              <p className="eyebrow">RUNTIME MODULES</p>
              <h3 className="section-title">Контуры платформы</h3>
            </div>
            <FileSearch size={17} className="text-signal" />
          </div>
          <div className="space-y-2">
            <ModuleRow name="Government Intelligence" code="GI_CORE" status="active" />
            <ModuleRow name="Evidence & Source Registry" code="EVIDENCE" status="active" />
            <ModuleRow name="Async Ingestion Worker" code="INGEST_V053" status="ready" />
            <ModuleRow name="Learning Memory" code="MEMORY" status="guarded" />
          </div>
        </article>

        <article className="glass-surface rounded-[26px] p-5 md:p-6">
          <div className="section-head">
            <div>
              <p className="eyebrow">RECENT FACTORY RUNS</p>
              <h3 className="section-title">Последняя активность</h3>
            </div>
            <span className="text-[10px] uppercase tracking-[.16em] text-white/30">Live feed</span>
          </div>

          <div className="space-y-2">
            {stats.loading ? (
              <div className="rounded-2xl border border-white/[.055] bg-white/[.018] p-4 text-sm text-mist">Загрузка запусков…</div>
            ) : stats.data?.recent_runs.length ? (
              stats.data.recent_runs.map((run, index) => (
                <div
                  key={run.id ?? index}
                  className="grid gap-3 rounded-2xl border border-white/[.055] bg-white/[.018] p-4 md:grid-cols-[38px_minmax(0,1fr)_110px] md:items-center"
                >
                  <span className="font-mono text-xs text-white/25">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <p className="text-sm font-medium text-white/80">Factory execution</p>
                    <p className="mt-1 text-[11px] text-mist">{formatTimestamp(run.started_at)}</p>
                  </div>
                  <span className="w-fit rounded-full border border-signal/15 bg-signal/[.05] px-3 py-1 text-[9px] font-semibold uppercase tracking-[.14em] text-signal md:justify-self-end">
                    {run.status ?? 'recorded'}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/[.08] bg-black/15 p-6 text-center">
                <CheckCircle2 className="mx-auto text-signal" size={22} />
                <p className="mt-3 text-sm font-medium">Журнал готов к новым запускам</p>
                <p className="mt-1 text-xs text-mist">События фабрики появятся здесь после следующего production run.</p>
              </div>
            )}
          </div>
        </article>
      </section>
    </main>
  )
}

function MetricCard({
  icon,
  label,
  value,
  loading,
  code,
  tone,
}: {
  icon: ReactNode
  label: string
  value?: number
  loading: boolean
  code: string
  tone: 'signal' | 'violet' | 'amber'
}) {
  const toneClasses = {
    signal: 'text-signal border-signal/15 bg-signal/[.055]',
    violet: 'text-violet border-violet/15 bg-violet/[.055]',
    amber: 'text-amber border-amber/15 bg-amber/[.055]',
  }

  return (
    <article className="glass-surface group rounded-[22px] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-white/[.13]">
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-9 w-9 place-items-center rounded-xl border ${toneClasses[tone]}`}>{icon}</div>
        <span className="font-mono text-[9px] tracking-[.16em] text-white/25">{code}</span>
      </div>
      <strong className="mt-6 block text-3xl font-semibold tabular-nums tracking-[-.045em] md:text-4xl">
        {loading ? '···' : (value ?? 0).toLocaleString('ru-RU')}
      </strong>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-mist">{label}</span>
        <ArrowUpRight size={13} className="text-white/20 transition group-hover:text-signal" />
      </div>
    </article>
  )
}

function SystemBadge({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  tone: 'signal' | 'violet'
}) {
  const color = tone === 'signal' ? 'text-signal' : 'text-violet'

  return (
    <div className="rounded-2xl border border-white/[.065] bg-black/20 p-4">
      <div className={`flex items-center gap-2 ${color}`}>
        {icon}
        <span className="text-[9px] uppercase tracking-[.16em]">{label}</span>
      </div>
      <p className="mt-4 font-mono text-xs tracking-[.12em] text-white/75">{value}</p>
    </div>
  )
}

function CoverageRow({
  code,
  title,
  current,
  total,
  detail,
  tone,
}: {
  code: string
  title: string
  current: number
  total: number
  detail: string
  tone: 'signal' | 'violet' | 'amber'
}) {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
  const barClasses = {
    signal: 'bg-signal shadow-[0_0_16px_rgba(184,255,90,.4)]',
    violet: 'bg-violet shadow-[0_0_16px_rgba(139,92,255,.4)]',
    amber: 'bg-amber shadow-[0_0_16px_rgba(255,207,102,.35)]',
  }

  return (
    <div>
      <div className="grid grid-cols-[34px_minmax(0,1fr)_50px] items-start gap-3">
        <span className="font-mono text-[10px] text-white/25">{code}</span>
        <div>
          <p className="text-sm font-medium text-white/80">{title}</p>
          <p className="mt-1 text-[11px] leading-5 text-mist">{detail}</p>
        </div>
        <span className="text-right font-mono text-xs text-white/65">{percent}%</span>
      </div>
      <div className="ml-[46px] mt-3 h-1.5 overflow-hidden rounded-full bg-white/[.05]">
        <div className={`h-full rounded-full ${barClasses[tone]}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function GateTile({ label, value, state }: { label: string; value: number; state: 'loaded' | 'verified' | 'attention' }) {
  const styles = {
    loaded: 'text-violet',
    verified: 'text-signal',
    attention: 'text-amber',
  }

  return (
    <div className="rounded-2xl border border-white/[.055] bg-black/20 p-4">
      <p className="text-[9px] uppercase tracking-[.17em] text-white/30">{label}</p>
      <p className={`mt-3 text-2xl font-semibold tabular-nums ${styles[state]}`}>{value.toLocaleString('ru-RU')}</p>
    </div>
  )
}

function ModuleRow({ name, code, status }: { name: string; code: string; status: 'active' | 'ready' | 'guarded' }) {
  const statusStyle = {
    active: 'text-signal',
    ready: 'text-violet',
    guarded: 'text-amber',
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-3 rounded-2xl border border-white/[.055] bg-white/[.018] p-4">
      <div>
        <p className="text-sm font-medium text-white/80">{name}</p>
        <p className="mt-1 font-mono text-[9px] tracking-[.14em] text-white/25">{code}</p>
      </div>
      <span className={`self-center text-right font-mono text-[9px] uppercase tracking-[.14em] ${statusStyle[status]}`}>{status}</span>
    </div>
  )
}

function StatusPanel({ title, message, compact = false }: { title: string; message: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-danger/20 bg-danger/[.055] text-danger ${compact ? 'mt-5 p-4' : 'p-5'}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-white/45">{message}</p>
    </div>
  )
}

function numberValue(record: Record<string, unknown> | null, key: string): number {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function formatTimestamp(value?: string): string {
  if (!value) return 'Время не зафиксировано'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
}
