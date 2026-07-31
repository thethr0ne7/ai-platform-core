import type { ReactNode } from 'react'
import AccessGate from '@/components/control-center/AccessGate'
import ControlCenterLayout from '@/components/control-center/Layout'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AccessGate>
      <ControlCenterLayout>{children}</ControlCenterLayout>
    </AccessGate>
  )
}
