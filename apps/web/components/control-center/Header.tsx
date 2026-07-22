'use client'

import { Bell, Command, Search } from 'lucide-react'
import { usePathname } from 'next/navigation'

const labels: Record<string, { title: string; code: string }> = {
  '/control-center': { title: 'Обзор платформы', code: 'SYS.OVERVIEW' },
  '/control-center/government': { title: 'Government Intelligence', code: 'INTEL.GOV' },
  '/control-center/health': { title: 'Здоровье фабрики', code: 'OPS.HEALTH' },
}

export default function Header() {
  const pathname = usePathname()
  const current = labels[pathname] ?? labels['/control-center']

  return (
    <header className="topbar glass-surface">
      <div className="min-w-0">
        <p className="truncate text-[9px] font-semibold uppercase tracking-[.24em] text-signal/70">
          {current.code}
        </p>
        <h1 className="mt-1 truncate text-sm font-semibold tracking-[-.01em] text-white md:text-base">
          {current.title}
        </h1>
      </div>

      <button className="command-trigger" type="button" aria-label="Открыть командный поиск">
        <Search size={16} strokeWidth={1.7} />
        <span>Поиск по источникам, задачам и сигналам</span>
        <kbd className="flex items-center gap-1">
          <Command size={10} /> K
        </kbd>
      </button>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-full border border-signal/15 bg-signal/[.045] px-3 py-2 text-[10px] font-medium text-signal md:flex">
          <span className="signal-dot" />
          SYSTEM READY
        </div>
        <button className="icon-button" type="button" aria-label="Уведомления">
          <Bell size={16} strokeWidth={1.7} />
        </button>
        <div className="avatar">T7</div>
      </div>
    </header>
  )
}
