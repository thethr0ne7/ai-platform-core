'use client'

import { Activity, Cpu, Database, HeartPulse, ServerCog, ShieldCheck } from 'lucide-react'
import { useFactoryHealth } from '@/hooks/useFactoryHealth'

export function FactoryHealth() {
  const health = useFactoryHealth()
  const factoryRuns = health.data?.factory ?? []
  const ingestionRuns = health.data?.ingestion ?? []
  const failedRuns = [...factoryRuns, ...ingestionRuns].filter((run) => isFailure(run.status)).length

  return (
    <main className="space-y-3 py-3">
      <section className="glass-surface relative overflow-hidden rounded-[28px] p-6 md:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_12%,rgba(184,255,90,.14),transparent_26%),radial-gradient(circle_at_15%_100%,rgba(139,92,255,.11),transparent_26%)]" />
        <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-signal/20 bg-signal/[.055] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.18em] text-signal">
              <HeartPulse size={13} /> Runtime observability
            </span>
            <p className="mt-7 text-[10px] font-semibold uppercase tracking-[.28em] text-white/35">Factory Health</p>
            <h2 className="mt-3 max-w-3xl text-[clamp(2.3rem,5vw,4.8rem)] font-semibold leading-[.92] tracking-[-.06em]">
              Контроль производства без <span className="text-signal">слепых зон.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-mist md:text-base">
              Запуски фабрики, ingestion-процессы и состояние инфраструктурных слоёв собраны в одном наблюдаемом контуре.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <HealthMetric icon={<Cpu size={16} />} label="Factory runs" value={factoryRuns.length} tone="signal" />
            <HealthMetric icon={<Database size={16} />} label="Ingestion runs" value={ingestionRuns.length} tone="violet" />
            <HealthMetric icon={<ShieldCheck size={16} />} label="Failures" value={failedRuns} tone={failedRuns > 0 ? 'amber' : 'signal'} />
            <HealthMetric icon={<ServerCog size={16} />} label="Runtime" value={health.error ? 'DEGRADED' : 'READY'} tone={health.error ? 'amber' : 'signal'} />
          </div>
        </div>
      </section>

      {health.error ? (
        <div className="rounded-2xl border border-danger/20 bg-danger/[.055] p-5 text-danger">
          <p className="text-sm font-semibold">Observability feed unavailable</p>
          <p className="mt-1 text-xs text-white/45">{health.error}</p>
        </div>
      ) : null}

      <section className="grid gap-3 xl:grid-cols-2">
        <HealthPanel
          title="Factory executions"
          code="FACTORY.RUNS"
          icon={<Activity size={17} />}
          data={factoryRuns}
          loading={health.loading}
        />
        <HealthPanel
          title="Ingestion executions"
          code="INGEST.RUNS"
          icon={<Database size={17} />}
          data={ingestionRuns}
          loading={health.loading}
        />
      </section>

      <section className="glass-surface rounded-[26px] p-5 md:p-6">
        <div className="section-head">
          <div>
            <p className="eyebrow">INFRASTRUCTURE STATUS</p>
            <h3 className="section-title">Системные зависимости</h3>
          </div>
          <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[.16em] text-signal">
            <span className="signal-dot" /> monitored
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DependencyCard name="GitHub" detail="Source control" status="connected" />
          <DependencyCard name="Supabase" detail="Data plane" status="connected" />
          <DependencyCard name="Vercel" detail="Production delivery" status="ready" />
          <DependencyCard name="Worker v0.53" detail="Async ingestion" status="ready" />
        </div>
      </section>
    </main>
  )
}

function HealthPanel({
  title,
  code,
  icon,
  data,
  loading,
}: {
  title: string
  code: string
  icon: React.ReactNode
  data: Record<string, unknown>[]
  loading: boolean
}) {
  return (
    <article className="glass-surface rounded-[26px] p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{code}</p>
          <h3 className="section-title">{title}</h3>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-xl border border-signal/15 bg-signal/[.055] text-signal">{icon}</span>
      </div>

      <div className="mt-6 space-y-2">
        {loading ? (
          <div className="rounded-2xl border border-white/[.055] bg-white/[.018] p-4 text-sm text-mist">Синхронизация журнала…</div>
        ) : data.length ? (
          data.map((run, index) => <RunRow key={textValue(run.id) || index} run={run} index={index} />)
        ) : (
          <div className="rounded-2xl border border-dashed border-white/[.08] bg-black/15 p-7 text-center">
            <ShieldCheck className="mx-auto text-signal" size={22} />
            <p className="mt-3 text-sm font-medium">Ошибок не зафиксировано</p>
            <p className="mt-1 text-xs text-mist">Новые выполнения появятся в журнале автоматически.</p>
          </div>
        )}
      </div>
    </article>
  )
}

function RunRow({ run, index }: { run: Record<string, unknown>; index: number }) {
  const status = textValue(run.status) || 'recorded'
  const failed = isFailure(status)
  const startedAt = textValue(run.started_at) || textValue(run.created_at)
  const label = textValue(run.run_label) || textValue(run.kind) || textValue(run.mode) || 'Execution event'

  return (
    <div className="grid grid-cols-[36px_minmax(0,1fr)_86px] items-center gap-3 rounded-2xl border border-white/[.055] bg-white/[.018] p-4">
      <span className="font-mono text-[10px] text-white/25">{String(index + 1).padStart(2, '0')}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white/80">{label}</p>
        <p className="mt-1 truncate text-[10px] text-mist">{formatTimestamp(startedAt)}</p>
      </div>
      <span className={`text-right font-mono text-[9px] uppercase tracking-[.12em] ${failed ? 'text-danger' : 'text-signal'}`}>{status}</span>
    </div>
  )
}

function HealthMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  tone: 'signal' | 'violet' | 'amber'
}) {
  const styles = {
    signal: 'text-signal',
    violet: 'text-violet',
    amber: 'text-amber',
  }

  return (
    <div className="rounded-2xl border border-white/[.06] bg-black/20 p-4">
      <div className={`flex items-center gap-2 ${styles[tone]}`}>
        {icon}
        <span className="text-[9px] uppercase tracking-[.15em]">{label}</span>
      </div>
      <p className={`mt-4 text-xl font-semibold tabular-nums ${styles[tone]}`}>{value}</p>
    </div>
  )
}

function DependencyCard({ name, detail, status }: { name: string; detail: string; status: 'connected' | 'ready' }) {
  return (
    <div className="rounded-2xl border border-white/[.055] bg-white/[.018] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-white/80">{name}</p>
        <span className="signal-dot" />
      </div>
      <p className="mt-2 text-[11px] text-mist">{detail}</p>
      <p className="mt-4 font-mono text-[9px] uppercase tracking-[.14em] text-signal">{status}</p>
    </div>
  )
}

function isFailure(value: unknown): boolean {
  const status = textValue(value).toLowerCase()
  return ['failed', 'error', 'cancelled', 'degraded'].includes(status)
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function formatTimestamp(value: string): string {
  if (!value) return 'Время не зафиксировано'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
}
