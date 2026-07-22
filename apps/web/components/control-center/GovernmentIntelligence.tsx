'use client'

import { ArrowUpRight, Landmark, Radar, ShieldCheck, Sparkles } from 'lucide-react'
import { useSignals } from '@/hooks/useSignals'

export function GovernmentIntelligence() {
  const signals = useSignals()
  const highConfidence = signals.data.filter((signal) => confidenceValue(signal.confidence) >= 75).length

  return (
    <main className="space-y-3 py-3">
      <section className="glass-surface relative overflow-hidden rounded-[28px] p-6 md:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_15%,rgba(139,92,255,.17),transparent_28%),radial-gradient(circle_at_20%_100%,rgba(184,255,90,.08),transparent_25%)]" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet/20 bg-violet/[.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.18em] text-violet">
              <Radar size={13} /> Intelligence radar
            </span>
            <p className="mt-7 text-[10px] font-semibold uppercase tracking-[.28em] text-white/35">Government Intelligence</p>
            <h2 className="mt-3 max-w-3xl text-[clamp(2.3rem,5vw,4.8rem)] font-semibold leading-[.92] tracking-[-.06em]">
              Сигналы государства до того, как они станут <span className="text-violet">очевидными.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-mist md:text-base">
              Изменения программ, приоритетов и требований собираются в доказательный контур с оценкой уверенности.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Signals" value={signals.data.length} tone="violet" />
            <StatTile label="High confidence" value={highConfidence} tone="signal" />
            <StatTile label="Evidence mode" value="LOCKED" tone="signal" />
            <StatTile label="Refresh" value="LIVE" tone="violet" />
          </div>
        </div>
      </section>

      {signals.error ? (
        <div className="rounded-2xl border border-danger/20 bg-danger/[.055] p-5 text-danger">
          <p className="text-sm font-semibold">Intelligence feed unavailable</p>
          <p className="mt-1 text-xs text-white/45">{signals.error}</p>
        </div>
      ) : null}

      <section className="glass-surface rounded-[26px] p-5 md:p-6">
        <div className="section-head">
          <div>
            <p className="eyebrow">ANALYTIC SIGNALS</p>
            <h3 className="section-title">Приоритетные изменения</h3>
          </div>
          <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[.16em] text-signal">
            <span className="signal-dot" /> Evidence locked
          </span>
        </div>

        {signals.loading ? (
          <div className="rounded-2xl border border-white/[.055] bg-white/[.018] p-5 text-sm text-mist">Синхронизация аналитических сигналов…</div>
        ) : signals.data.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {signals.data.map((signal, index) => (
              <SignalCard key={textValue(signal.id) || index} signal={signal} index={index} />
            ))}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-white/[.08] bg-black/15 p-8 text-center">
            <Sparkles className="mx-auto text-violet" size={24} />
            <p className="mt-4 text-sm font-medium">Радар готов к приёму сигналов</p>
            <p className="mt-1 text-xs text-mist">После следующего ingestion run здесь появятся подтверждённые изменения.</p>
          </div>
        )}
      </section>
    </main>
  )
}

function SignalCard({ signal, index }: { signal: Record<string, unknown>; index: number }) {
  const confidence = confidenceValue(signal.confidence)
  const title =
    textValue(signal.title) ||
    textValue(signal.signal_title) ||
    textValue(signal.summary) ||
    `Аналитический сигнал ${String(index + 1).padStart(2, '0')}`
  const description =
    textValue(signal.description) ||
    textValue(signal.rationale) ||
    textValue(signal.interpretation) ||
    'Сигнал сохранён в Government Intelligence и ожидает расширенного представления.'
  const category = textValue(signal.category) || textValue(signal.signal_type) || 'POLICY SIGNAL'

  return (
    <article className="group rounded-[22px] border border-white/[.06] bg-white/[.02] p-5 transition hover:border-violet/25 hover:bg-violet/[.035]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-violet/20 bg-violet/[.07] text-violet">
            <Landmark size={17} strokeWidth={1.7} />
          </span>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[.16em] text-violet">{category}</p>
            <p className="mt-1 font-mono text-[9px] text-white/25">SIG.{String(index + 1).padStart(3, '0')}</p>
          </div>
        </div>
        <ArrowUpRight size={15} className="text-white/20 transition group-hover:text-violet" />
      </div>

      <h4 className="mt-5 text-lg font-semibold leading-7 tracking-[-.02em] text-white/90">{title}</h4>
      <p className="mt-3 line-clamp-3 text-xs leading-5 text-mist">{description}</p>

      <div className="mt-5 flex items-center gap-3">
        <ShieldCheck size={14} className={confidence >= 75 ? 'text-signal' : 'text-amber'} />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[.05]">
          <div
            className={`h-full rounded-full ${confidence >= 75 ? 'bg-signal' : 'bg-amber'}`}
            style={{ width: `${confidence}%` }}
          />
        </div>
        <span className="font-mono text-[10px] text-white/45">{confidence}%</span>
      </div>
    </article>
  )
}

function StatTile({ label, value, tone }: { label: string; value: number | string; tone: 'signal' | 'violet' }) {
  return (
    <div className="rounded-2xl border border-white/[.06] bg-black/20 p-4">
      <p className="text-[9px] uppercase tracking-[.16em] text-white/30">{label}</p>
      <p className={`mt-3 text-xl font-semibold tabular-nums ${tone === 'signal' ? 'text-signal' : 'text-violet'}`}>{value}</p>
    </div>
  )
}

function confidenceValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const normalized = value <= 1 ? value * 100 : value
  return Math.max(0, Math.min(100, Math.round(normalized)))
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
