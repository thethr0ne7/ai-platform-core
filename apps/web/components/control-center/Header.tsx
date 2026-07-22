'use client'

import { Bell, Command, Search } from 'lucide-react'
import { usePathname } from 'next/navigation'

const labels: Record<string, { title: string; subtitle: string }> = {
  '/control-center': { title: 'Главная', subtitle: 'Общая картина работы платформы' },
  '/control-center/government': { title: 'Поддержка и программы', subtitle: 'Новые меры, изменения и полезные сигналы' },
  '/control-center/intelligence': { title: 'Государственная аналитика', subtitle: 'Сущности, сигналы, темы и состояние аналитического ядра' },
  '/control-center/trajectories': { title: 'Траектории', subtitle: 'Динамика государственных сигналов во времени' },
  '/control-center/graph': { title: 'Граф связей', subtitle: 'Органы власти, программы, требования, территории и ресурсы' },
  '/control-center/decision-cards': { title: 'Карточки решений', subtitle: 'Решения, блокеры и следующие действия после проверки фактов' },
  '/control-center/health': { title: 'Состояние системы', subtitle: 'Запуски, ошибки и подключённые сервисы' },
}

export default function Header() {
  const pathname = usePathname()
  const current = labels[pathname] ?? labels['/control-center']

  return (
    <header className="topbar glass-surface">
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold text-mist md:text-base">{current.title}</h1>
        <p className="mt-1 hidden truncate text-[11px] text-mist/40 sm:block">{current.subtitle}</p>
      </div>

      <button className="command-trigger" type="button" aria-label="Открыть поиск">
        <Search size={17} strokeWidth={1.8} />
        <span>Найти программу, источник или задачу</span>
        <kbd className="flex items-center gap-1"><Command size={10} /> K</kbd>
      </button>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-full border border-signal/25 bg-signal/[.1] px-3 py-2 text-[11px] font-medium text-signal md:flex">
          <span className="signal-dot" /> Всё работает
        </div>
        <button className="icon-button" type="button" aria-label="Уведомления"><Bell size={17} strokeWidth={1.8} /></button>
        <div className="avatar">T7</div>
      </div>
    </header>
  )
}
