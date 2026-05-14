import React from 'react'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { BottomNav } from './BottomNav'
import { isNative } from '../../lib/platform'

interface PageLayoutProps {
  children: React.ReactNode
}

export function PageLayout({ children }: PageLayoutProps) {
  const native = isNative()

  if (native) {
    // Native Capacitor shell: full-screen with bottom tab bar.
    // No sidebar, no top drawer — content scrolls between safe areas.
    return (
      <div className="flex flex-col h-screen bg-[#0a0a0f]">
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          {children}
        </main>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile top bar + drawer */}
      <MobileNav />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
