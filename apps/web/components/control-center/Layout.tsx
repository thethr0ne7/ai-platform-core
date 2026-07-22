import type { ReactNode } from 'react'
import Header from './Header'
import Sidebar from './Sidebar'

export default function ControlCenterLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <div className="workspace-frame">
        <Sidebar />
        <section className="min-w-0 flex-1 pb-24 xl:pb-4">
          <Header />
          <div className="relative">{children}</div>
        </section>
      </div>
    </div>
  )
}
