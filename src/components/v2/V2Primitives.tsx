// ─────────────────────────────────────────────
//  Luxor V2 — shared primitives for the redesigned
//  Dashboard, Cashflow and Wealth pages.
//  These wrap the dark-theme tokens defined in
//  index.css under the `.v2-*` class layer so the
//  three pages share the same visual language.
// ─────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react'
import { ArrowRight, LucideIcon, Maximize2, Plus, X } from 'lucide-react'
import { clsx } from 'clsx'
import { Modal } from '../ui/Modal'

// ── Reveal-on-scroll ────────────────────────────
export function useReveal(ref: React.RefObject<HTMLElement>, deps: unknown[] = []) {
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-visible')
      return
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible')
          io.unobserve(e.target)
        }
      })
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' })
    node.querySelectorAll('.v2-reveal').forEach(el => io.observe(el))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

// ── KPI strip card ──────────────────────────────
export function KpiCard({
  caption, value, valueColor, secondary, pillText, pillColor,
}: {
  caption: string
  value: string
  valueColor?: string
  secondary?: string
  pillText?: string
  pillColor?: 'green' | 'red' | 'cyan' | 'amber' | 'orange' | 'muted'
}) {
  const pillStyles: Record<string, { bg: string; fg: string }> = {
    green:  { bg: 'rgba(0,255,136,.1)',  fg: '#00ff88' },
    red:    { bg: 'rgba(255,68,102,.1)', fg: '#ff4466' },
    cyan:   { bg: 'rgba(0,212,255,.1)',  fg: '#00d4ff' },
    amber:  { bg: 'rgba(245,158,11,.1)', fg: '#f59e0b' },
    orange: { bg: 'rgba(255,122,0,.1)',  fg: '#ff7a00' },
    muted:  { bg: 'rgba(85,85,106,.15)', fg: '#8888aa' },
  }
  const p = pillStyles[pillColor ?? 'muted']
  return (
    <div className="v2-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="v2-caption truncate">{caption}</p>
        {pillText && (
          <span className="v2-pill flex-shrink-0" style={{ background: p.bg, color: p.fg }}>
            {pillText}
          </span>
        )}
      </div>
      <p
        className="v2-num text-2xl lg:text-[28px] font-bold tracking-tight mt-2"
        style={{ color: valueColor }}
      >
        {value}
      </p>
      {secondary && <p className="text-[11px] text-[#55556a] mt-1 truncate">{secondary}</p>}
    </div>
  )
}

// ── Attention chip ───────────────────────────────
export function AttentionChip({
  icon: Icon, title, subtitle, tone, onClick,
}: {
  icon: LucideIcon
  title: string
  subtitle: string
  tone: 'red' | 'amber' | 'cyan' | 'orange' | 'green' | 'muted'
  onClick?: () => void
}) {
  const tones: Record<string, { border: string; bg: string; iconBg: string; iconFg: string }> = {
    red:    { border: 'rgba(255,68,102,.25)', bg: 'rgba(255,68,102,.04)', iconBg: 'rgba(255,68,102,.12)', iconFg: '#ff4466' },
    amber:  { border: 'rgba(245,158,11,.25)', bg: 'rgba(245,158,11,.04)', iconBg: 'rgba(245,158,11,.12)', iconFg: '#f59e0b' },
    cyan:   { border: 'rgba(0,212,255,.25)',  bg: 'rgba(0,212,255,.04)',  iconBg: 'rgba(0,212,255,.12)',  iconFg: '#00d4ff' },
    orange: { border: 'rgba(255,122,0,.25)',  bg: 'rgba(255,122,0,.04)',  iconBg: 'rgba(255,122,0,.12)',  iconFg: '#ff7a00' },
    green:  { border: 'rgba(0,255,136,.25)',  bg: 'rgba(0,255,136,.04)',  iconBg: 'rgba(0,255,136,.12)',  iconFg: '#00ff88' },
    muted:  { border: 'rgba(85,85,106,.30)',  bg: 'rgba(85,85,106,.05)',  iconBg: 'rgba(85,85,106,.20)',  iconFg: '#8888aa' },
  }
  // Defensive: any unknown tone falls back to muted instead of crashing.
  const t = tones[tone] ?? tones.muted
  return (
    <button
      onClick={onClick}
      type="button"
      className="v2-alert-chip v2-card text-left w-full"
      style={{ borderColor: t.border, background: t.bg }}
    >
      <span
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: t.iconBg, color: t.iconFg }}
      >
        <Icon className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{title}</p>
        <p className="text-[11px] text-[#8888aa] truncate">{subtitle}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-[#55556a] flex-shrink-0" />
    </button>
  )
}

// ── Floating action button + secondary actions ───
export function FabMenu({
  onPrimary, secondaries,
}: {
  onPrimary: () => void
  secondaries?: { icon: LucideIcon; label: string; onClick: () => void }[]
}) {
  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-3 items-end pointer-events-none">
      {secondaries && secondaries.length > 0 && (
        <div className="hidden sm:flex flex-col gap-2 mb-1 pointer-events-auto">
          {secondaries.map((s, i) => (
            <button
              key={i}
              onClick={s.onClick}
              className="v2-card v2-card-clickable flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#8888aa] hover:text-white"
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={onPrimary}
        className="v2-fab w-14 h-14 rounded-2xl flex items-center justify-center font-bold pointer-events-auto"
        aria-label="Adicionar"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  )
}

// ── Period tab strip ─────────────────────────────
export function PeriodTabs<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0f1018] border border-[#1e1e30]">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx('v2-period-tab', value === o.value && 'active')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Expandable card ─────────────────────────────
// Wraps a v2-card surface with a click affordance + an expand icon
// in the corner. When clicked, opens a Modal that renders the full
// detail view supplied via `detail`. Used across Dashboard / Cashflow
// / Wealth bento grids so every clickable card shows its full data on
// click (top movers → all movers, allocation summary → full table, etc.)
export function ExpandableCard({
  title, subtitle, children, detail, modalSize = 'xl',
  className, gridClass,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  detail: React.ReactNode | ((closeFn: () => void) => React.ReactNode)
  modalSize?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  gridClass?: string
}) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  // We use a div + role="button" instead of a real <button> so the card
  // can safely contain other interactive children (Ver todos → links,
  // tabs, etc.) without nested-button HTML invalidity. Children that
  // need to NOT trigger expansion should stopPropagation on their click.
  const onActivate = (e: React.MouseEvent | React.KeyboardEvent) => {
    if ('key' in e && e.key !== 'Enter' && e.key !== ' ') return
    if ('key' in e) e.preventDefault()
    setOpen(true)
  }
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onActivate}
        onKeyDown={onActivate}
        className={clsx(
          'v2-card v2-card-clickable text-left w-full relative group cursor-pointer',
          'p-5 focus:outline-none focus:ring-2 focus:ring-[#00d4ff]/40',
          gridClass,
          className,
        )}
      >
        <span
          className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-[#55556a] group-hover:text-[#00d4ff] group-hover:bg-[#0a0a0f] transition-colors pointer-events-none"
          aria-hidden
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </span>
        {children}
      </div>
      <Modal open={open} onClose={close} title={title} description={subtitle} size={modalSize}>
        <div className="v2-root p-5 sm:p-6">
          {typeof detail === 'function' ? detail(close) : detail}
        </div>
      </Modal>
    </>
  )
}

// ── Helper to stop a nested click from triggering the parent expand. ──
export function stopExpand(e: React.MouseEvent) {
  e.stopPropagation()
}

// ── Donut chart ─────────────────────────────────
// SVG-based donut for breakdowns by liquidity / tax treatment / risk /
// institution. Renders inside any v2-card; supports an optional center
// label and a legend below.
export interface DonutSlice {
  label: string
  value: number
  color: string
  /** Optional secondary text shown below the label in the legend (e.g. "12%") */
  subtitle?: string
}

export function Donut({
  data, centerLabel, centerValue, size = 180, strokeWidth = 26,
}: {
  data: DonutSlice[]
  centerLabel?: string
  centerValue?: string
  size?: number
  strokeWidth?: number
}) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0)
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r

  if (total <= 0) {
    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto" style={{ maxWidth: size }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e1e30" strokeWidth={strokeWidth}/>
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="#55556a" fontSize="10" fontFamily="Inter">sem dados</text>
      </svg>
    )
  }

  // Render slices as stroke-dasharray segments — simpler and more robust
  // than path arcs for small slices (no large-arc-flag bugs at edge cases).
  let acc = 0
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto" style={{ maxWidth: size }}>
      {/* track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e1e30" strokeWidth={strokeWidth}/>
      {data.map((d, i) => {
        const frac = d.value / total
        const dash = frac * circumference
        const gap  = circumference - dash
        const offset = -acc * circumference
        acc += frac
        if (dash <= 0) return null
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        )
      })}
      {(centerValue || centerLabel) && (
        <>
          {centerValue && (
            <text x={cx} y={cy - 6} textAnchor="middle" fill="#e8e8f0" fontSize={Math.max(13, size * 0.10)} fontWeight="700" fontFamily="Inter">
              {centerValue}
            </text>
          )}
          {centerLabel && (
            <text x={cx} y={cy + (centerValue ? 12 : 4)} textAnchor="middle" fill="#55556a" fontSize="9" fontFamily="Inter" letterSpacing="0.06em">
              {centerLabel.toUpperCase()}
            </text>
          )}
        </>
      )}
    </svg>
  )
}

// ── Compact legend for donut charts ─────────────
export function DonutLegend({ data, total }: { data: DonutSlice[]; total?: number }) {
  const sum = total ?? data.reduce((s, d) => s + d.value, 0)
  return (
    <ul className="space-y-1.5 text-xs">
      {data.map((d, i) => {
        const pct = sum > 0 ? (d.value / sum) * 100 : 0
        return (
          <li key={i} className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }}/>
            <span className="flex-1 min-w-0 truncate text-[#8888aa]">{d.label}</span>
            <span className="v2-num font-semibold flex-shrink-0">{pct.toFixed(0)}%</span>
            {d.subtitle && <span className="v2-num text-[10px] text-[#55556a] flex-shrink-0">{d.subtitle}</span>}
          </li>
        )
      })}
    </ul>
  )
}

// ── Page header (title + subtitle + right slot) ──
export function V2PageHeader({
  title, subtitle, right,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-30 px-4 sm:px-6 py-4 border-b border-[#1e1e30] bg-[#0a0a0f]/95 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-[#55556a] mt-0.5 truncate">{subtitle}</p>}
        </div>
        {right && <div className="flex items-center gap-3 flex-wrap">{right}</div>}
      </div>
    </header>
  )
}
