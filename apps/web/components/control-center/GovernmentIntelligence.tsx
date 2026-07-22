'use client'

import { ArrowUpRight, Landmark, Radar, ShieldCheck, Sparkles } from 'lucide-react'
import { useSignals } from '@/hooks/useSignals'

export function GovernmentIntelligence() {
  const signals = useSignals()
  const highConfidence = signals.data.filter((signal) => confidenceValue(signal.confidence) >= 75).length

  return (
    <main className="space-y-4 py-4">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <article className="glass-surface relative overflow-hidden rounded-[34px] p-6 md:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-signal/[.08] blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-signal/25 bg-signal/[.1] px-3 py-2 text-[11px] font-medium text-signal">
              <Radar size={15} /> Поиск новых изменений
            </span>
            <h2 className="mt-8 max-w-4xl text-[clamp(2.3rem,5vw,4.9rem)] font-semibold leading-[.94] tracking-[-.06em] text-mist">
              Важные изменения до того, как они станут очевидными.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-mist/55 md:text-base">
              Платформа собирает новые меры поддержки, изменения правил и приоритетов, а затем показывает, насколько им можно доверять.
            </p>
          </div>
        </article>

        <article className="glass-surface rounded-[34px] p-5 md:p-6">
          <div className="section-head">
            <div>
              <p className="eyebrow">Короткая сводка</p>
              <h3 className="section-title">Что найдено</h3>
            </div>
            <Sparkles size={19} className="text-signal" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Всего сигналов" value={signals.data.length} />
            <StatTile label="Высокая уверенность" value={highConfidence} accent />
            <StatTile label="Проверка источников" value="Включена" accent />
            <StatTile label="Обновление" value="Автоматическое" />
          </div>
        </article>
      </section>

      {signals.error ? (
        <div className="rounded-[24px] border border-signal/25 bg-signal/[.07] p-5 text-mist">
          <p className="text-sm font-semibold">Не удалось получить новые изменения</p>
          <p className="mt-1 text-xs text-mist/50">{signals.error}</p>
        </div>
      ) : null}

      <section className="glass-surface rounded-[34px] p-5 md:p-7">
        <div className="section-head">
          <div>
            <p className="eyebrow">Новые изменения</p>
            <h3 className="section-title">Что заслуживает внимания</h3>
          </div>
          <span className="flex items-center gap-2 text-[11px] text-signal"><span className="signal-dot" /> Источники проверяются</span>
        </div>

        {signals.loading ? (
          <div className="clay-inset rounded-[24px] p-5 text-sm text-mist/45">Получаем свежие данные…</div>
        ) : signals.data.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {signals.data.map((signal, index) => (
              <SignalCard key={textValue(signal.id) || index} signal={signal} index={index} />
            ))}
          </div>
        ) : (
          <div className="clay-inset rounded-[26px] p-9 text-center">
            <Sparkles className="mx-auto text-signal" size={26} />
            <p className="mt-4 text-sm font-medium">Новых изменений пока нет</p>
            <p className="mt-1 text-xs text-mist/45">Они появятся после следующего сбора официальных источников.</p>
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
    `Изменение №${index + 1}`
  const description =
    textValue(signal.description) ||
    textValue(signal.rationale) ||
    textValue(signal.interpretation) ||
    'Изменение сохранено и ожидает подробного разбора.'
  const category = translateCategory(textValue(signal.category) || textValue(signal.signal_type))

  return (
    <article className="clay-inset group rounded-[28px] p-5 transition hover:border-signal/25">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[17px] border border-signal/20 bg-signal/[.1] text-signal">
            <Landmark size={19} strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-[11px] font-medium text-signal">{category}</p>
            <p className="mt-1 text-[10px] text-mist/30">Запись {index + 1}</p>
          </div>
        </div>
        <ArrowUpRight size={16} className="text-mist/20 transition group-hover:text-signal" />
      </div>

      <h4 className="mt-5 text-lg font-semibold leading-7 tracking-[-.02em] text-mist/90">{title}</h4>
      <p className="mt-3 line-clamp-3 text-xs leading-5 text-mist/50">{description}</p>

      <div className="mt-5 flex items-center gap-3">
        <ShieldCheck size={15} className="text-signal" />
        <div className="clay-inset h-3 flex-1 overflow-hidden rounded-full p-[3px]">
          <div className="h-full rounded-full bg-signal" style={{ width: `${confidence}%` }} />
        </div>
        <span className="text-[11px] font-medium tabular-nums text-signal">{confidence}%</span>
      </div>
      <p className="mt-2 text-[10px] text-mist/35">Уверенность в сигнале</p>
    </article>
  )
}

function StatTile({ label, value, accent = false }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="clay-inset rounded-[22px] p-4">
      <p className="text-[10px] leading-4 text-mist/40">{label}</p>
      <p className={`mt-3 text-lg font-semibold tabular-nums ${accent ? 'text-signal' : 'text-mist'}`}>{value}</p>
    </div>
  )
}

function confidenceValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const normalized = value <= 1 ? value * 100 : value
  return Math.max(0, Math.min(100, Math.round(normalized)))
}

function translateCategory(value: string): string {
  const normalized = value.toLowerCase()
  if (normalized.includes('grant')) return 'Грант'
  if (normalized.includes('subsid')) return 'Субсидия'
  if (normalized.includes('law') || normalized.includes('regulat')) return 'Изменение правил'
  if (normalized.includes('budget') || normalized.includes('fund')) return 'Финансирование'
  return 'Важный сигнал'
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
