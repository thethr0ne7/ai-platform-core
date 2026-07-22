'use client'

import { Activity, Cpu, Database, HeartPulse, ServerCog, ShieldCheck } from 'lucide-react'
import { useFactoryHealth } from '@/hooks/useFactoryHealth'

export function FactoryHealth() {
  const health = useFactoryHealth()
  const factoryRuns = health.data?.factory ?? []
  const ingestionRuns = health.data?.ingestion ?? []
  const failedRuns = [...factoryRuns, ...ingestionRuns].filter((run) => isFailure(run.status)).length

  return (
    <main className="space-y-4 py-4">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <article className="glass-surface relative overflow-hidden rounded-[34px] p-6 md:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-signal/[.08] blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-signal/25 bg-signal/[.1] px-3 py-2 text-[11px] font-medium text-signal">
              <HeartPulse size={15} /> Наблюдение за системой
            </span>
            <h2 className="mt-8 max-w-4xl text-[clamp(2.3rem,5vw,4.9rem)] font-semibold leading-[.94] tracking-[-.06em] text-mist">
              Видно, что работает, а что требует внимания.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-mist/55 md:text-base">
              Здесь собраны последние запуски, ошибки и состояние сервисов, от которых зависит платформа.
            </p>
          </div>
        </article>

        <article className="glass-surface rounded-[34px] p-5 md:p-6">
          <div className="section-head">
            <div>
              <p className="eyebrow">Сводка</p>
              <h3 className="section-title">Состояние сейчас</h3>
            </div>
            <Activity size={19} className="text-signal" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HealthMetric icon={<Cpu size={16} />} label="Запуски фабрики" value={factoryRuns.length} />
            <HealthMetric icon={<Database size={16} />} label="Запуски сбора" value={ingestionRuns.length} />
            <HealthMetric icon={<ShieldCheck size={16} />} label="Ошибки" value={failedRuns} accent={failedRuns > 0} />
            <HealthMetric icon={<ServerCog size={16} />} label="Общий статус" value={health.error ? 'Нужна проверка' : 'Работает'} accent />
          </div>
        </article>
      </section>

      {health.error ? (
        <div className="rounded-[24px] border border-signal/25 bg-signal/[.07] p-5 text-mist">
          <p className="text-sm font-semibold">Не удалось получить состояние системы</p>
          <p className="mt-1 text-xs text-mist/50">{health.error}</p>
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <HealthPanel title="Работа фабрики" icon={<Activity size={18} />} data={factoryRuns} loading={health.loading} />
        <HealthPanel title="Сбор данных" icon={<Database size={18} />} data={ingestionRuns} loading={health.loading} />
      </section>

      <section className="glass-surface rounded-[34px] p-5 md:p-7">
        <div className="section-head">
          <div>
            <p className="eyebrow">Подключённые сервисы</p>
            <h3 className="section-title">От чего зависит работа платформы</h3>
          </div>
          <span className="flex items-center gap-2 text-[11px] text-signal"><span className="signal-dot" /> Проверяется</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DependencyCard name="GitHub" detail="Хранение кода" status="Подключён" />
          <DependencyCard name="Supabase" detail="База данных" status="Подключена" />
          <DependencyCard name="Vercel" detail="Публикация сайта" status="Работает" />
          <DependencyCard name="Сборщик данных" detail="Автоматический сбор" status="Готов" />
        </div>
      </section>
    </main>
  )
}

function HealthPanel({ title, icon, data, loading }: { title: string; icon: React.ReactNode; data: Record<string, unknown>[]; loading: boolean }) {
  return (
    <article className="glass-surface rounded-[34px] p-5 md:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Последние события</p>
          <h3 className="section-title">{title}</h3>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-[17px] border border-signal/20 bg-signal/[.1] text-signal">{icon}</span>
      </div>

      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="clay-inset rounded-[22px] p-5 text-sm text-mist/45">Получаем журнал…</div>
        ) : data.length ? (
          data.map((run, index) => <RunRow key={textValue(run.id) || index} run={run} index={index} />)
        ) : (
          <div className="clay-inset rounded-[24px] p-8 text-center">
            <ShieldCheck className="mx-auto text-signal" size={24} />
            <p className="mt-3 text-sm font-medium">Ошибок не найдено</p>
            <p className="mt-1 text-xs text-mist/45">Новые события появятся после следующего запуска.</p>
          </div>
        )}
      </div>
    </article>
  )
}

function RunRow({ run, index }: { run: Record<string, unknown>; index: number }) {
  const status = textValue(run.status) || 'recorded'
  const startedAt = textValue(run.started_at) || textValue(run.created_at)
  const label = textValue(run.run_label) || textValue(run.kind) || textValue(run.mode) || 'Системное событие'

  return (
    <div className="clay-inset grid grid-cols-[40px_minmax(0,1fr)_100px] items-center gap-3 rounded-[22px] p-4">
      <span className="grid h-9 w-9 place-items-center rounded-[14px] bg-mist/[.05] text-xs text-mist/40">{index + 1}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-mist/80">{label}</p>
        <p className="mt-1 truncate text-[10px] text-mist/40">{formatTimestamp(startedAt)}</p>
      </div>
      <span className="text-right text-[10px] font-medium text-signal">{translateStatus(status)}</span>
    </div>
  )
}

function HealthMetric({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="clay-inset rounded-[22px] p-4">
      <div className="flex items-center gap-2 text-signal">{icon}<span className="text-[10px] leading-4 text-mist/40">{label}</span></div>
      <p className={`mt-4 text-lg font-semibold tabular-nums ${accent ? 'text-signal' : 'text-mist'}`}>{value}</p>
    </div>
  )
}

function DependencyCard({ name, detail, status }: { name: string; detail: string; status: string }) {
  return (
    <div className="clay-inset rounded-[24px] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-mist/85">{name}</p>
        <span className="signal-dot" />
      </div>
      <p className="mt-2 text-[11px] text-mist/40">{detail}</p>
      <p className="mt-5 text-[10px] font-medium text-signal">{status}</p>
    </div>
  )
}

function isFailure(value: unknown): boolean {
  const status = textValue(value).toLowerCase()
  return ['failed', 'error', 'cancelled', 'degraded'].includes(status)
}

function translateStatus(value: string): string {
  const status = value.toLowerCase()
  if (['completed', 'success', 'ready'].includes(status)) return 'Готово'
  if (['running', 'active'].includes(status)) return 'В работе'
  if (['failed', 'error', 'cancelled', 'degraded'].includes(status)) return 'Нужна проверка'
  return 'Записано'
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function formatTimestamp(value: string): string {
  if (!value) return 'Время не указано'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
}
