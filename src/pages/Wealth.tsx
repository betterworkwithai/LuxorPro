// ─────────────────────────────────────────────────────────────────────
//  Luxor Portfolio Management — three-tier (Global / Local / Intl)
//  investment dashboard with suitability rebalancing engine.
// ─────────────────────────────────────────────────────────────────────
import React, { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Treemap, Legend, CartesianGrid,
} from 'recharts'
import {
  Plus, Globe, Building2, Home, Trash2, Edit3, ChevronDown, ChevronRight, ChevronUp,
  TrendingUp, TrendingDown, Wallet, Layers, ArrowUpRight, AlertTriangle, FileDown,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useStore } from '../store/useStore'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardHeader, CardTitle, CardContent, StatCard } from '../components/ui/Card'
import { formatBRL, formatUSD, formatPct } from '../lib/formatters'
import { InvestmentModal } from '../components/modals/InvestmentModal'
import type { Investment, TaxTreatment, AssetLocation } from '../lib/types'
import { RISK_LABELS } from '../lib/types'
import {
  SUITABILITY_PROFILES, LOCAL_TARGETS, INTL_TARGETS,
  LOCAL_CLASSES, INTL_CLASSES,
  canonicalLocalClass, canonicalIntlClass, buildAllocation, convert,
  type SuitabilityProfile, type AllocationRow,
} from '../lib/suitability'
import { exportPortfolioPdf } from '../lib/exportPortfolioPdf'

// ─── Visual constants (Luxor: Black / Blue / Orange) ────────────────
const ORANGE = '#ff7a00'
const BLUE   = '#3b82f6'
const CYAN   = '#00d4ff'
const GREEN  = '#00ff88'
const RED    = '#ff4466'
const PURPLE = '#8b5cf6'

const TREEMAP_COLORS = [
  ORANGE, BLUE, CYAN, '#f59e0b', GREEN, PURPLE,
  '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#10b981',
]

const TAX_BADGES: Record<TaxTreatment, { label: string; color: string }> = {
  'taxable':      { label: 'Tributável',      color: RED },
  'tax-deferred': { label: 'Imposto Diferido', color: '#f59e0b' },
  'tax-exempt':   { label: 'Isento de IR',     color: GREEN },
}

const RISK_COLORS: Record<number, string> = {
  1: '#60a5fa', 2: '#84cc16', 3: '#eab308', 4: '#f97316', 5: '#ef4444',
}

const tt = { background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 12, fontSize: 12, color: '#ffffff' }
const ttItem  = { color: '#ffffff' }
const ttLabel = { color: '#ffffff', fontWeight: 600 }

const PERIOD_OPTIONS = ['1M', '6M', 'YTD', '1 ano', 'ALL'] as const
type PeriodOption = typeof PERIOD_OPTIONS[number]

type ViewMode = 'global' | 'local' | 'international'

// ─── Helpers ────────────────────────────────────────────────────────
function periodCutoff(p: PeriodOption): Date | null {
  const now = new Date()
  if (p === 'ALL') return null
  if (p === 'YTD') return new Date(now.getFullYear(), 0, 1)
  if (p === '1M')  { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d }
  if (p === '6M')  { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d }
  if (p === '1 ano')  { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d }
  return null
}

/** Build performance series in the chosen base currency. Uses real
 *  priceHistory points if present, otherwise interpolates linearly
 *  from purchase date (avgCost) → today (currentPrice). */
function buildPerformance(
  investments: Investment[],
  toBase: (amount: number, from: 'BRL' | 'USD' | 'EUR') => number,
  cutoff: Date | null,
): { date: string; value: number }[] {
  // Find global window
  let earliest = cutoff ? cutoff.getTime() : Infinity
  if (!cutoff) {
    investments.forEach(i => {
      const d = i.purchaseDate ? new Date(i.purchaseDate).getTime() : NaN
      if (!isNaN(d) && d < earliest) earliest = d
    })
    if (earliest === Infinity) {
      const d = new Date(); d.setMonth(d.getMonth() - 12); earliest = d.getTime()
    }
  }
  const start = new Date(earliest)
  const end   = new Date()
  // Sample ~30 points
  const pts = 30
  const stepMs = (end.getTime() - start.getTime()) / Math.max(1, pts - 1)

  const series: { date: string; value: number }[] = []
  for (let s = 0; s < pts; s++) {
    const t = new Date(start.getTime() + stepMs * s)
    let total = 0
    investments.forEach(i => {
      const purchase = i.purchaseDate ? new Date(i.purchaseDate) : null
      if (purchase && t < purchase) return
      let unitPrice = i.currentPrice
      if (i.priceHistory && i.priceHistory.length > 0) {
        // Find closest point ≤ t
        const sorted = [...i.priceHistory].sort((a, b) => a.date.localeCompare(b.date))
        const targetIso = t.toISOString().slice(0, 10)
        const matched = sorted.filter(p => p.date <= targetIso).pop()
        unitPrice = matched ? matched.price : sorted[0].price
      } else if (purchase) {
        const ageMs = end.getTime() - purchase.getTime()
        const fromMs = t.getTime() - purchase.getTime()
        const frac = ageMs > 0 ? Math.max(0, Math.min(1, fromMs / ageMs)) : 1
        unitPrice = i.avgCost + (i.currentPrice - i.avgCost) * frac
      }
      total += toBase(i.quantity * unitPrice, i.currency)
    })
    series.push({
      date: t.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      value: total,
    })
  }
  return series
}

// ─── Asset card ─────────────────────────────────────────────────────
function AssetCard({
  inv, baseValue, totalValue, currency, onEdit, onDelete,
}: {
  inv: Investment
  baseValue: number
  totalValue: number
  currency: 'BRL' | 'USD' | 'EUR'
  onEdit: () => void
  onDelete: () => void
}) {
  const cost      = inv.quantity * inv.avgCost
  const value     = inv.quantity * inv.currentPrice
  const gain      = value - cost
  const gainPct   = cost > 0 ? (gain / cost) * 100 : 0
  const allocPct  = totalValue > 0 ? (baseValue / totalValue) * 100 : 0
  const tax       = TAX_BADGES[inv.taxTreatment ?? 'taxable']
  const fmtNative = (v: number) =>
    inv.currency === 'USD' ? formatUSD(v) :
    inv.currency === 'EUR' ? `€ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` :
    formatBRL(v)
  const fmtBase = (v: number) =>
    currency === 'USD' ? formatUSD(v) :
    currency === 'EUR' ? `€ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` :
    formatBRL(v)

  return (
    <div className="rounded-xl border border-[#1e1e2e] bg-[#0d0d14] p-4 hover:border-[#ff7a00]/30 transition-all">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-sm font-semibold text-[#e8e8f0] truncate">{inv.name}</p>
            {inv.ticker && <span className="text-[10px] text-[#55556a] font-mono">{inv.ticker}</span>}
          </div>
          <p className="text-[11px] text-[#8888aa]">{inv.assetClass} · {inv.institution}</p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={onEdit} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#55556a] hover:text-[#ff7a00] hover:bg-[#ff7a00]/10">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#55556a] hover:text-[#ff4466] hover:bg-[#ff4466]/10">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tags row */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border"
          style={{ background: tax.color + '15', borderColor: tax.color + '40', color: tax.color }}>
          {tax.label}
        </span>
        {inv.liquidity && (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#16161f] border border-[#1e1e2e] text-[#8888aa]">
            {inv.liquidity}
          </span>
        )}
        {inv.riskLevel && (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border"
            style={{ background: RISK_COLORS[inv.riskLevel] + '15', borderColor: RISK_COLORS[inv.riskLevel] + '40', color: RISK_COLORS[inv.riskLevel] }}>
            Risco {RISK_LABELS[inv.riskLevel]}
          </span>
        )}
        {inv.benchmark && (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#16161f] border border-[#1e1e2e] text-[#8888aa]">
            vs {inv.benchmark}
          </span>
        )}
        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#ff7a00]/10 border border-[#ff7a00]/30 text-[#ff7a00] ml-auto">
          {allocPct.toFixed(2)}%
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <p className="text-[#55556a] mb-0.5">Valor</p>
          <p className="text-[#e8e8f0] font-semibold font-mono">{fmtNative(value)}</p>
          {inv.currency !== currency && (
            <p className="text-[#55556a] text-[10px]">≈ {fmtBase(baseValue)}</p>
          )}
        </div>
        <div>
          <p className="text-[#55556a] mb-0.5">Investido</p>
          <p className="text-[#8888aa] font-mono">{fmtNative(cost)}</p>
        </div>
        <div>
          <p className="text-[#55556a] mb-0.5">Ganho</p>
          <p className={clsx('font-semibold font-mono', gain >= 0 ? 'text-[#00ff88]' : 'text-[#ff4466]')}>
            {gain >= 0 ? '+' : ''}{formatPct(gainPct)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Suitability bar chart ──────────────────────────────────────────
function SuitabilityChart({ rows, currency }: { rows: AllocationRow[]; currency: string }) {
  const data = rows
    .filter(r => r.targetPct > 0 || r.actualPct > 0.1)
    .map(r => ({
      cls: r.cls.length > 22 ? r.cls.slice(0, 20) + '…' : r.cls,
      fullCls: r.cls,
      Atual:    Number(r.actualPct.toFixed(2)),
      Meta:     Number(r.targetPct.toFixed(2)),
      gapValue: r.gapValue,
    }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(280, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
        <XAxis type="number" stroke="#55556a" fontSize={10} tickFormatter={v => `${v}%`} />
        <YAxis type="category" dataKey="cls" stroke="#8888aa" fontSize={10} width={140} interval={0} />
        <Tooltip
          contentStyle={tt}
          formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name]}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullCls ?? ''}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8888aa' }} />
        <Bar dataKey="Meta"  fill={BLUE}   radius={[0, 4, 4, 0]} />
        <Bar dataKey="Atual" fill={ORANGE} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Rebalancing table ──────────────────────────────────────────────
function RebalancingTable({ rows, currency, fmt }: {
  rows: AllocationRow[]
  currency: string
  fmt: (v: number) => string
}) {
  // Show every class that has a non-zero target OR a non-zero actual,
  // preserving the canonical order coming from `allocation.rows`.
  const filtered = rows.filter(r => Math.abs(r.gapPct) >= 0.1 && (r.targetPct > 0 || r.actualPct > 0))
  if (filtered.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-[#55556a]">
        ✓ Carteira alinhada ao perfil. Nenhum rebalanceamento significativo.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {filtered.map(r => {
        const overweight = r.gapPct > 0
        const action = overweight ? 'Reduzir' : 'Aumentar'
        const color  = overweight ? RED : GREEN
        return (
          <div key={r.cls} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#0d0d14] border border-[#1e1e2e]">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[#e8e8f0] truncate">{r.cls}</p>
              <p className="text-[10px] text-[#55556a] mt-0.5">
                Atual {r.actualPct.toFixed(1)}% · Meta {r.targetPct.toFixed(1)}%
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs font-semibold" style={{ color }}>
                {action} {fmt(Math.abs(r.gapValue))}
              </p>
              <p className="text-[10px]" style={{ color }}>
                {overweight ? '+' : ''}{r.gapPct.toFixed(1)}%
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Treemap cell renderer ──────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TreemapCell(props: any) {
  const { x, y, width, height, name, payload, root } = props
  if (width < 30 || height < 24) return null
  const fill = payload?.fill ?? root?.children?.[props.index]?.fill ?? ORANGE
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#0a0a0f" strokeWidth={2} />
      <text x={x + 6} y={y + 14} fill="#0a0a0f" fontSize={10} fontWeight={600}>
        {name?.length > 16 ? name.slice(0, 14) + '…' : name}
      </text>
    </g>
  )
}

// ─── Main page ──────────────────────────────────────────────────────
export default function Wealth() {
  const { investments, deleteInvestment, settings, saveSettings } = useStore()
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState<Investment | undefined>()
  const [view,      setView]      = useState<ViewMode>('global')
  const [period,    setPeriod]    = useState<PeriodOption>('1 ano')
  const [showBenchmark, setShowBenchmark] = useState(false)
  const [groupExpanded, setGroupExpanded] = useState<Record<string, boolean>>({})

  const usdToBrl = settings.usdToBrl
  const eurToBrl = settings.eurToBrl ?? 5.50
  const profile  = (settings.suitability ?? 'Moderado') as SuitabilityProfile

  // Display currency depends on view
  const displayCurrency: 'BRL' | 'USD' | 'EUR' =
    view === 'international' ? 'USD' : 'BRL'

  const toBase = (amount: number, from: 'BRL' | 'USD' | 'EUR') =>
    convert(amount, from, displayCurrency, usdToBrl, eurToBrl)

  const fmtBase = (v: number) => {
    const dc = displayCurrency as string
    if (dc === 'USD') return formatUSD(v)
    if (dc === 'EUR') return `€ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return formatBRL(v)
  }

  // Filter investments per view
  const viewInvestments = useMemo(() => {
    if (view === 'global') return investments
    if (view === 'local')  return investments.filter(i => i.location === 'onshore' || i.location === 'physical-re')
    return investments.filter(i => i.location === 'offshore')
  }, [investments, view])

  // Liquid (excludes physical RE) — used for suitability
  const liquidInvestments = useMemo(
    () => viewInvestments.filter(i => i.location !== 'physical-re'),
    [viewInvestments],
  )

  // Portfolio metrics
  const metrics = useMemo(() => {
    const totalValue = viewInvestments.reduce((s, i) => s + toBase(i.quantity * i.currentPrice, i.currency), 0)
    const totalCost  = viewInvestments.reduce((s, i) => s + toBase(i.quantity * i.avgCost,      i.currency), 0)
    const totalDivs  = viewInvestments.reduce((s, i) => s + toBase(i.dividendsReceived ?? 0,    i.currency), 0)
    const totalIntr  = viewInvestments.reduce((s, i) => s + toBase(i.interestReceived  ?? 0,    i.currency), 0)
    const totalGain  = totalValue - totalCost
    const totalRet   = totalGain + totalDivs + totalIntr
    const gainPct    = totalCost > 0 ? (totalGain / totalCost) * 100 : 0
    const retPct     = totalCost > 0 ? (totalRet  / totalCost) * 100 : 0

    // Offshore exposure (only meaningful in global view)
    const offshoreValue = investments
      .filter(i => i.location === 'offshore')
      .reduce((s, i) => s + convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl), 0)
    const allValueBrl = investments
      .reduce((s, i) => s + convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl), 0)
    const offshorePct = allValueBrl > 0 ? (offshoreValue / allValueBrl) * 100 : 0

    return { totalValue, totalCost, totalGain, totalRet, gainPct, retPct, totalDivs, totalIntr, offshorePct }
  }, [viewInvestments, investments, usdToBrl, eurToBrl, displayCurrency])

  // Investments scoped to the main view (Global / Local / Internacional), excluding physical RE
  const chartInvestments = useMemo(() => {
    return investments.filter(i => {
      if (i.location === 'physical-re') return false
      if (view === 'local')         return i.location === 'onshore'
      if (view === 'international') return i.location === 'offshore'
      return true
    })
  }, [investments, view])

  // FX exposure (liquid assets only — physical RE excluded), scoped
  const fxData = useMemo(() => {
    const m = new Map<string, number>()
    chartInvestments.forEach(i => {
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      m.set(i.currency, (m.get(i.currency) ?? 0) + v)
    })
    return Array.from(m.entries()).map(([cur, val]) => ({ name: cur, value: val }))
  }, [chartInvestments, usdToBrl, eurToBrl])

  // Treemap data — liquid assets only (allocation by class excludes physical RE), scoped
  const treemapData = useMemo(() => {
    const m = new Map<string, number>()
    chartInvestments.forEach(i => {
      const v = toBase(i.quantity * i.currentPrice, i.currency)
      m.set(i.assetClass, (m.get(i.assetClass) ?? 0) + v)
    })
    return Array.from(m.entries())
      .map(([name, size], idx) => ({ name, size, fill: TREEMAP_COLORS[idx % TREEMAP_COLORS.length] }))
      .sort((a, b) => b.size - a.size)
  }, [chartInvestments, displayCurrency, usdToBrl, eurToBrl])

  // Allocation vs targets
  const allocation = useMemo(() => {
    if (view === 'international') {
      return buildAllocation(liquidInvestments, INTL_TARGETS[profile], canonicalIntlClass, toBase)
    }
    // Local & global both compare against the local matrix for the rebalancing widget
    return buildAllocation(
      liquidInvestments.filter(i => i.location === 'onshore'),
      LOCAL_TARGETS[profile],
      canonicalLocalClass,
      toBase,
    )
  }, [liquidInvestments, view, profile, usdToBrl, eurToBrl, displayCurrency])

  // Performance series
  const cutoff = useMemo(() => periodCutoff(period), [period])
  const performance = useMemo(
    () => buildPerformance(viewInvestments, toBase, cutoff),
    [viewInvestments, cutoff, displayCurrency, usdToBrl, eurToBrl],
  )

  // Period delta
  const periodDelta = useMemo(() => {
    if (performance.length < 2) return { abs: 0, pct: 0 }
    const first = performance[0].value
    const last  = performance[performance.length - 1].value
    return { abs: last - first, pct: first > 0 ? ((last - first) / first) * 100 : 0 }
  }, [performance])

  // Grouped by asset class — sorted in canonical order
  const groupedAssets = useMemo(() => {
    const groups = new Map<string, Investment[]>()
    viewInvestments.forEach(i => {
      if (!groups.has(i.assetClass)) groups.set(i.assetClass, [])
      groups.get(i.assetClass)!.push(i)
    })
    const entries = Array.from(groups.entries()).map(([cls, items]) => ({
      cls,
      items: items.sort((a, b) => a.institution.localeCompare(b.institution, 'pt-BR')),
      total: items.reduce((s, i) => s + toBase(i.quantity * i.currentPrice, i.currency), 0),
    }))

    // Build canonical order index: local classes first, then intl, then physical-RE / unknowns last
    const orderIndex = new Map<string, number>()
    let idx = 0
    LOCAL_CLASSES.forEach(c => { if (!orderIndex.has(c)) orderIndex.set(c, idx++) })
    INTL_CLASSES.forEach(c => { if (!orderIndex.has(c)) orderIndex.set(c, idx++) })

    entries.sort((a, b) => {
      const ca = canonicalLocalClass(a.cls)
      const cb = canonicalLocalClass(b.cls)
      const ia = orderIndex.get(ca) ?? orderIndex.get(canonicalIntlClass(a.cls)) ?? Infinity
      const ib = orderIndex.get(cb) ?? orderIndex.get(canonicalIntlClass(b.cls)) ?? Infinity
      if (ia !== ib) return ia - ib
      return b.total - a.total
    })
    return entries
  }, [viewInvestments, displayCurrency, usdToBrl, eurToBrl])

  const handleProfile = async (p: SuitabilityProfile) => {
    await saveSettings({ ...settings, suitability: p })
  }

  const VIEW_OPTIONS: { value: ViewMode; label: string; icon: typeof Globe; color: string; sub: string }[] = [
    { value: 'global',        label: 'Global',                 icon: Layers,    color: ORANGE, sub: 'Consolidado em BRL' },
    { value: 'local',         label: 'Brasil',                 icon: Building2, color: CYAN,   sub: 'Onshore (BRL)' },
    { value: 'international', label: 'Internacional',          icon: Globe,     color: BLUE,   sub: 'Offshore (USD)' },
  ]

  return (
    <div className="min-h-screen animate-fade-in bg-[#0a0a0f]">
      <PageHeader
        title="Meus Investimentos"
        subtitle={`Perfil ${profile} · ${investments.length} ativo${investments.length === 1 ? '' : 's'}`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportPortfolioPdf({
                view, profile, displayCurrency, fmt: fmtBase,
                metrics, allocation: allocation.rows, performance, period,
                investments: liquidInvestments, toBase,
                fxRates: { usdToBrl, eurToBrl },
              })}
              disabled={viewInvestments.length === 0}
              title="Exportar portfólio em PDF"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-[#1e1e2e] bg-[#0d0d14] text-[#e8e8f0] hover:border-[#ff7a00]/50 hover:text-[#ff7a00] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <FileDown className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar PDF</span>
            </button>
            <button onClick={() => { setEditing(undefined); setShowModal(true) }}
              className="btn-primary flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Adicionar Ativo</span>
            </button>
          </div>
        }
      />

      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">

        {/* ─── View Switcher ─── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {VIEW_OPTIONS.map(opt => {
            const Icon = opt.icon
            const active = view === opt.value
            return (
              <button key={opt.value} onClick={() => setView(opt.value)}
                className="p-3 sm:p-4 rounded-xl border transition-all text-left flex items-center gap-3"
                style={active ? {
                  background: `linear-gradient(135deg, ${opt.color}18, ${opt.color}05)`,
                  borderColor: opt.color + '55',
                } : { background: '#0d0d14', borderColor: '#1e1e2e' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: opt.color + '15', color: opt.color }}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate" style={{ color: active ? opt.color : '#e8e8f0' }}>
                    {opt.label}
                  </p>
                  <p className="text-[10px] sm:text-xs text-[#55556a] truncate">{opt.sub}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* ─── Suitability Profile Selector ─── */}
        <div className="rounded-xl bg-[#0d0d14] border border-[#1e1e2e] p-3 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-[#8888aa] font-medium uppercase tracking-wider">Perfil de Investidor</span>
          <div className="flex gap-1 flex-1 flex-wrap">
            {SUITABILITY_PROFILES.map(p => (
              <button key={p} onClick={() => handleProfile(p)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  profile === p
                    ? 'bg-[#ff7a00] text-[#0a0a0f]'
                    : 'bg-[#16161f] text-[#55556a] hover:text-[#e8e8f0]',
                )}>
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pl-3 border-l border-[#1e1e2e]">
            <span className="text-xs text-[#8888aa] uppercase tracking-wider">Exposição Offshore Recomendada</span>
            <span className="text-sm font-bold text-[#8b5cf6]">
              {({ Conservador: 5, Moderado: 15, Arrojado: 30, Agressivo: 40 } as Record<SuitabilityProfile, number>)[profile]}%
            </span>
            <span className="text-[10px] text-[#55556a]">do total global</span>
          </div>
        </div>

        {/* ─── Summary Header ─── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            title="Patrimônio Total"
            value={fmtBase(metrics.totalValue)}
            subtitle={`Investido: ${fmtBase(metrics.totalCost)}`}
            icon={<Wallet className="w-4 h-4" />}
            color="orange"
          />
          <StatCard
            title="Ganho Total"
            value={fmtBase(metrics.totalGain)}
            delta={metrics.gainPct}
            icon={metrics.totalGain >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            color={metrics.totalGain >= 0 ? 'green' : 'red'}
          />
          <StatCard
            title={period}
            value={fmtBase(periodDelta.abs)}
            delta={periodDelta.pct}
            icon={<ArrowUpRight className="w-4 h-4" />}
            color={periodDelta.abs >= 0 ? 'cyan' : 'red'}
          />
          <StatCard
            title="Alocação Offshore"
            value={`${metrics.offshorePct.toFixed(1)}%`}
            subtitle={view === 'global' ? 'Total global' : 'Carteira inteira'}
            icon={<Globe className="w-4 h-4" />}
            color="purple"
          />
        </div>

        {/* ─── Performance line chart ─── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle>Performance Consolidada</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setShowBenchmark(s => !s)}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all',
                    showBenchmark
                      ? 'bg-[#3b82f6]/15 border-[#3b82f6]/40 text-[#3b82f6]'
                      : 'bg-[#16161f] border-[#1e1e2e] text-[#55556a] hover:text-[#e8e8f0]',
                  )}>
                  vs Benchmark
                </button>
                <div className="flex gap-1 bg-[#16161f] rounded-lg p-1 border border-[#1e1e2e]">
                  {PERIOD_OPTIONS.map(p => (
                    <button key={p} onClick={() => setPeriod(p)}
                      className={clsx('px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all',
                        period === p ? 'bg-[#ff7a00] text-[#0a0a0f]' : 'text-[#55556a] hover:text-[#e8e8f0]')}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {performance.length === 0 || metrics.totalValue === 0 ? (
              <div className="h-64 flex items-center justify-center text-xs text-[#55556a]">
                Adicione ativos para visualizar a performance.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={performance.map((p, idx) => {
                  if (!showBenchmark) return p
                  // Synthetic benchmark: linear growth at 12% a.a. for visual comparison
                  const months = (idx / (performance.length - 1 || 1)) * 12
                  const base = performance[0].value
                  const bench = base * Math.pow(1.12, months / 12)
                  return { ...p, benchmark: bench }
                })} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ORANGE} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={ORANGE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="date" stroke="#55556a" fontSize={10} />
                  <YAxis stroke="#55556a" fontSize={10}
                    tickFormatter={v => displayCurrency === 'USD' ? `$${(v / 1000).toFixed(0)}k` : `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tt} formatter={(v: number) => fmtBase(v)} />
                  {showBenchmark && <Legend wrapperStyle={{ fontSize: 11, color: '#8888aa' }} />}
                  <Line type="monotone" dataKey="value" name="Carteira" stroke={ORANGE} strokeWidth={2.5}
                    dot={false} activeDot={{ r: 4, fill: ORANGE }} fill="url(#lineGrad)" />
                  {showBenchmark && (
                    <Line type="monotone" dataKey="benchmark"
                      name={view === 'international' ? 'S&P 500 (12% a.a.)' : 'CDI (12% a.a.)'}
                      stroke={BLUE} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ─── Allocation widgets ─── */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-semibold text-[#8888aa] uppercase tracking-wider">Composição da Carteira</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Exposição Por Moeda</CardTitle></CardHeader>
              <CardContent>
                {fxData.length === 0 ? (
                  <div className="h-56 flex items-center justify-center text-xs text-[#55556a]">Sem dados</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={fxData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                        innerRadius={55} outerRadius={90} paddingAngle={2}>
                        {fxData.map((_, i) => (
                          <Cell key={i} fill={[ORANGE, BLUE, PURPLE][i % 3]} stroke="#0a0a0f" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tt} itemStyle={ttItem} labelStyle={ttLabel}
                        formatter={(v: number, name: string) => {
                          const total = fxData.reduce((s, d) => s + d.value, 0)
                          const pct = total > 0 ? (v / total) * 100 : 0
                          return [`${formatBRL(v)} (${pct.toFixed(1)}%)`, name]
                        }} />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#8888aa' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Alocação Por Classe de Ativo</CardTitle></CardHeader>
              <CardContent>
                {treemapData.length === 0 ? (
                  <div className="h-56 flex items-center justify-center text-xs text-[#55556a]">Sem dados</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={treemapData}
                        dataKey="size"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {treemapData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} stroke="#0a0a0f" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tt} itemStyle={ttItem} labelStyle={ttLabel}
                        formatter={(v: number, name: string) => {
                          const total = treemapData.reduce((s, d) => s + d.size, 0)
                          const pct = total > 0 ? (v / total) * 100 : 0
                          return [`${fmtBase(v)} (${pct.toFixed(1)}%)`, name]
                        }} />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#8888aa' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </div>


        {/* ─── Suitability Engine ─── */}
        {liquidInvestments.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>
                  Atual vs. Meta · {view === 'international' ? 'Internacional' : 'Local'} ({profile})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SuitabilityChart rows={allocation.rows} currency={displayCurrency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#ff7a00]" />
                  <CardTitle>Rebalanceamento Sugerido Para Seu Perfil</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <RebalancingTable rows={allocation.rows} currency={displayCurrency} fmt={fmtBase} />
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── Asset list grouped by class ─── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Ativos {view === 'global' ? 'Consolidados' : view === 'local' ? 'Locais' : 'Internacionais'}</CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#55556a]">{viewInvestments.length} ativos</span>
                <button
                  onClick={() => {
                    const allExpanded = groupedAssets.every(g => groupExpanded[g.cls] !== false)
                    const next: Record<string, boolean> = {}
                    groupedAssets.forEach(g => { next[g.cls] = !allExpanded })
                    setGroupExpanded(next)
                  }}
                  className="flex items-center gap-1 text-xs text-[#8888aa] hover:text-[#e8e8f0] transition-colors px-2 py-1 rounded-lg hover:bg-[#16161f]"
                >
                  {groupedAssets.every(g => groupExpanded[g.cls] !== false)
                    ? <><ChevronUp className="w-3 h-3" />Recolher</>
                    : <><ChevronDown className="w-3 h-3" />Expandir</>
                  }
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {viewInvestments.length === 0 ? (
              <div className="text-center py-12">
                <Wallet className="w-10 h-10 text-[#55556a] mx-auto mb-3" />
                <p className="text-sm text-[#8888aa] mb-1">Nenhum ativo nesta visão.</p>
                <p className="text-xs text-[#55556a] mb-4">Adicione seu primeiro ativo para começar.</p>
                <button onClick={() => { setEditing(undefined); setShowModal(true) }}
                  className="btn-primary inline-flex">
                  <Plus className="w-4 h-4" /> Adicionar Ativo
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {groupedAssets.map(group => {
                  const expanded = groupExpanded[group.cls] ?? true
                  const hasPhysical = group.items.some(i => i.location === 'physical-re')
                  return (
                    <div key={group.cls} className="rounded-xl border border-[#1e1e2e] overflow-hidden">
                      <button onClick={() => setGroupExpanded(s => ({ ...s, [group.cls]: !expanded }))}
                        className="w-full flex items-center justify-between px-4 py-3 bg-[#0d0d14] hover:bg-[#111118] transition-colors">
                        <div className="flex items-center gap-2">
                          {expanded ? <ChevronDown className="w-4 h-4 text-[#55556a]" /> : <ChevronRight className="w-4 h-4 text-[#55556a]" />}
                          <div className="flex flex-col items-start">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[#e8e8f0]">{group.cls}</span>
                              <span className="text-[10px] text-[#55556a]">({group.items.length})</span>
                              {hasPhysical && (
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-medium bg-[#8b5cf6]/15 border border-[#8b5cf6]/40 text-[#8b5cf6]">
                                  Ativo Ilíquido
                                </span>
                              )}
                            </div>
                            <div className="flex items-baseline gap-2 mt-0.5">
                              <span className="text-sm font-bold text-[#ff7a00] font-mono">{fmtBase(group.total)}</span>
                              <span className="text-xs text-[#8888aa]">
                                {metrics.totalValue > 0 ? ((group.total / metrics.totalValue) * 100).toFixed(2) : '0'}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                      {expanded && (
                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3 bg-[#080810]">
                          {group.items.map(inv => (
                            <AssetCard key={inv.id} inv={inv}
                              baseValue={toBase(inv.quantity * inv.currentPrice, inv.currency)}
                              totalValue={metrics.totalValue}
                              currency={displayCurrency}
                              onEdit={() => { setEditing(inv); setShowModal(true) }}
                              onDelete={() => {
                                if (confirm(`Remover "${inv.name}"?`)) deleteInvestment(inv.id)
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      <InvestmentModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditing(undefined) }}
        initial={editing}
      />
    </div>
  )
}
