import React from 'react'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'

interface PageLayoutProps {
  children: React.ReactNode
}

export function PageLayout({ children }: PageLayoutProps) {
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
