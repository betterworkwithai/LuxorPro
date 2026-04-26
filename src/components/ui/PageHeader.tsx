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
      'px-4 sm:px-6 py-3 sm:py-4 border-b border-[#1e1e2e]',
      'bg-[#0a0a0f]/95 backdrop-blur-xl',
      className,
    )}>
      {/* Left gradient accent */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full"
        style={{ background: 'linear-gradient(180deg, #ff7a00 0%, #ff450060 100%)' }} />

      <div className="min-w-0 flex-1 pl-2">
        <h1 className="text-base sm:text-lg font-bold text-[#e8e8f0] tracking-tight leading-tight truncate">{title}</h1>
        {subtitle && (
          <p className="hidden sm:block text-xs text-[#55556a] mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
