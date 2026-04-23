import React from 'react'
import { clsx } from 'clsx'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'income' | 'expense' | 'neutral' | 'cyan' | 'purple' | 'amber' | 'success' | 'info' | 'warning' | 'danger'
  className?: string
}

export function Badge({ children, variant = 'neutral', className }: BadgeProps) {
  const variantMap = {
    income:  'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20',
    expense: 'bg-[#ff4466]/10 text-[#ff4466] border border-[#ff4466]/20',
    neutral: 'bg-[#16161f] text-[#8888aa] border border-[#1e1e2e]',
    cyan:    'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20',
    purple:  'bg-[#8b5cf6]/10 text-[#8b5cf6] border border-[#8b5cf6]/20',
    amber:   'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20',
    success: 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20',
    info:    'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20',
    warning: 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20',
    danger:  'bg-[#ff4466]/10 text-[#ff4466] border border-[#ff4466]/20',
  }

  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium',
      variantMap[variant],
      className,
    )}>
      {children}
    </span>
  )
}
