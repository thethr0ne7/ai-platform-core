import type { ReactNode } from 'react'
import ControlCenterLayout from '@/components/control-center/Layout'

export default function Layout({ children }: { children: ReactNode }) {
  return <ControlCenterLayout>{children}</ControlCenterLayout>
}
