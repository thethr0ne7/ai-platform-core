'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  Database,
  Gauge,
  Landmark,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

const navigation = [
  { href: '/control-center', label: 'Главная', icon: LayoutDashboard },
  { href: '/control-center/government', label: 'Поддержка и программы', icon: Landmark },
  { href: '/control-center/health', label: 'Состояние системы', icon: Activity },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      <aside className="desktop-sidebar glass-surface">
        <div className="flex items-center gap-3 px-2">
          <div className="brand-mark">
            <Sparkles size={19} strokeWidth={1.9} />
          </div>
          <div>
            <p className="text-sm font-semibold">Ядро ИИ</p>
            <p className="mt-1 text-[11px] text-mist/45">Центр управления</p>
          </div>
          <span className="ml-auto rounded-full border border-signal/25 bg-signal/[.1] px-2.5 py-1 text-[10px] font-semibold text-signal">
            0.55
          </span>
        </div>

        <div className="my-6 h-px bg-mist/[.08]" />

        <nav className="space-y-1">
          <p className="sidebar-label">Основные разделы</p>
          {navigation.map((item) => {
            const Icon = item.icon
            const active = item.href === '/control-center' ? pathname === item.href : pathname.startsWith(item.href)

            return (
              <Link key={item.href} href={item.href} className={`nav-item ${active ? 'nav-active' : ''}`}>
                <Icon size={18} strokeWidth={1.8} />
                <span className="text-sm">{item.label}</span>
                {active ? <span className="ml-auto signal-dot" /> : null}
              </Link>
            )
          })}
        </nav>

        <div className="mt-7 space-y-1">
          <p className="sidebar-label">Что подключено</p>
          <div className="nav-item cursor-default opacity-70">
            <Database size={18} strokeWidth={1.8} />
            <span className="text-sm">База данных</span>
          </div>
          <div className="nav-item cursor-default opacity-70">
            <ShieldCheck size={18} strokeWidth={1.8} />
            <span className="text-sm">Проверка источников</span>
          </div>
          <div className="nav-item cursor-default opacity-70">
            <Gauge size={18} strokeWidth={1.8} />
            <span className="text-sm">Наблюдение за работой</span>
          </div>
        </div>

        <div className="runtime-card">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-mist/45">Система</span>
            <span className="flex items-center gap-2 text-[11px] font-medium text-signal">
              <span className="signal-dot" /> Работает
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <RuntimeMetric label="Среда" value="Node 24" />
            <RuntimeMetric label="Публикация" value="Vercel" />
          </div>
          <p className="mt-3 text-[11px] leading-4 text-mist/35">Основная версия обновляется автоматически.</p>
        </div>
      </aside>

      <nav className="mobile-dock glass-surface" aria-label="Мобильная навигация">
        {navigation.map((item) => {
          const Icon = item.icon
          const active = item.href === '/control-center' ? pathname === item.href : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[18px] py-2 text-[10px] transition ${
                active ? 'dock-active text-mist' : 'text-mist/45'
              }`}
            >
              <Icon size={18} strokeWidth={1.8} className={active ? 'text-signal' : ''} />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}

function RuntimeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="clay-inset rounded-[16px] p-2.5">
      <p className="text-[10px] text-mist/35">{label}</p>
      <p className="mt-1 text-xs font-medium text-mist/80">{value}</p>
    </div>
  )
}
