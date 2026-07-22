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
  { href: '/control-center', label: 'Обзор', icon: LayoutDashboard },
  { href: '/control-center/government', label: 'Господдержка', icon: Landmark },
  { href: '/control-center/health', label: 'Здоровье фабрики', icon: Activity },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      <aside className="desktop-sidebar glass-surface">
        <div className="flex items-center gap-3 px-2">
          <div className="brand-mark">
            <Sparkles size={18} strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-[.08em]">AI//CORE</p>
            <p className="mt-1 text-[10px] uppercase tracking-[.22em] text-mist">Control system</p>
          </div>
          <span className="ml-auto rounded-full border border-signal/20 bg-signal/[.06] px-2 py-1 text-[9px] font-semibold tracking-[.16em] text-signal">
            v0.54
          </span>
        </div>

        <div className="my-6 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <nav className="space-y-1">
          <p className="sidebar-label">Операционный контур</p>
          {navigation.map((item) => {
            const Icon = item.icon
            const active = item.href === '/control-center' ? pathname === item.href : pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${active ? 'nav-active' : ''}`}
              >
                <Icon size={17} strokeWidth={1.7} />
                <span className="text-sm">{item.label}</span>
                {active ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-signal shadow-[0_0_12px_rgba(184,255,90,.9)]" /> : null}
              </Link>
            )
          })}
        </nav>

        <div className="mt-7 space-y-1">
          <p className="sidebar-label">Системные слои</p>
          <div className="nav-item cursor-default opacity-65">
            <Database size={17} strokeWidth={1.7} />
            <span className="text-sm">Supabase Data Plane</span>
          </div>
          <div className="nav-item cursor-default opacity-65">
            <ShieldCheck size={17} strokeWidth={1.7} />
            <span className="text-sm">Evidence Gate</span>
          </div>
          <div className="nav-item cursor-default opacity-65">
            <Gauge size={17} strokeWidth={1.7} />
            <span className="text-sm">Runtime Monitor</span>
          </div>
        </div>

        <div className="runtime-card">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[.18em] text-mist">Production</span>
            <span className="flex items-center gap-2 text-[10px] font-medium text-signal">
              <span className="signal-dot" /> Online
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <RuntimeMetric label="Runtime" value="Node 24" />
            <RuntimeMetric label="Deploy" value="Vercel" />
          </div>
          <p className="mt-3 text-[10px] leading-4 text-white/35">Main branch · automated production pipeline</p>
        </div>
      </aside>

      <nav className="mobile-dock glass-surface xl:hidden" aria-label="Мобильная навигация">
        {navigation.map((item) => {
          const Icon = item.icon
          const active = item.href === '/control-center' ? pathname === item.href : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[10px] transition ${
                active ? 'dock-active bg-white/[.06] text-white' : 'text-mist'
              }`}
            >
              <Icon size={18} strokeWidth={1.7} className={active ? 'text-signal' : ''} />
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
    <div className="rounded-xl border border-white/[.055] bg-black/20 p-2.5">
      <p className="text-[9px] uppercase tracking-[.14em] text-white/30">{label}</p>
      <p className="mt-1 text-xs font-medium text-white/80">{value}</p>
    </div>
  )
}
