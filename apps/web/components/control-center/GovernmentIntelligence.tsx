'use client'

import { useSignals } from '@/hooks/useSignals'

export function GovernmentIntelligence() {
  const signals = useSignals()

  return (
    <section className="space-y-4 p-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Intelligence layer
        </p>
        <h1 className="text-2xl font-bold">Government Intelligence</h1>
      </header>

      {signals.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {signals.error}
        </p>
      ) : signals.loading ? (
        <p className="text-sm text-zinc-500">Loading signals…</p>
      ) : signals.data.length ? (
        <pre className="overflow-x-auto rounded-xl bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
          {JSON.stringify(signals.data, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-zinc-500">No analytic signals are available yet.</p>
      )}
    </section>
  )
}
