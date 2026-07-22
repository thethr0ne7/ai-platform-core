'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  BrainCircuit,
  ClipboardCheck,
  Database,
  Gauge,
  GitBranch,
  Landmark,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react'

const navigation = [
  { href: '/control-center', label: 'Главная', mobileLabel: 'Главная', icon: LayoutDashboard },
  { href: '/control-center/government', label: 'Поддержка и программы', mobileLabel: 'Программы', icon: Landmark },
  { href: '/control-center/intelligence', label: 'Государственная разведка', mobileLabel: 'Разведка', icon: BrainCircuit },
  { href: '/control-center/trajectories', label: 'Траектории', mobileLabel: 'Тренды', icon: TrendingUp },
  { href: '/control-center/graph', label: 'Граф связей', mobileLabel: 'Граф', icon: GitBranch },
  { href: '/control-center/decision-cards', label: 'Карточки решений', mobileLabel: 'Решения', icon: ClipboardCheck },
  { href: '/control-center/health', label: 'Состояние системы', mobileLabel: 'Система', icon: Activity },
]

const mobileNavigation = navigation.filter((item) => [
  '/control-center',
  '/control-center/government',
  '/control-center/intelligence',
  '/control-center/health',
].includes(item.href))

export default function Sidebar() {
  const pathname = usePathname()
  const isActive = (href: string) => href === '/control-center' ? pathname === href : pathname.startsWith(href)

  return (
    <>
      <aside className="desktop-sidebar glass-surface">
        <div className="flex items-center gap-3 px-2">
          <div className="brand-mark"><Sparkles size={19} strokeWidth={1.9} /></div>
          <div><p className="text-sm font-semibold">Ядро ИИ</p><p className="mt-1 text-[11px] text-mist/45">Центр управления</p></div>
          <span className="ml-auto rounded-full border border-signal/25 bg-signal/[.1] px-2.5 py-1 text-[10px] font-semibold text-signal">0.72</span>
        </div>

        <div className="my-6 h-px bg-mist/[.08]" />

        <nav className="space-y-1">
          <p className="sidebar-label">Основные разделы</p>
          {navigation.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return <Link key={item.href} href={item.href} className={`nav-item ${active ? 'nav-active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span className="text-sm">{item.label}</span>{active ? <span className="ml-auto signal-dot" /> : null}</Link>
          })}
        </nav>

        <div className="mt-7 space-y-1">
          <p className="sidebar-label">Что подключено</p>
          <div className="nav-item cursor-default opacity-70"><Database size={18} strokeWidth={1.8} /><span className="text-sm">PostgreSQL-граф</span></div>
          <div className="nav-item cursor-default opacity-70"><ShieldCheck size={18} strokeWidth={1.8} /><span className="text-sm">Evidence и Truth Gate</span></div>
          <div className="nav-item cursor-default opacity-70"><Gauge size={18} strokeWidth={1.8} /><span className="text-sm">Контролируемый прогноз</span></div>
        </div>

        <div className="runtime-card">
          <div className="flex items-center justify-between gap-3"><span className="text-[11px] text-mist/45">Government Intelligence</span><span className="flex items-center gap-2 text-[11px] font-medium text-signal"><span className="signal-dot" /> Подключён</span></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><RuntimeMetric label="Движок" value="v0.72" /><RuntimeMetric label="Хранилище" value="Supabase" /></div>
          <p className="mt-3 text-[11px] leading-4 text-mist/35">VER436SIA работает внутри основной платформы и не обходит Truth Gate.</p>
        </div>
      </aside>

      <nav className="mobile-dock glass-surface" aria-label="Мобильная навигация">
        {mobileNavigation.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          return <Link key={item.href} href={item.href} className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[18px] px-1 py-2 text-[10px] transition ${active ? 'dock-active text-mist' : 'text-mist/45'}`}><Icon size={18} strokeWidth={1.8} className={active ? 'text-signal' : ''} /><span className="block w-full truncate text-center leading-4">{item.mobileLabel}</span></Link>
        })}
      </nav>
    </>
  )
}

function RuntimeMetric({ label, value }: { label: string; value: string }) {
  return <div className="clay-inset rounded-[16px] p-2.5"><p className="text-[10px] text-mist/35">{label}</p><p className="mt-1 text-xs font-medium text-mist/80">{value}</p></div>
}
