'use client'

import { useCoverage } from '@/hooks/useCoverage'
import { usePlatformStats } from '@/hooks/usePlatformStats'

export function OverviewDashboard() {
  const stats = usePlatformStats()
  const coverage = useCoverage()

  return (
    <main className="space-y-8 p-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">
          AI Platform Core
        </p>
        <h1 className="text-3xl font-bold">Control Center v0.52</h1>
        <p className="text-zinc-600">Operational dashboard connected to Supabase.</p>
      </header>

      {stats.error ? (
        <StatusPanel title="Platform metrics unavailable" message={stats.error} tone="error" />
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric title="Institutions" value={stats.data?.institutions_total} loading={stats.loading} />
        <Metric title="Programs" value={stats.data?.programs_total} loading={stats.loading} />
        <Metric title="Sources" value={stats.data?.sources_total} loading={stats.loading} />
        <Metric title="Ingestion jobs" value={stats.data?.ingestion_jobs_total} loading={stats.loading} />
        <Metric title="Factory runs" value={stats.data?.factory_runs_total} loading={stats.loading} />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Data gate
            </p>
            <h2 className="text-xl font-semibold">Coverage snapshot</h2>
          </div>
          <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600">
            {coverage.loading ? 'Loading' : coverage.error ? 'Error' : coverage.data ? 'Ready' : 'No data'}
          </span>
        </div>

        {coverage.error ? (
          <StatusPanel title="Coverage snapshot unavailable" message={coverage.error} tone="error" />
        ) : coverage.loading ? (
          <p className="text-sm text-zinc-500">Loading the latest coverage snapshot…</p>
        ) : coverage.data ? (
          <pre className="overflow-x-auto rounded-xl bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
            {JSON.stringify(coverage.data, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-zinc-500">No coverage snapshots have been recorded yet.</p>
        )}
      </section>
    </main>
  )
}

function Metric({
  title,
  value,
  loading,
}: {
  title: string
  value?: number
  loading: boolean
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-zinc-500">{title}</div>
      <strong className="mt-3 block text-3xl tabular-nums">{loading ? '…' : (value ?? 0)}</strong>
    </article>
  )
}

function StatusPanel({
  title,
  message,
  tone,
}: {
  title: string
  message: string
  tone: 'error'
}) {
  const className = tone === 'error' ? 'border-red-200 bg-red-50 text-red-900' : ''

  return (
    <div className={`rounded-xl border p-4 ${className}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-80">{message}</p>
    </div>
  )
}
