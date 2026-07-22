'use client'

import { useFactoryHealth } from '@/hooks/useFactoryHealth'

export function FactoryHealth() {
  const health = useFactoryHealth()

  return (
    <section className="space-y-4 p-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Runtime observability
        </p>
        <h1 className="text-2xl font-bold">Factory Health</h1>
      </header>

      {health.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {health.error}
        </p>
      ) : health.loading ? (
        <p className="text-sm text-zinc-500">Loading factory health…</p>
      ) : health.data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <HealthPanel title="Factory runs" data={health.data.factory} />
          <HealthPanel title="Ingestion runs" data={health.data.ingestion} />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No health data is available yet.</p>
      )}
    </section>
  )
}

function HealthPanel({ title, data }: { title: string; data: Record<string, unknown>[] }) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      <pre className="mt-4 overflow-x-auto rounded-xl bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
        {JSON.stringify(data, null, 2)}
      </pre>
    </article>
  )
}
