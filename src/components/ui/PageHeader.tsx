import React from 'react'
import { clsx } from 'clsx'

interface PageHeaderProps {
  title: React.ReactNode
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={clsx(
      'sticky top-0 z-10 flex items-center justify-between gap-3 sm:gap-4',
      'px-4 sm:px-6 py-3 sm:py-4 bg-[#0a0a0f]/90 backdrop-blur-md border-b border-[#1e1e2e]',
      className,
    )}>
      <div className="min-w-0 flex-1">
        <h1 className="text-base sm:text-xl font-bold text-[#e8e8f0] tracking-tight truncate">{title}</h1>
        {subtitle && <p className="hidden sm:block text-xs text-[#55556a] mt-0.5 truncate">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
