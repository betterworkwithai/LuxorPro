import React from 'react'
import { clsx } from 'clsx'

interface CardProps {
  children: React.ReactNode
  className?: string
  glow?: 'cyan' | 'green' | 'purple' | 'orange'
}
export function Card({ children, className, glow }: CardProps) {
  return (
    <div
      className={clsx(
        'card',
        glow === 'cyan'   && 'shadow-[0_0_20px_rgba(0,212,255,0.08)]',
        glow === 'green'  && 'shadow-[0_0_20px_rgba(0,255,136,0.08)]',
        glow === 'purple' && 'shadow-[0_0_20px_rgba(139,92,246,0.08)]',
        glow === 'orange' && 'shadow-[0_0_20px_rgba(255,122,0,0.12)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx('px-5 py-4 border-b border-[#1e1e2e]', className)}>{children}</div>
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={clsx('text-base font-semibold text-[#e8e8f0]', className)}>{children}</h3>
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx('p-5', className)}>{children}</div>
}

interface StatCardProps {
  title: string
  value: string
  subtitle?: string
  secondary?: string
  delta?: number
  icon?: React.ReactNode
  color?: 'cyan' | 'green' | 'red' | 'purple' | 'amber' | 'orange'
  className?: string
}
export function StatCard({ title, value, subtitle, secondary, delta, icon, color = 'cyan', className }: StatCardProps) {
  const colorMap = {
    cyan:   { bg: 'bg-[#00d4ff]/10', text: 'text-[#00d4ff]', border: 'border-[#00d4ff]/20' },
    green:  { bg: 'bg-[#00ff88]/10', text: 'text-[#00ff88]', border: 'border-[#00ff88]/20' },
    red:    { bg: 'bg-[#ff4466]/10', text: 'text-[#ff4466]', border: 'border-[#ff4466]/20' },
    purple: { bg: 'bg-[#8b5cf6]/10', text: 'text-[#8b5cf6]', border: 'border-[#8b5cf6]/20' },
    amber:  { bg: 'bg-[#f59e0b]/10', text: 'text-[#f59e0b]', border: 'border-[#f59e0b]/20' },
    orange: { bg: 'bg-[#ff7a00]/10', text: 'text-[#ff7a00]', border: 'border-[#ff7a00]/20' },
  }
  const c = colorMap[color]

  return (
    <div className={clsx('card p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between mb-2.5">
        <p className="text-[11px] text-[#8888aa] font-semibold uppercase tracking-widest leading-tight">{title}</p>
        {icon && (
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', c.bg, `border ${c.border}`)}>
            <span className={c.text}>{icon}</span>
          </div>
        )}
      </div>
      <p className={clsx('text-xl sm:text-2xl font-bold tracking-tight leading-none', c.text)}>{value}</p>
      {(subtitle || delta !== undefined) && (
        <div className="mt-2 flex items-center gap-2">
          {delta !== undefined && (
            <span className={clsx('text-[11px] font-semibold px-1.5 py-0.5 rounded-md', delta >= 0 ? 'text-[#00ff88] bg-[#00ff88]/10' : 'text-[#ff4466] bg-[#ff4466]/10')}>
              {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {subtitle && <span className="text-[11px] text-[#55556a]">{subtitle}</span>}
        </div>
      )}
      {secondary && (
        <p className="text-[11px] text-[#55556a] mt-2 pt-2 border-t border-[#1e1e2e]/60">{secondary}</p>
      )}
    </div>
  )
}
