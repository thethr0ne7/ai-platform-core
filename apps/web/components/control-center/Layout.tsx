import type { ReactNode } from 'react'
import Header from './Header'
import Sidebar from './Sidebar'

export default function ControlCenterLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.018)_1px,transparent_1px)] bg-[size:54px_54px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />

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
