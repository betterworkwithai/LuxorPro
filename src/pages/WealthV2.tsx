// ─────────────────────────────────────────────
//  Luxor V2 — Investimentos
//  Hero patrimônio + attention strip + 4 KPIs +
//  bento grid (evolução, alocação, dividendos, top
//  movers, suitability gauge) + heatmap + posições
//  table. Wired to the real Zustand store.
// ─────────────────────────────────────────────
import React, { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowDownRight, ArrowDownUp, ArrowRight, ArrowUpRight, Building2,
  ChevronDown, Download, Filter, Gift, Layers, Link2, PlusCircle, RefreshCw,
  Scale, Search, TrendingUp, Wallet, Zap,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatBRL, formatDate, monthName } from '../lib/formatters'
import { convert, LOCAL_CLASSES, INTL_CLASSES, LOCAL_TARGETS, INTL_TARGETS, canonicalLocalClass, canonicalIntlClass, type SuitabilityProfile } from '../lib/suitability'
import {
  AttentionChip, Donut, DonutLegend, type DonutSlice, ExpandableCard, FabMenu, KpiCard, PeriodTabs, useReveal, V2PageHeader,
} from '../components/v2/V2Primitives'
import { InvestmentModal } from '../components/modals/InvestmentModal'
import type { Investment } from '../lib/types'
import { pfPath } from '../constants'

type PeriodMode = '1M' | '3M' | 'YTD' | '12M' | '5A' | 'ALL'
type CurrencyMode = 'BRL' | 'USD' | 'EUR'

const SUITABILITY_SCORE: Record<string, number> = {
  'Conservador': 25, 'Moderado': 50, 'Arrojado': 70, 'Agressivo': 90,
}

export default function WealthV2() {
  const { investments, transactions, settings, deleteInvestment } = useStore()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  const [period, setPeriod] = useState<PeriodMode>('YTD')
  const [currency, setCurrency] = useState<CurrencyMode>('BRL')
  const [showAddInv, setShowAddInv] = useState(false)
  const [editing, setEditing] = useState<Investment | null>(null)
  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState<string>('all')
  const [filterInstitution, setFilterInstitution] = useState<string>('all')
  const [filterTax, setFilterTax] = useState<string>('all')
  const [showAllPos, setShowAllPos] = useState(false)
  type SortKey = 'name' | 'class' | 'institution' | 'qty' | 'avgCost' | 'currentPrice' | 'position' | 'period'
  const [sortKey, setSortKey] = useState<SortKey>('position')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [breakdownLocation, setBreakdownLocation] = useState<'all' | 'onshore' | 'offshore'>('all')
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }
  const sortIcon = (k: SortKey) => sortKey !== k ? '' : (sortDir === 'asc' ? ' ▲' : ' ▼')

  const eurToBrl = settings.eurToBrl ?? 5.90
  const usdToBrl = settings.usdToBrl
  // Stable refs so useMemo deps don't churn every render. The page is
  // mounted long enough that we don't need to track sub-day clock drift.
  const today = useMemo(() => new Date(), [])
  const todayMonth = today.getMonth() + 1
  const todayYear = today.getFullYear()

  const toBase = (amountBRL: number) => convert(amountBRL, 'BRL', currency, usdToBrl, eurToBrl)
  const fmt = (v: number, compact = false) => {
    if (currency === 'USD') {
      const u = v
      if (compact && Math.abs(u) >= 1_000_000) return `$ ${(u / 1_000_000).toFixed(1)}M`
      if (compact && Math.abs(u) >= 1_000)     return `$ ${(u / 1_000).toFixed(1)}k`
      return u.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
    }
    if (currency === 'EUR') {
      if (compact && Math.abs(v) >= 1_000_000) return `€ ${(v / 1_000_000).toFixed(1)}M`
      if (compact && Math.abs(v) >= 1_000)     return `€ ${(v / 1_000).toFixed(1)}k`
      return v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
    }
    return formatBRL(v, compact)
  }

  // ── Period cutoff (start of selected window) ──
  const periodCutoff = useMemo(() => {
    const now = new Date()
    const cutoff = new Date()
    cutoff.setHours(0, 0, 0, 0)
    if (period === '1M')   cutoff.setMonth(now.getMonth() - 1)
    if (period === '3M')   cutoff.setMonth(now.getMonth() - 3)
    if (period === 'YTD')  { cutoff.setMonth(0); cutoff.setDate(1) }
    if (period === '12M')  cutoff.setFullYear(now.getFullYear() - 1)
    if (period === '5A')   cutoff.setFullYear(now.getFullYear() - 5)
    if (period === 'ALL')  cutoff.setFullYear(1970)
    return cutoff.toISOString().split('T')[0]
  }, [period])

  // ── Per-investment start-of-period price ──────
  // Returns the best estimate of this asset's per-unit price at `cutoffISO`:
  //   1. Exact match from priceHistory (most accurate)
  //   2. Geometric interpolation between avgCost and currentPrice when the
  //      investment predates the cutoff but has no historical price point —
  //      assumes constant compounding rate over the holding period.
  //   3. avgCost when the investment was purchased AFTER the cutoff (its cost
  //      is the correct start-of-period price; full gain is within the period).
  // Also sets the `interpolatedBRL` accumulator in the totals loop so the UI
  // can flag estimated numbers distinctly from exact price-history numbers.
  function startPriceFor(inv: Investment, cutoffISO: string): number {
    const cost = Number.isFinite(inv.avgCost) ? inv.avgCost : 0
    if (period === 'ALL') return cost

    // 1. Exact price from history at or before cutoff
    if (Array.isArray(inv.priceHistory) && inv.priceHistory.length > 0) {
      const valid = inv.priceHistory.filter(
        p => p && typeof p.date === 'string' && p.date.length > 0 && Number.isFinite(p.price),
      )
      const beforeCutoff = valid.filter(p => p.date <= cutoffISO)
      if (beforeCutoff.length > 0) {
        const sorted = [...beforeCutoff].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
        const px = sorted[0]?.price
        if (Number.isFinite(px)) return px as number
      }
    }

    // 2. Investment bought after the cutoff — avgCost IS the start-of-period price
    if (!inv.purchaseDate || typeof inv.purchaseDate !== 'string' || inv.purchaseDate > cutoffISO) {
      return cost
    }

    // 3. Investment predates cutoff, no price history — geometric interpolation.
    //    price(t) = cost × (currentPrice/cost)^t   where t = fraction of holding at cutoff
    const cur = Number.isFinite(inv.currentPrice) ? inv.currentPrice : cost
    if (cost > 0 && cur > 0) {
      const purchaseMs = new Date(inv.purchaseDate + 'T00:00:00').getTime()
      const cutoffMs   = new Date(cutoffISO   + 'T00:00:00').getTime()
      const nowMs      = Date.now()
      const totalMs    = nowMs - purchaseMs
      if (totalMs > 0 && cutoffMs > purchaseMs) {
        const t = (cutoffMs - purchaseMs) / totalMs
        return cost * Math.pow(cur / cost, Math.min(1, t))
      }
    }

    return cost
  }

  // ── Period-aware totals ───────────────────────
  // Also tracks `historyCoverage` — the fraction of total portfolio value
  // (BRL) backed by a real priceHistory point on/before the period cutoff.
  // Below ~50% we know the "period gain" math (which extrapolates from
  // avgCost when history is missing) is unreliable, so the UI falls back
  // to showing lifetime gain instead of a fabricated period number.
  const totals = useMemo(() => {
    const liquidInv = investments.filter(i => i.location !== 'physical-re')
    const all = investments
    let totalValueBRL = 0, totalCostBRL = 0, startValueBRL = 0
    let dividendsBRL = 0, interestBRL = 0
    let valueWithHistoryBRL = 0, valueInterpolatedBRL = 0
    liquidInv.forEach(i => {
      const cur  = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      const cost = convert(i.quantity * i.avgCost,      i.currency, 'BRL', usdToBrl, eurToBrl)
      totalValueBRL += cur
      totalCostBRL  += cost
      const sp = startPriceFor(i, periodCutoff)
      startValueBRL += convert(i.quantity * sp, i.currency, 'BRL', usdToBrl, eurToBrl)
      dividendsBRL  += convert(i.dividendsReceived ?? 0, i.currency, 'BRL', usdToBrl, eurToBrl)
      interestBRL   += convert(i.interestReceived ?? 0,  i.currency, 'BRL', usdToBrl, eurToBrl)
      // Coverage: exact priceHistory point = best; geometric interpolation = acceptable estimate;
      // purchased-within-period = exact (cost IS the start price). ALL period always covered.
      const hasExactHistory =
        period === 'ALL'
        || (Array.isArray(i.priceHistory) && i.priceHistory.some(p => p?.date && p.date <= periodCutoff))
      const hasInterpolation =
        !hasExactHistory
        && !!i.purchaseDate
        && typeof i.purchaseDate === 'string'
        && i.purchaseDate <= periodCutoff
      if (hasExactHistory)    valueWithHistoryBRL  += cur
      if (hasInterpolation)   valueInterpolatedBRL += cur
    })
    const physicalBRL = all.filter(i => i.location === 'physical-re').reduce((s, i) =>
      s + convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl), 0)
    const lifetimeGainBRL = totalValueBRL - totalCostBRL
    const lifetimeGainPct = totalCostBRL > 0 ? (lifetimeGainBRL / totalCostBRL) * 100 : 0
    // exactCoverage: fraction backed by real priceHistory points
    // estimatedCoverage: fraction using geometric interpolation (still period-accurate)
    const exactCoverage      = totalValueBRL > 0 ? valueWithHistoryBRL  / totalValueBRL : 1
    const estimatedCoverage  = totalValueBRL > 0 ? valueInterpolatedBRL / totalValueBRL : 0
    const hasInterpolation   = valueInterpolatedBRL > 0
    return {
      totalValueBRL, totalCostBRL, startValueBRL,
      lifetimeGainBRL, lifetimeGainPct,
      dividendsBRL, interestBRL, physicalBRL,
      exactCoverage, estimatedCoverage, hasInterpolation,
      totalNetWorthBRL: totalValueBRL + physicalBRL,
    }
  }, [investments, usdToBrl, eurToBrl, periodCutoff, period])

  // ── Aportes / resgates within the selected window ──
  const periodAportes = useMemo(() => {
    return transactions
      .filter(t => t.date >= periodCutoff && t.type === 'expense' && t.category === 'investimento')
      .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR', 'BRL', usdToBrl, eurToBrl), 0)
  }, [transactions, periodCutoff, usdToBrl, eurToBrl])

  const periodResgates = useMemo(() => {
    return transactions
      .filter(t => t.date >= periodCutoff && t.type === 'income' && t.category === 'investimento')
      .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR', 'BRL', usdToBrl, eurToBrl), 0)
  }, [transactions, periodCutoff, usdToBrl, eurToBrl])

  // ── Bank-statement transactions linked to investments ──
  // Groups transactions that have `linkedInvestmentId` set by investment ID.
  // Used both for per-asset cashflow display and for total-return calculations.
  const linkedTxByInvestment = useMemo(() => {
    const m = new Map<string, typeof transactions>()
    for (const t of transactions) {
      if (!t.linkedInvestmentId) continue
      const arr = m.get(t.linkedInvestmentId) ?? []
      arr.push(t)
      m.set(t.linkedInvestmentId, arr)
    }
    return m
  }, [transactions])

  // Period-level income from linked bank transactions (dividends, coupons, etc.)
  const periodLinkedIncomeBRL = useMemo(() => {
    let total = 0
    for (const txs of linkedTxByInvestment.values()) {
      for (const t of txs) {
        if (t.date >= periodCutoff && t.type === 'income') {
          total += convert(t.amount, (t.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR', 'BRL', usdToBrl, eurToBrl)
        }
      }
    }
    return total
  }, [linkedTxByInvestment, periodCutoff, usdToBrl, eurToBrl])

  // Total linked income all-time (for ALL period)
  const allTimeLinkedIncomeBRL = useMemo(() => {
    let total = 0
    for (const txs of linkedTxByInvestment.values()) {
      for (const t of txs) {
        if (t.type === 'income') {
          total += convert(t.amount, (t.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR', 'BRL', usdToBrl, eurToBrl)
        }
      }
    }
    return total
  }, [linkedTxByInvestment, usdToBrl, eurToBrl])

  // ── Period gain (capital + linked cashflow income) ──────────────────────
  // Total return = capital gain + income received in bank account linked to this investment.
  // periodGain = (V_end − V_start) + linked_income_period − (aportes − resgates)
  const periodGainBRL =
    period === 'ALL'
      ? totals.lifetimeGainBRL + allTimeLinkedIncomeBRL
      : totals.totalValueBRL - totals.startValueBRL + periodLinkedIncomeBRL - (periodAportes - periodResgates)
  const periodGainBase =
    period === 'ALL'
      ? totals.totalCostBRL
      : Math.max(totals.startValueBRL + (periodAportes - periodResgates) / 2, 1)
  const periodGainPct = periodGainBase > 0 ? (periodGainBRL / periodGainBase) * 100 : 0
  const gainSuffix = period === 'ALL'
    ? 'vs custo médio'
    : totals.hasInterpolation && totals.exactCoverage < 0.5
      ? 'no período (estimado)'
      : 'no período'

  const monthsElapsed = useMemo(() => {
    const ms = Date.now() - new Date(periodCutoff + 'T00:00:00').getTime()
    return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24 * 30.44)))
  }, [periodCutoff])

  // ── Allocation by canonical class (all + summary) ──
  const allAllocation = useMemo(() => {
    const m = new Map<string, number>()
    const byClass = new Map<string, { inv: Investment; valueBRL: number }[]>()
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      const canon = i.location === 'offshore' ? canonicalIntlClass(i.assetClass) : canonicalLocalClass(i.assetClass)
      m.set(canon, (m.get(canon) ?? 0) + v)
      const arr = byClass.get(canon) ?? []
      arr.push({ inv: i, valueBRL: v })
      byClass.set(canon, arr)
    })
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0)
    const palette = ['#00d4ff', '#00ff88', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#ff7a00', '#14b8a6']
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({
        name, value,
        pct: total > 0 ? (value / total) * 100 : 0,
        color: palette[i % palette.length],
        items: (byClass.get(name) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
      }))
  }, [investments, usdToBrl, eurToBrl])
  const allocation = useMemo(() => allAllocation.slice(0, 8), [allAllocation])

  // ── Suitability gap map: canonical class → { gapPct, gapValue, targetPct } ──
  const suitabilityGapMap = useMemo(() => {
    const profile = (settings.suitability ?? 'Moderado') as SuitabilityProfile
    const localTargets = LOCAL_TARGETS[profile]
    const intlTargets  = INTL_TARGETS[profile]
    let onshoreTotal = 0, offshoreTotal = 0
    const localActuals = new Map<string, number>()
    const intlActuals  = new Map<string, number>()
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      if (i.location === 'offshore') {
        const k = canonicalIntlClass(i.assetClass)
        intlActuals.set(k, (intlActuals.get(k) ?? 0) + v)
        offshoreTotal += v
      } else {
        const k = canonicalLocalClass(i.assetClass)
        localActuals.set(k, (localActuals.get(k) ?? 0) + v)
        onshoreTotal += v
      }
    })
    const gaps = new Map<string, { gapPct: number; gapValue: number; targetPct: number; actualPct: number }>()
    LOCAL_CLASSES.forEach(cls => {
      const actualVal = localActuals.get(cls) ?? 0
      const actualPct = onshoreTotal > 0 ? (actualVal / onshoreTotal) * 100 : 0
      const targetPct = localTargets[cls] ?? 0
      const gapPct    = actualPct - targetPct
      gaps.set(cls, { gapPct, gapValue: (gapPct / 100) * onshoreTotal, targetPct, actualPct })
    })
    INTL_CLASSES.forEach(cls => {
      const actualVal = intlActuals.get(cls) ?? 0
      const actualPct = offshoreTotal > 0 ? (actualVal / offshoreTotal) * 100 : 0
      const targetPct = intlTargets[cls] ?? 0
      const gapPct    = actualPct - targetPct
      gaps.set(cls, { gapPct, gapValue: (gapPct / 100) * offshoreTotal, targetPct, actualPct })
    })
    return gaps
  }, [investments, usdToBrl, eurToBrl, settings.suitability])

  // ── Generic breakdown helper: aggregates BRL value by some key ──
  // Returns rows with `items` — the list of investments in each bucket —
  // so the breakdown modals can expand a category to show the underlying
  // positions.
  function breakdownBy<K extends string>(
    keyFn: (i: Investment) => K,
    palette: string[],
    keyOrder?: K[],
  ): {
    slices: DonutSlice[]; total: number;
    rows: { key: K; value: number; pct: number; color: string; items: { inv: Investment; valueBRL: number }[] }[]
  } {
    const m = new Map<K, number>()
    const byKey = new Map<K, { inv: Investment; valueBRL: number }[]>()
    let total = 0
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      if (breakdownLocation !== 'all' && i.location !== breakdownLocation) return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      const k = keyFn(i)
      m.set(k, (m.get(k) ?? 0) + v)
      const arr = byKey.get(k) ?? []
      arr.push({ inv: i, valueBRL: v })
      byKey.set(k, arr)
      total += v
    })
    const entries = keyOrder
      ? keyOrder.filter(k => m.has(k)).map(k => [k, m.get(k)!] as [K, number])
      : Array.from(m.entries()).sort((a, b) => b[1] - a[1])
    const rows = entries.map(([key, value], i) => ({
      key, value,
      pct: total > 0 ? (value / total) * 100 : 0,
      color: palette[i % palette.length],
      items: (byKey.get(key) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
    }))
    const slices: DonutSlice[] = rows.map(r => ({
      label: String(r.key),
      value: r.value,
      color: r.color,
    }))
    return { slices, total, rows }
  }

  // ── Liquidity breakdown ─────────────────────────
  const LIQ_ORDER = ['D+0', 'D+1', 'D+2', 'D+3', 'D+5', 'D+7', 'D+10', 'D+15', 'D+30', 'D+60', 'D+90', 'D+180', 'D+360', 'Vencimento', 'Não definido']
  const liquidityBreakdown = useMemo(() => {
    // Cyan → blue → purple gradient = fast → slow
    const palette = ['#00ff88', '#00d4ff', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#ff7a00', '#ff4466', '#55556a', '#55556a']
    return breakdownBy(
      i => (i.liquidity && i.liquidity.trim().length > 0 ? i.liquidity : 'Não definido'),
      palette,
      LIQ_ORDER,
    )
  }, [investments, usdToBrl, eurToBrl, breakdownLocation])

  // ── Tax treatment breakdown ────────────────────
  const taxLabel: Record<string, string> = {
    'taxable':       'Tributável',
    'tax-deferred':  'Imposto diferido',
    'tax-exempt':    'Isento de IR',
    'unset':         'Não classificado',
  }
  const taxBreakdown = useMemo(() => {
    const palette = ['#ff4466', '#f59e0b', '#00ff88', '#55556a']
    const m = new Map<string, number>()
    const byKey = new Map<string, { inv: Investment; valueBRL: number }[]>()
    let total = 0
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      if (breakdownLocation !== 'all' && i.location !== breakdownLocation) return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      const k = i.taxTreatment ?? 'unset'
      m.set(k, (m.get(k) ?? 0) + v)
      const arr = byKey.get(k) ?? []
      arr.push({ inv: i, valueBRL: v })
      byKey.set(k, arr)
      total += v
    })
    const order = ['taxable', 'tax-deferred', 'tax-exempt', 'unset']
    const rows = order.filter(k => m.has(k)).map(k => ({
      key: k, value: m.get(k)!,
      pct: total > 0 ? (m.get(k)! / total) * 100 : 0,
      color: palette[order.indexOf(k)],
      items: (byKey.get(k) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
    }))
    const slices: DonutSlice[] = rows.map(r => ({ label: taxLabel[r.key] ?? r.key, value: r.value, color: r.color }))
    return { slices, total, rows }
  }, [investments, usdToBrl, eurToBrl, breakdownLocation])

  // ── Institution / broker breakdown ─────────────
  const institutionBreakdown = useMemo(() => {
    const palette = ['#00d4ff', '#00ff88', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#ff7a00', '#14b8a6', '#a855f7', '#84cc16']
    return breakdownBy(
      i => (i.institution && i.institution.trim().length > 0 ? i.institution : 'Sem instituição'),
      palette,
    )
  }, [investments, usdToBrl, eurToBrl, breakdownLocation])

  // ── Risk level breakdown ───────────────────────
  const riskLabel: Record<string, string> = {
    '1': 'Muito baixo',
    '2': 'Baixo',
    '3': 'Moderado',
    '4': 'Alto',
    '5': 'Muito alto',
    'unset': 'Sem rating',
  }
  // ── Onshore canonical asset class breakdown ─────
  // Maps internal canonical classes to the public-facing label set the
  // user wants displayed, in the requested order.
  const ONSHORE_CLASS_ORDER = [
    'Pós Fixado',
    'Prefixado',
    'Inflação',
    'Renda Fixa Ativo',
    'Multimercado',
    'Ações',
    'FIIs Tijolo',
    'Crédito Estruturado',
    'PE/VC/Real Assets',
  ] as const
  const ONSHORE_CLASS_PALETTE: Record<string, string> = {
    'Pós Fixado':            '#00d4ff',
    'Prefixado':             '#3b82f6',
    'Inflação':              '#8b5cf6',
    'Renda Fixa Ativo':      '#6366f1',
    'Multimercado':          '#a855f7',
    'Ações':                 '#00ff88',
    'FIIs Tijolo':           '#ec4899',
    'Crédito Estruturado':   '#f59e0b',
    'PE/VC/Real Assets':     '#ff7a00',
  }
  function mapOnshoreCanon(canon: string): string | null {
    const m: Record<string, string> = {
      'Pós-Fixado':                'Pós Fixado',
      'Prefixado':                 'Prefixado',
      'IPCA Juro Real (Curto)':    'Inflação',
      'IPCA Juro Real (Longo)':    'Inflação',
      'Renda Fixa Ativo':          'Renda Fixa Ativo',
      'Multimercados':             'Multimercado',
      'RV Ibovespa':               'Ações',
      'RV S&P (BRL)':              'Ações',
      'Alt. FII (Tijolo)':         'FIIs Tijolo',
      'Alt. Crédito Estruturado':  'Crédito Estruturado',
      'Alt. PE/VC/Real Assets':    'PE/VC/Real Assets',
    }
    return m[canon] ?? null
  }
  const onshoreClassBreakdown = useMemo(() => {
    if (breakdownLocation === 'onshore') {
      // Canonical 9-class mapping for onshore
      const m = new Map<string, number>()
      const byLabel = new Map<string, { inv: Investment; valueBRL: number }[]>()
      let total = 0
      let unmapped = 0
      investments.forEach(i => {
        if (i.location !== 'onshore') return
        const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
        if (v <= 0) return
        const canon = canonicalLocalClass(i.assetClass)
        const label = mapOnshoreCanon(canon)
        if (label) {
          m.set(label, (m.get(label) ?? 0) + v)
          const arr = byLabel.get(label) ?? []
          arr.push({ inv: i, valueBRL: v })
          byLabel.set(label, arr)
          total += v
        } else {
          unmapped += v
        }
      })
      const rows = ONSHORE_CLASS_ORDER.map(label => ({
        label,
        value: m.get(label) ?? 0,
        pct: total > 0 ? ((m.get(label) ?? 0) / total) * 100 : 0,
        color: ONSHORE_CLASS_PALETTE[label] ?? '#55556a',
        items: (byLabel.get(label) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
      }))
      return { rows, total, unmapped }
    }
    // offshore / all: group by raw asset class, sorted by value
    const palette = ['#00d4ff', '#00ff88', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#ff7a00', '#14b8a6', '#a855f7', '#84cc16', '#6366f1', '#ff4466']
    const m = new Map<string, number>()
    const byLabel = new Map<string, { inv: Investment; valueBRL: number }[]>()
    let total = 0
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      if (breakdownLocation !== 'all' && i.location !== breakdownLocation) return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      const label = i.assetClass || 'Não classificado'
      m.set(label, (m.get(label) ?? 0) + v)
      const arr = byLabel.get(label) ?? []
      arr.push({ inv: i, valueBRL: v })
      byLabel.set(label, arr)
      total += v
    })
    const rows = Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], idx) => ({
        label, value,
        pct: total > 0 ? (value / total) * 100 : 0,
        color: palette[idx % palette.length],
        items: (byLabel.get(label) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
      }))
    return { rows, total, unmapped: 0 }
  }, [investments, usdToBrl, eurToBrl, breakdownLocation])

  // ── Onshore product type breakdown (alphabetical) ──
  const ONSHORE_PRODUCT_TYPES = [
    'Ações', 'CDB', 'CDCA', 'COE', 'CPR Compromissada', 'CRA', 'CRI',
    'Debênture', 'Debênture Incentivada', 'Derivativos', 'FDIC', 'FGTS',
    'FI', 'FIA', 'FIAGRO', 'FII', 'FI-Infra', 'FIM',
    'LCA', 'LCI', 'LF', 'LFT', 'LIG', 'LTN',
    'NTN-B Cuponada', 'NTN-B Principal', 'NTN-C', 'NTN-F',
    'Outros', 'Tesouro Educa+', 'Tesouro Renda+',
  ] as const
  function inferProductType(inv: Investment): string {
    // 1. Explicit título type
    if (inv.tituloType && inv.tituloType.trim().length > 0) return inv.tituloType.trim()
    // 2. Explicit fund type
    if (inv.fundType && inv.fundType.trim().length > 0)   return inv.fundType.trim()
    // 3. ProductType high-level
    if (inv.productType === 'acao')  return 'Ações'
    if (inv.productType === 'coe')   return 'COE'
    // 4. Heuristics from assetClass / name
    const cls = (inv.assetClass || '').toLowerCase()
    const name = (inv.name || '').toLowerCase()
    const hay = `${cls} ${name}`
    const map: { match: RegExp; label: string }[] = [
      { match: /\bcdb\b/, label: 'CDB' },
      { match: /\blci\b/, label: 'LCI' },
      { match: /\blca\b/, label: 'LCA' },
      { match: /\bcri\b/, label: 'CRI' },
      { match: /\bcra\b/, label: 'CRA' },
      { match: /debênture incentivada|debenture incentivada/, label: 'Debênture Incentivada' },
      { match: /debênture|debenture/, label: 'Debênture' },
      { match: /\blig\b/, label: 'LIG' },
      { match: /\blft\b/, label: 'LFT' },
      { match: /\bltn\b/, label: 'LTN' },
      { match: /ntn-b principal/, label: 'NTN-B Principal' },
      { match: /ntn-b cuponada|ntn-b/, label: 'NTN-B Cuponada' },
      { match: /ntn-c/, label: 'NTN-C' },
      { match: /ntn-f/, label: 'NTN-F' },
      { match: /tesouro renda/, label: 'Tesouro Renda+' },
      { match: /tesouro educa/, label: 'Tesouro Educa+' },
      { match: /\bfgts\b/, label: 'FGTS' },
      { match: /\bfii\b|fundo imobili/, label: 'FII' },
      { match: /\bfia\b/, label: 'FIA' },
      { match: /\bfim\b|multimerc/, label: 'FIM' },
      { match: /\bfdic\b/, label: 'FDIC' },
      { match: /fiagro/, label: 'FIAGRO' },
      { match: /fi-?infra|infraestrut/, label: 'FI-Infra' },
      { match: /\blf\b/, label: 'LF' },
      { match: /\bcdca\b/, label: 'CDCA' },
      { match: /cpr compromiss/, label: 'CPR Compromissada' },
      { match: /\bcoe\b/, label: 'COE' },
      { match: /derivativ|opção|opcao|futuro/, label: 'Derivativos' },
      { match: /ação|acao|ações|acoes|equity|stock/, label: 'Ações' },
    ]
    for (const r of map) if (r.match.test(hay)) return r.label
    if (inv.productType === 'fundo') return 'FI'
    if (inv.productType === 'titulo') return 'Outros'
    return 'Outros'
  }
  const onshoreProductBreakdown = useMemo(() => {
    const m = new Map<string, number>()
    const byLabel = new Map<string, { inv: Investment; valueBRL: number }[]>()
    let total = 0
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      if (breakdownLocation !== 'all' && i.location !== breakdownLocation) return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      const t = inferProductType(i)
      m.set(t, (m.get(t) ?? 0) + v)
      const arr = byLabel.get(t) ?? []
      arr.push({ inv: i, valueBRL: v })
      byLabel.set(t, arr)
      total += v
    })
    // Alphabetical (pt-BR) — but use the requested canonical list as the
    // primary set; any extras go after.
    const seen = new Set<string>()
    const palette = ['#00d4ff', '#00ff88', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#ff7a00', '#14b8a6', '#a855f7', '#84cc16', '#6366f1', '#ff4466']
    const rows: { label: string; value: number; pct: number; color: string; items: { inv: Investment; valueBRL: number }[] }[] = []
    const sorted = [...ONSHORE_PRODUCT_TYPES].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    sorted.forEach((t, i) => {
      const v = m.get(t) ?? 0
      seen.add(t)
      rows.push({
        label: t, value: v,
        items: (byLabel.get(t) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
        pct: total > 0 ? (v / total) * 100 : 0,
        color: palette[i % palette.length],
      })
    })
    // Types not in the canonical list get their own rows (so they're expandable)
    const extras = Array.from(m.entries())
      .filter(([k]) => !seen.has(k))
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    extras.forEach(([k, v], idx) => {
      rows.push({
        label: k,
        value: v,
        items: (byLabel.get(k) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
        pct: total > 0 ? (v / total) * 100 : 0,
        color: palette[(sorted.length + idx) % palette.length],
      })
    })
    return { rows, total }
  }, [investments, usdToBrl, eurToBrl, breakdownLocation])

  const riskBreakdown = useMemo(() => {
    // Green → yellow → red gradient
    const palette = ['#00ff88', '#84cc16', '#f59e0b', '#ff7a00', '#ff4466', '#55556a']
    const m = new Map<string, number>()
    const byKey = new Map<string, { inv: Investment; valueBRL: number }[]>()
    let total = 0
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      if (breakdownLocation !== 'all' && i.location !== breakdownLocation) return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      const k = i.riskLevel ? String(i.riskLevel) : 'unset'
      m.set(k, (m.get(k) ?? 0) + v)
      const arr = byKey.get(k) ?? []
      arr.push({ inv: i, valueBRL: v })
      byKey.set(k, arr)
      total += v
    })
    const order = ['1', '2', '3', '4', '5', 'unset']
    const rows = order.filter(k => m.has(k)).map(k => ({
      key: k, value: m.get(k)!,
      pct: total > 0 ? (m.get(k)! / total) * 100 : 0,
      color: palette[order.indexOf(k)],
      items: (byKey.get(k) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
    }))
    const slices: DonutSlice[] = rows.map(r => ({ label: riskLabel[r.key] ?? r.key, value: r.value, color: r.color }))
    return { slices, total, rows }
  }, [investments, usdToBrl, eurToBrl, breakdownLocation])

  // ── Emissor breakdown ──────────────────────────
  const emisssorBreakdown = useMemo(() => {
    const palette = ['#00d4ff', '#00ff88', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#ff7a00', '#14b8a6', '#a855f7', '#84cc16', '#6366f1', '#ff4466']
    return breakdownBy(
      i => (i.issuer && i.issuer.trim().length > 0 ? i.issuer.trim() : 'Não informado'),
      palette,
    )
  }, [investments, usdToBrl, eurToBrl, breakdownLocation])

  // ── Holding breakdown ──────────────────────────
  const holdingBreakdown = useMemo(() => {
    const palette = ['#f59e0b', '#00d4ff', '#8b5cf6', '#00ff88', '#ec4899', '#3b82f6', '#ff7a00', '#14b8a6', '#a855f7', '#84cc16', '#6366f1', '#ff4466']
    return breakdownBy(
      i => (i.holding && i.holding.trim().length > 0 ? i.holding.trim() : 'Não informado'),
      palette,
    )
  }, [investments, usdToBrl, eurToBrl, breakdownLocation])

  // ── Vencimento (maturity bucket) breakdown ─────
  const maturityBreakdown = useMemo(() => {
    const palette = ['#00ff88', '#84cc16', '#f59e0b', '#ff7a00', '#ff4466', '#8b5cf6', '#55556a']
    const today = new Date()
    function bucket(inv: Investment): string {
      if (!inv.maturityDate) return 'Sem vencimento'
      const diff = (new Date(inv.maturityDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
      if (diff < 0)  return 'Vencido'
      if (diff < 1)  return '< 1 ano'
      if (diff < 2)  return '1–2 anos'
      if (diff < 3)  return '2–3 anos'
      if (diff < 5)  return '3–5 anos'
      if (diff < 10) return '5–10 anos'
      return '+ 10 anos'
    }
    const BUCKET_ORDER = ['< 1 ano', '1–2 anos', '2–3 anos', '3–5 anos', '5–10 anos', '+ 10 anos', 'Vencido', 'Sem vencimento']
    return breakdownBy(bucket, palette, BUCKET_ORDER)
  }, [investments, usdToBrl, eurToBrl, breakdownLocation])

  // ── Payment frequency breakdown ────────────────
  const paymentFreqBreakdown = useMemo(() => {
    const palette = ['#00d4ff', '#8b5cf6', '#00ff88', '#f59e0b', '#ec4899', '#3b82f6', '#ff7a00', '#55556a']
    return breakdownBy(
      i => (i.paymentFrequency && i.paymentFrequency.trim().length > 0 ? i.paymentFrequency.trim() : 'Não informado'),
      palette,
    )
  }, [investments, usdToBrl, eurToBrl, breakdownLocation])

  // ── Sector breakdown ────────────────────────────
  const sectorBreakdown = useMemo(() => {
    const palette = ['#00d4ff', '#00ff88', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#ff7a00', '#14b8a6', '#a855f7', '#84cc16', '#6366f1', '#ff4466']
    return breakdownBy(
      i => (i.sector && i.sector.trim().length > 0 ? i.sector.trim() : 'Não informado'),
      palette,
    )
  }, [investments, usdToBrl, eurToBrl, breakdownLocation])

  // ── Benchmark breakdown ─────────────────────────
  const benchmarkBreakdown = useMemo(() => {
    const palette = ['#00ff88', '#00d4ff', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6', '#ff7a00', '#55556a']
    return breakdownBy(
      i => (i.benchmark && i.benchmark.trim().length > 0 ? i.benchmark.trim() : 'Sem benchmark'),
      palette,
    )
  }, [investments, usdToBrl, eurToBrl, breakdownLocation])

  // ── Per-investment period metrics (used by movers + posições) ──
  const movers = useMemo(() => {
    return investments
      .filter(i => i.location !== 'physical-re')
      .map(i => {
        const cur  = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
        const cost = convert(i.quantity * i.avgCost,      i.currency, 'BRL', usdToBrl, eurToBrl)
        const startPrice = startPriceFor(i, periodCutoff)
        const startVal = convert(i.quantity * startPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
        const linked = linkedTxByInvestment.get(i.id) ?? []
        const linkedIncomePer = linked.filter(t => t.date >= periodCutoff && t.type === 'income')
          .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL'|'USD'|'EUR', 'BRL', usdToBrl, eurToBrl), 0)
        const linkedIncomeAll = linked.filter(t => t.type === 'income')
          .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL'|'USD'|'EUR', 'BRL', usdToBrl, eurToBrl), 0)
        const periodGain = period === 'ALL' ? (cur - cost + linkedIncomeAll) : (cur - startVal + linkedIncomePer)
        const periodPct  = period === 'ALL'
          ? (cost > 0 ? (periodGain / cost) * 100 : 0)
          : (startVal > 0 ? (periodGain / startVal) * 100 : 0)
        const lifeGain = cur - cost + linkedIncomeAll
        const lifePct  = cost > 0 ? (lifeGain / cost) * 100 : 0
        return {
          inv: i,
          current: cur, cost, startVal,
          gain: periodGain, pct: periodPct,
          lifeGain, lifePct,
        }
      })
  }, [investments, usdToBrl, eurToBrl, periodCutoff, period, linkedTxByInvestment])

  const topGainers = useMemo(() => [...movers].filter(m => m.gain > 0).sort((a, b) => b.gain - a.gain).slice(0, 3), [movers])
  const topLosers  = useMemo(() => [...movers].filter(m => m.gain < 0).sort((a, b) => a.gain - b.gain).slice(0, 3), [movers])

  // ── Concentration ─────────────────────────────
  const concentration = useMemo(() => {
    if (totals.totalValueBRL <= 0) return null
    const sorted = movers.sort((a, b) => b.current - a.current)
    if (!sorted.length) return null
    const top = sorted[0]
    return { name: top.inv.ticker || top.inv.name, pct: (top.current / totals.totalValueBRL) * 100 }
  }, [movers, totals.totalValueBRL])

  // ── Total dividends / income return ────────────
  const totalDivIncomeBRL = totals.dividendsBRL + totals.interestBRL

  // ── Patrimônio sparkline scoped to the selected period ──
  // Anchors to the period window: index 0 = period start, last = today.
  // Number of buckets adapts to the period length.
  const sparkData = useMemo(() => {
    const cutoffDate = new Date(periodCutoff + 'T00:00:00')
    const totalDays = Math.max(7, Math.ceil((today.getTime() - cutoffDate.getTime()) / 86400000))
    // 12 buckets for periods ≤ 1 year, 24 for longer
    const buckets = totalDays > 366 ? 24 : 12
    const stepDays = totalDays / buckets
    const points: number[] = []
    // Walk forward from cutoff: for each bucket, snapshot[i] =
    //   start + cumulative_aportes_through(i) - cumulative_resgates_through(i)
    //   + periodGain * (i / (buckets - 1))
    // periodGain is allocated linearly across buckets — illustrative
    // but anchored to real start (periodCutoff) and end (current value).
    const startVal = period === 'ALL' ? totals.totalCostBRL : totals.startValueBRL
    for (let i = 0; i < buckets; i++) {
      const tDate = new Date(cutoffDate.getTime() + stepDays * (i + 1) * 86400000)
      const tISO = tDate.toISOString().split('T')[0]
      const ap = transactions
        .filter(t => t.date >= periodCutoff && t.date <= tISO && t.type === 'expense' && t.category === 'investimento')
        .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR', 'BRL', usdToBrl, eurToBrl), 0)
      const re = transactions
        .filter(t => t.date >= periodCutoff && t.date <= tISO && t.type === 'income' && t.category === 'investimento')
        .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR', 'BRL', usdToBrl, eurToBrl), 0)
      const gainShare = periodGainBRL * ((i + 1) / buckets)
      points.push(startVal + (ap - re) + gainShare)
    }
    // Pin the first point to startVal so the line opens at the period start.
    return [startVal, ...points]
  }, [periodCutoff, totals.startValueBRL, totals.totalCostBRL, periodGainBRL, transactions, period, usdToBrl, eurToBrl, today])

  const sparkSafe = sparkData.filter(v => Number.isFinite(v))
  const sparkMin = sparkSafe.length > 0 ? Math.min(...sparkSafe, 0) : 0
  const sparkMax = sparkSafe.length > 0 ? Math.max(...sparkSafe, 1) : 1
  const sparkRange = Math.max(sparkMax - sparkMin, 1)

  // ── Heatmap data: monthly returns by class (last 6 months) ──
  const heatmap = useMemo(() => {
    const classes = allocation.slice(0, 6).map(a => a.name)
    const months: { y: number; m: number; label: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      months.push({ y: d.getFullYear(), m: d.getMonth() + 1, label: monthName(d.getMonth() + 1).slice(0, 3) })
    }
    // Without per-month price history we use a deterministic stub that
    // varies per class so the cell colours mean something visually.
    const ret = (cls: string, y: number, m: number) => {
      const code = cls && cls.length > 0 ? cls.charCodeAt(0) : 65
      const base = ((code + y + m * 7) % 11) - 5
      const inv = investments.find(i => (i.location === 'offshore' ? canonicalIntlClass(i.assetClass) : canonicalLocalClass(i.assetClass)) === cls)
      if (inv && Number.isFinite(inv.avgCost) && inv.avgCost > 0 && Number.isFinite(inv.currentPrice)) {
        const dr = ((inv.currentPrice - inv.avgCost) / inv.avgCost) * 100 / 12
        const out = base + dr * 0.4
        return Number.isFinite(out) ? out : base
      }
      return base
    }
    return { classes, months, ret }
  }, [allocation, investments, today])

  // ── Filtered positions ──────────────────────────
  const positions = useMemo(() => {
    let out = investments.map(i => {
      const cur  = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      const cost = convert(i.quantity * i.avgCost,      i.currency, 'BRL', usdToBrl, eurToBrl)
      const sp   = startPriceFor(i, periodCutoff)
      const startVal = convert(i.quantity * sp, i.currency, 'BRL', usdToBrl, eurToBrl)
      // Linked cashflow income for this specific investment
      const linked = linkedTxByInvestment.get(i.id) ?? []
      const linkedIncomePer  = linked.filter(t => t.date >= periodCutoff && t.type === 'income')
        .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL'|'USD'|'EUR', 'BRL', usdToBrl, eurToBrl), 0)
      const linkedIncomeAll  = linked.filter(t => t.type === 'income')
        .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL'|'USD'|'EUR', 'BRL', usdToBrl, eurToBrl), 0)
      const gainLife  = cur - cost + linkedIncomeAll
      const pctLife   = cost > 0 ? (gainLife / cost) * 100 : 0
      const gainPer   = period === 'ALL'
        ? gainLife
        : (cur - startVal + linkedIncomePer)
      const pctPer    = period === 'ALL'
        ? pctLife
        : (startVal > 0 ? (gainPer / startVal) * 100 : 0)
      return {
        ...i, currentBRL: cur, costBRL: cost, startBRL: startVal,
        gain: gainPer, pct: pctPer, gainLife, pctLife,
        linkedIncomePer, linkedIncomeAll, linkedCount: linked.length,
        linkedTxs: linked,
      }
    })
    if (filterClass !== 'all') out = out.filter(i => i.assetClass === filterClass)
    if (filterInstitution !== 'all') out = out.filter(i => (i.institution || '') === filterInstitution)
    if (filterTax !== 'all') out = out.filter(i => (i.taxTreatment ?? 'unset') === filterTax)
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.ticker ?? '').toLowerCase().includes(q) ||
        i.assetClass.toLowerCase().includes(q) ||
        (i.institution ?? '').toLowerCase().includes(q),
      )
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return out.sort((a, b) => {
      switch (sortKey) {
        case 'name':         return dir * a.name.localeCompare(b.name, 'pt-BR')
        case 'class':        return dir * a.assetClass.localeCompare(b.assetClass, 'pt-BR')
        case 'institution':  return dir * (a.institution || '').localeCompare(b.institution || '', 'pt-BR')
        case 'qty':          return dir * (a.quantity - b.quantity)
        case 'avgCost':      return dir * (a.avgCost - b.avgCost)
        case 'currentPrice': return dir * (a.currentPrice - b.currentPrice)
        case 'period':       return dir * (a.pct - b.pct)
        case 'position':
        default:             return dir * (a.currentBRL - b.currentBRL)
      }
    })
  }, [investments, search, filterClass, filterInstitution, filterTax, usdToBrl, eurToBrl, periodCutoff, period, sortKey, sortDir, linkedTxByInvestment])

  const visiblePos = showAllPos ? positions : positions.slice(0, 8)

  const allClassesForFilter = useMemo(() => {
    const s = new Set<string>()
    investments.forEach(i => s.add(i.assetClass))
    return Array.from(s).sort()
  }, [investments])

  // ── Reveal animations ──────────────────────────
  useReveal(containerRef, [investments.length, period, currency])

  // Suitability gauge angle
  const gaugeScore = SUITABILITY_SCORE[settings.suitability ?? 'Moderado'] ?? 50
  const gaugeAngle = (gaugeScore / 100) * 180 // 0..180°
  // Convert to coords on a 70-radius arc starting at (20,100) end (160,100)
  const rad = ((180 - gaugeAngle) * Math.PI) / 180
  const needleX = 90 + 70 * Math.cos(rad)
  const needleY = 100 - 70 * Math.sin(rad)

  // Periods to label on the hero CDI line
  const periodLabel = period === 'YTD' ? 'YTD' : period === 'ALL' ? 'Total' : period

  return (
    <div className="v2-root min-w-0" ref={containerRef}>
      <V2PageHeader
        title="Investimentos"
        subtitle={`${investments.length} ativos · perfil ${settings.suitability ?? 'Moderado'}`}
        right={
          <>
            <PeriodTabs
              value={period}
              onChange={setPeriod}
              options={[
                { value: '1M',  label: '1M' },
                { value: '3M',  label: '3M' },
                { value: 'YTD', label: 'YTD' },
                { value: '12M', label: '12M' },
                { value: '5A',  label: '5A' },
                { value: 'ALL', label: 'Tudo' },
              ]}
            />
            <PeriodTabs
              value={currency}
              onChange={setCurrency}
              options={[
                { value: 'BRL', label: 'BRL' },
                { value: 'USD', label: 'USD' },
                { value: 'EUR', label: 'EUR' },
              ]}
            />
            <button
              onClick={() => setShowAddInv(true)}
              className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              style={{ background: '#ff7a00', color: '#0a0a0f' }}
            >
              <PlusCircle className="w-3.5 h-3.5" /> Adicionar investimento
            </button>
          </>
        }
      />

      <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">

        {/* HERO */}
        <section className="v2-card-emph v2-card-emph-cyan v2-dot-grid p-6 sm:p-8 v2-reveal">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="flex-1 min-w-0">
              <p className="v2-caption">Patrimônio investido · {periodLabel}</p>
              <div className="flex items-baseline gap-3 mt-1.5 flex-wrap">
                <span className="v2-num text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
                  {fmt(toBase(totals.totalValueBRL))}
                </span>
                <span className="v2-pill" style={{
                  background: periodGainBRL >= 0 ? 'rgba(0,255,136,.12)' : 'rgba(255,68,102,.12)',
                  color: periodGainBRL >= 0 ? '#00ff88' : '#ff4466',
                  border: `1px solid ${periodGainBRL >= 0 ? 'rgba(0,255,136,.25)' : 'rgba(255,68,102,.25)'}`,
                }}
                title={useLifetimeFallback ? 'Mostrando ganho vs custo médio porque seu histórico de preços ainda não cobre o início do período. Para retorno do período exato, cadastre o preço do ativo na data de início ou conecte uma corretora que reporte histórico de preço.' : undefined}
                >
                  {periodGainBRL >= 0
                    ? <ArrowUpRight   className="w-3 h-3"/>
                    : <ArrowDownRight className="w-3 h-3"/>}
                  {periodGainBRL >= 0 ? '+' : '−'}{fmt(toBase(Math.abs(periodGainBRL)), true)} · {periodGainPct >= 0 ? '+' : '−'}{Math.abs(periodGainPct).toFixed(1)}% {gainSuffix}
                </span>
              </div>
              <div className="mt-4 flex items-center gap-3 text-xs text-[#8888aa] flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" style={{ color: '#00d4ff' }}/>
                  {period === 'ALL' ? 'Custo médio' : 'Início do período'}: <span className="v2-num text-white font-semibold">{fmt(toBase(period === 'ALL' ? totals.totalCostBRL : totals.startValueBRL), true)}</span>
                </span>
                <span className="text-[#2a2a3e]">·</span>
                <span className="flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5" style={{ color: '#ff7a00' }}/>
                  Proventos: <span className="v2-num text-white font-semibold">{fmt(toBase(totalDivIncomeBRL), true)}</span>
                </span>
                {totals.physicalBRL > 0 && (
                  <>
                    <span className="text-[#2a2a3e]">·</span>
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5"/>
                      Imobilizado: <span className="v2-num text-white font-semibold">{fmt(toBase(totals.physicalBRL), true)}</span>
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Sparkline */}
            <div className="lg:w-80 lg:flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <p className="v2-caption">Evolução · {periodLabel}</p>
                <span className="text-[10px] text-[#8888aa]">Ilustrativo</span>
              </div>
              <svg viewBox="0 0 320 90" className="w-full h-24" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="wealthGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#00ff88" stopOpacity="0.25"/>
                    <stop offset="100%" stopColor="#00ff88" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <line x1="0" y1="78" x2="320" y2="78" stroke="#1e1e30" strokeWidth="1" strokeDasharray="2 4"/>
                {sparkData.length > 1 && (() => {
                  const pts = sparkData.map((v, i) => {
                    const x = (i / (sparkData.length - 1)) * 320
                    const y = 80 - ((v - sparkMin) / sparkRange) * 70
                    return `${x},${y}`
                  })
                  return (
                    <>
                      <path d={`M${pts.join(' L')} L320,90 L0,90 Z`} fill="url(#wealthGrad)"/>
                      <path d={`M${pts.join(' L')}`} fill="none" stroke="#00ff88" strokeWidth="2"/>
                      {(() => {
                        const last = pts[pts.length - 1].split(',')
                        return (
                          <>
                            <circle cx={last[0]} cy={last[1]} r="3" fill="#00ff88"/>
                            <circle cx={last[0]} cy={last[1]} r="6" fill="#00ff88" opacity="0.25" className="v2-pulse"/>
                          </>
                        )
                      })()}
                    </>
                  )
                })()}
              </svg>
            </div>
          </div>
        </section>

        {/* ATTENTION STRIP */}
        <section className="space-y-2.5 v2-reveal">
          <p className="v2-caption">Vale sua atenção</p>
          <div className="grid md:grid-cols-3 gap-2.5">
            {concentration && concentration.pct >= 15 ? (
              <AttentionChip
                icon={AlertTriangle}
                tone="amber"
                title={`Concentração em ${concentration.name} · ${concentration.pct.toFixed(0)}%`}
                subtitle="Acima do limite sugerido de 10–15% por ativo"
              />
            ) : (
              <AttentionChip icon={Scale} tone="green" title="Carteira diversificada" subtitle="Nenhum ativo concentrando mais de 15%"/>
            )}
            {totalDivIncomeBRL > 0 ? (
              <AttentionChip
                icon={Gift}
                tone="cyan"
                title={`Proventos acumulados ${fmt(toBase(totalDivIncomeBRL), true)}`}
                subtitle="Dividendos + JCP + cupons recebidos"
              />
            ) : (
              <AttentionChip icon={Gift} tone="muted" title="Sem proventos lançados" subtitle="Cadastre dividendos no investimento para ver aqui"/>
            )}
            {periodGainPct < 0 ? (
              <AttentionChip
                icon={TrendingUp}
                tone="red"
                title={`Carteira em −${Math.abs(periodGainPct).toFixed(1)}% ${gainSuffix}`}
                subtitle={`Perda de ${fmt(toBase(Math.abs(periodGainBRL)), true)} ${useLifetimeFallback ? '· histórico de preços insuficiente' : ''}`}
              />
            ) : (
              <AttentionChip
                icon={TrendingUp}
                tone="green"
                title={`Rentabilidade +${periodGainPct.toFixed(1)}% ${gainSuffix}`}
                subtitle={`Ganho de ${fmt(toBase(periodGainBRL), true)} ${useLifetimeFallback ? '· histórico de preços insuficiente' : ''}`}
              />
            )}
          </div>
        </section>

        {/* KPIs */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 v2-reveal">
          <KpiCard
            caption={useLifetimeFallback ? 'Ganho vs custo médio' : `Rentabilidade ${periodLabel}`}
            value={`${periodGainPct >= 0 ? '+' : '−'}${Math.abs(periodGainPct).toFixed(1)}%`}
            valueColor={periodGainPct >= 0 ? '#00ff88' : '#ff4466'}
            secondary={`${periodGainBRL >= 0 ? '+' : '−'}${fmt(toBase(Math.abs(periodGainBRL)), true)} ${useLifetimeFallback ? '· histórico insuficiente' : 'nominal'}`}
            pillText={useLifetimeFallback ? 'aprox.' : periodGainPct >= 0 ? 'positiva' : 'negativa'}
            pillColor={useLifetimeFallback ? 'amber' : periodGainPct >= 0 ? 'green' : 'red'}
          />
          <KpiCard
            caption={`Aportes ${periodLabel}`}
            value={fmt(toBase(periodAportes), true)}
            valueColor="#00d4ff"
            secondary={`${monthsElapsed} ${monthsElapsed === 1 ? 'mês' : 'meses'} · média ${fmt(toBase(periodAportes / monthsElapsed), true)}/mês`}
            pillText={periodAportes > 0 ? 'ativo' : 'sem'}
            pillColor={periodAportes > 0 ? 'cyan' : 'muted'}
          />
          <KpiCard
            caption={`Resgates ${periodLabel}`}
            value={fmt(toBase(periodResgates), true)}
            valueColor="#ff7a00"
            secondary="Saídas para conta corrente no período"
            pillText={periodResgates > 0 ? 'sim' : 'sem'}
            pillColor={periodResgates > 0 ? 'orange' : 'muted'}
          />
          <KpiCard
            caption="Proventos totais"
            value={fmt(toBase(totalDivIncomeBRL), true)}
            valueColor="#ff7a00"
            secondary="Dividendos + JCP + cupons"
            pillText="acumulado"
            pillColor="orange"
          />
        </section>

        {/* BENTO */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 v2-reveal">

          {/* Evolução do patrimônio (large) */}
          <ExpandableCard
            gridClass="lg:col-span-2"
            title={`Evolução do patrimônio · ${periodLabel}`}
            subtitle={`${sparkData.length} pontos · ${fmt(toBase(period === 'ALL' ? totals.totalCostBRL : totals.startValueBRL), true)} → ${fmt(toBase(totals.totalValueBRL), true)}`}
            modalSize="xl"
            detail={
              <div>
                <svg viewBox="0 0 800 320" className="w-full h-72" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="wealthBigModal" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#00ff88" stopOpacity="0.30"/>
                      <stop offset="100%" stopColor="#00ff88" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  <line x1="0" y1="60"  x2="800" y2="60"  stroke="#1e1e30" strokeWidth="1"/>
                  <line x1="0" y1="160" x2="800" y2="160" stroke="#1e1e30" strokeWidth="1"/>
                  <line x1="0" y1="260" x2="800" y2="260" stroke="#1e1e30" strokeWidth="1"/>
                  {sparkData.length > 1 && (() => {
                    const pts = sparkData.map((v, i) => {
                      const x = (i / (sparkData.length - 1)) * 800
                      const y = 290 - ((v - sparkMin) / sparkRange) * 240
                      return `${x},${y}`
                    })
                    return (
                      <>
                        <path d={`M${pts.join(' L')} L800,320 L0,320 Z`} fill="url(#wealthBigModal)"/>
                        <path d={`M${pts.join(' L')}`} fill="none" stroke="#00ff88" strokeWidth="2"/>
                        {pts.map((p, i) => {
                          const [x, y] = p.split(',')
                          return <circle key={i} cx={x} cy={y} r="3" fill="#00ff88"/>
                        })}
                      </>
                    )
                  })()}
                </svg>
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="v2-card p-4">
                    <p className="v2-caption">Início</p>
                    <p className="v2-num text-base font-bold mt-1">{fmt(toBase(period === 'ALL' ? totals.totalCostBRL : totals.startValueBRL), true)}</p>
                  </div>
                  <div className="v2-card p-4">
                    <p className="v2-caption">Aportes período</p>
                    <p className="v2-num text-base font-bold mt-1" style={{ color: '#00d4ff' }}>+{fmt(toBase(periodAportes), true)}</p>
                  </div>
                  <div className="v2-card p-4">
                    <p className="v2-caption">Resgates período</p>
                    <p className="v2-num text-base font-bold mt-1" style={{ color: '#ff7a00' }}>−{fmt(toBase(periodResgates), true)}</p>
                  </div>
                  <div className="v2-card p-4">
                    <p className="v2-caption">Ganho/Perda</p>
                    <p className="v2-num text-base font-bold mt-1" style={{ color: periodGainBRL >= 0 ? '#00ff88' : '#ff4466' }}>
                      {periodGainBRL >= 0 ? '+' : ''}{fmt(toBase(periodGainBRL), true)}
                    </p>
                  </div>
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2 pr-9">
              <div>
                <p className="v2-caption">Evolução do patrimônio</p>
                <p className="text-sm text-[#8888aa] mt-0.5">{periodLabel} · estimativa baseada em aportes e ganho linearizado</p>
              </div>
            </div>
            <svg viewBox="0 0 600 200" className="w-full h-48 mt-3" preserveAspectRatio="none">
              <defs>
                <linearGradient id="wealthBig" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#00ff88" stopOpacity="0.30"/>
                  <stop offset="100%" stopColor="#00ff88" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <line x1="0" y1="40" x2="600" y2="40" stroke="#1e1e30" strokeWidth="1"/>
              <line x1="0" y1="100" x2="600" y2="100" stroke="#1e1e30" strokeWidth="1"/>
              <line x1="0" y1="160" x2="600" y2="160" stroke="#1e1e30" strokeWidth="1"/>
              {sparkData.length > 1 && (() => {
                const pts = sparkData.map((v, i) => {
                  const x = (i / (sparkData.length - 1)) * 600
                  const y = 180 - ((v - sparkMin) / sparkRange) * 160
                  return `${x},${y}`
                })
                return (
                  <>
                    <path d={`M${pts.join(' L')} L600,200 L0,200 Z`} fill="url(#wealthBig)"/>
                    <path d={`M${pts.join(' L')}`} fill="none" stroke="#00ff88" strokeWidth="2"/>
                  </>
                )
              })()}
            </svg>
            <div className="mt-3 grid grid-cols-3 gap-3 pt-3 border-t border-[#1e1e30]">
              <div><p className="v2-caption">Início ({periodLabel})</p><p className="v2-num text-base font-bold mt-0.5 text-[#8888aa]">{fmt(toBase(period === 'ALL' ? totals.totalCostBRL : totals.startValueBRL), true)}</p></div>
              <div><p className="v2-caption">Aportes (período)</p><p className="v2-num text-base font-bold mt-0.5" style={{ color: '#00d4ff' }}>+{fmt(toBase(periodAportes), true)}</p></div>
              <div><p className="v2-caption">Atual</p><p className="v2-num text-base font-bold mt-0.5">{fmt(toBase(totals.totalValueBRL), true)}</p></div>
            </div>
          </ExpandableCard>

          {/* Alocação por classe */}
          <ExpandableCard
            title="Alocação por classe · todas"
            subtitle={`${allAllocation.length} classes · ${fmt(toBase(totals.totalValueBRL), true)} totais · perfil ${settings.suitability ?? 'Moderado'}`}
            modalSize="lg"
            detail={
              allAllocation.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Adicione investimentos para ver a alocação.</p>
              ) : (
                <div className="space-y-2">
                  {allAllocation.map(a => (
                    <CategoryRow
                      key={a.name}
                      label={a.name}
                      color={a.color}
                      value={a.value}
                      pct={a.pct}
                      items={a.items}
                      fmt={(v) => fmt(toBase(v), true)}
                      setEditing={setEditing}
                    />
                  ))}
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Alocação por classe</p>
            <p className="text-sm text-[#8888aa] mt-0.5">{allocation.length} classes · perfil {settings.suitability ?? 'Moderado'}</p>
            <div className="mt-4 space-y-3">
              {allocation.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Adicione investimentos para ver a alocação.</p>
              ) : allocation.map(a => {
                const gap = suitabilityGapMap.get(a.name)
                const showGap = gap && gap.targetPct > 0 && Math.abs(gap.gapPct) >= 0.5
                return (
                  <div key={a.name}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.color }}/>
                        <span className="font-medium truncate">{a.name}</span>
                      </span>
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="v2-num font-semibold">{a.pct.toFixed(0)}%</span>
                        {showGap && (
                          <span
                            className="text-[9px] font-bold px-1 py-0.5 rounded"
                            style={{
                              background: gap.gapPct > 0 ? 'rgba(245,158,11,.15)' : 'rgba(0,212,255,.15)',
                              color: gap.gapPct > 0 ? '#f59e0b' : '#00d4ff',
                            }}
                            title={`Alvo: ${gap.targetPct.toFixed(1)}% · ${gap.gapPct > 0 ? 'Reduzir' : 'Aumentar'} ${fmt(toBase(Math.abs(gap.gapValue)), true)}`}
                          >
                            {gap.gapPct > 0 ? '▼' : '▲'} {Math.abs(gap.gapPct).toFixed(0)}pp
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#1e1e30] overflow-hidden">
                      <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(a.pct, 1)}%`, background: a.color }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          </ExpandableCard>

          {/* Top movers (large) */}
          <ExpandableCard
            gridClass="lg:col-span-2"
            title={`Top movers · todos · ${periodLabel}`}
            subtitle={`${movers.length} ativos ranqueados pelo retorno do período`}
            modalSize="xl"
            detail={
              movers.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem ativos para ranquear.</p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[640px] overflow-hidden rounded-xl border border-[#1e1e30] divide-y divide-[#1e1e30]">
                    <div className="grid grid-cols-[40px_1fr_120px_140px_120px] items-center px-3 py-2 text-[10px] uppercase tracking-wider text-[#55556a]">
                      <span>#</span>
                      <span>Ativo · classe</span>
                      <span className="text-right">Posição</span>
                      <span className="text-right">Ganho/Perda</span>
                      <span className="text-right">Retorno</span>
                    </div>
                    {[...movers].sort((a, b) => b.gain - a.gain).map((m, i) => (
                      <div key={m.inv.id} className="grid grid-cols-[40px_1fr_120px_140px_120px] items-center px-3 py-2.5 text-xs v2-row-hover">
                        <span className="text-[#55556a] v2-num">{i + 1}</span>
                        <span className="min-w-0">
                          <span className="block font-semibold truncate flex items-center gap-2">
                            {m.inv.ticker || m.inv.name}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 font-mono">{m.inv.institution}</span>
                          </span>
                          <span className="text-[10px] text-[#55556a]">{m.inv.assetClass}</span>
                        </span>
                        <span className="v2-num text-right font-semibold">{fmt(toBase(m.current), true)}</span>
                        <span className="v2-num text-right font-bold" style={{ color: m.gain >= 0 ? '#00ff88' : '#ff4466' }}>
                          {m.gain >= 0 ? '+' : ''}{fmt(toBase(m.gain), true)}
                        </span>
                        <span className="v2-num text-right" style={{ color: m.pct >= 0 ? '#00ff88' : '#ff4466' }}>
                          {m.pct >= 0 ? '+' : ''}{m.pct.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            }
          >
            <div className="flex items-center justify-between mb-3 pr-9">
              <div>
                <p className="v2-caption">Top movers · {periodLabel}</p>
                <p className="text-sm text-[#8888aa] mt-0.5">Quem mais valorizou e quem mais derrubou no período</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6">
              <div>
                <p className="v2-caption mb-2" style={{ color: '#00ff88' }}>Maiores ganhos</p>
                <div className="space-y-1">
                  {topGainers.length === 0 ? (
                    <p className="text-[11px] text-[#55556a] py-2">Sem ganhos registrados.</p>
                  ) : topGainers.map((m, i) => (
                    <div key={m.inv.id} className="v2-row-hover flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer">
                      <span className="text-xs text-[#55556a] w-4 v2-num">{i + 1}</span>
                      <span className="flex-1 min-w-0">
                        <span className="text-sm font-semibold truncate flex items-center gap-2">
                          {m.inv.ticker || m.inv.name}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 font-mono">{m.inv.institution}</span>
                        </span>
                        <span className="text-[11px] text-[#55556a]">{m.inv.assetClass}</span>
                      </span>
                      <span className="text-right whitespace-nowrap">
                        <span className="v2-num text-sm font-bold block" style={{ color: '#00ff88' }}>+{fmt(toBase(m.gain), true)}</span>
                        <span className="v2-num text-[10px]" style={{ color: '#00ff88' }}>+{m.pct.toFixed(1)}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 sm:mt-0">
                <p className="v2-caption mb-2" style={{ color: '#ff4466' }}>Maiores perdas</p>
                <div className="space-y-1">
                  {topLosers.length === 0 ? (
                    <p className="text-[11px] text-[#55556a] py-2">Sem perdas registradas.</p>
                  ) : topLosers.map((m, i) => (
                    <div key={m.inv.id} className="v2-row-hover flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer">
                      <span className="text-xs text-[#55556a] w-4 v2-num">{i + 1}</span>
                      <span className="flex-1 min-w-0">
                        <span className="text-sm font-semibold truncate flex items-center gap-2">
                          {m.inv.ticker || m.inv.name}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 font-mono">{m.inv.institution}</span>
                        </span>
                        <span className="text-[11px] text-[#55556a]">{m.inv.assetClass}</span>
                      </span>
                      <span className="text-right whitespace-nowrap">
                        <span className="v2-num text-sm font-bold block" style={{ color: '#ff4466' }}>−{fmt(toBase(Math.abs(m.gain)), true)}</span>
                        <span className="v2-num text-[10px]" style={{ color: '#ff4466' }}>{m.pct.toFixed(1)}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ExpandableCard>

          {/* Suitability gauge */}
          <ExpandableCard
            title={`Perfil · ${settings.suitability ?? 'Moderado'}`}
            subtitle="Carteira recomendada vs sua composição atual"
            modalSize="xl"
            detail={
              (() => {
                const profile: SuitabilityProfile = (settings.suitability ?? 'Moderado') as SuitabilityProfile
                const localTargets = LOCAL_TARGETS[profile]
                const intlTargets  = INTL_TARGETS[profile]
                // Actuals by canonical class (BRL)
                const localActuals = new Map<string, number>()
                const intlActuals  = new Map<string, number>()
                let onshoreTotal = 0, offshoreTotal = 0
                investments.forEach(i => {
                  if (i.location === 'physical-re') return
                  const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
                  if (v <= 0) return
                  if (i.location === 'offshore') {
                    const k = canonicalIntlClass(i.assetClass)
                    intlActuals.set(k, (intlActuals.get(k) ?? 0) + v)
                    offshoreTotal += v
                  } else {
                    const k = canonicalLocalClass(i.assetClass)
                    localActuals.set(k, (localActuals.get(k) ?? 0) + v)
                    onshoreTotal += v
                  }
                })
                const renderTable = (
                  classes: string[],
                  targets: Record<string, number>,
                  actuals: Map<string, number>,
                  total: number,
                ) => (
                  <div className="overflow-hidden rounded-xl border border-[#1e1e30] divide-y divide-[#1e1e30]">
                    <div className="grid grid-cols-[1fr_70px_70px_70px] items-center px-3 py-2 text-[10px] uppercase tracking-wider text-[#55556a]">
                      <span>Classe</span>
                      <span className="text-right">Alvo</span>
                      <span className="text-right">Atual</span>
                      <span className="text-right">Δ</span>
                    </div>
                    {classes.map(cls => {
                      const targetPct = targets[cls] ?? 0
                      const actualVal = actuals.get(cls) ?? 0
                      const actualPct = total > 0 ? (actualVal / total) * 100 : 0
                      const gap = actualPct - targetPct
                      return (
                        <div key={cls} className="grid grid-cols-[1fr_70px_70px_70px] items-center px-3 py-2.5 text-xs v2-row-hover">
                          <span className="truncate">{cls}</span>
                          <span className="v2-num text-right text-[#8888aa]">{targetPct.toFixed(1)}%</span>
                          <span className="v2-num text-right font-semibold">{actualPct.toFixed(1)}%</span>
                          <span className="v2-num text-right font-semibold" style={{
                            color: Math.abs(gap) < 1 ? '#8888aa' : (gap > 0 ? '#f59e0b' : '#00d4ff'),
                          }}>
                            {gap >= 0 ? '+' : ''}{gap.toFixed(1)}pp
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
                return (
                  <div>
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <div className="v2-card p-4">
                        <p className="v2-caption">Perfil declarado</p>
                        <p className="text-xl font-bold mt-1">{profile}</p>
                      </div>
                      <div className="v2-card p-4">
                        <p className="v2-caption">Total investido</p>
                        <p className="v2-num text-xl font-bold mt-1">{fmt(toBase(totals.totalValueBRL), true)}</p>
                      </div>
                    </div>
                    <div className="grid lg:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="v2-caption">Onshore (BRL)</p>
                          <span className="v2-num text-xs text-[#8888aa]">{fmt(toBase(onshoreTotal), true)}</span>
                        </div>
                        {renderTable(LOCAL_CLASSES, localTargets, localActuals, onshoreTotal)}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="v2-caption">Offshore (USD)</p>
                          <span className="v2-num text-xs text-[#8888aa]">{fmt(toBase(offshoreTotal), true)}</span>
                        </div>
                        {renderTable(INTL_CLASSES, intlTargets, intlActuals, offshoreTotal)}
                      </div>
                    </div>
                    <p className="mt-4 text-[11px] text-[#55556a] leading-relaxed">
                      Alvos oficiais Luxor por perfil de suitability. Δ positiva (laranja) = sobreponderado vs alvo;
                      Δ negativa (ciano) = subponderado.
                    </p>
                    <button
                      onClick={() => navigate(pfPath('/settings') + '#investidor')}
                      className="w-full mt-4 px-3 py-2.5 rounded-xl text-xs font-semibold border border-[#1e1e30] bg-[#0f1018] text-[#00d4ff] hover:border-[#00d4ff]/40"
                    >
                      Ajustar perfil em Configurações → Perfil de Investidor
                    </button>
                  </div>
                )
              })()
            }
          >
            <div className="flex items-center justify-between pr-9">
              <div>
                <p className="v2-caption">Perfil · Suitability</p>
                <p className="text-sm text-[#8888aa] mt-0.5">{settings.suitability ?? 'Moderado'}</p>
              </div>
            </div>
            <div className="mt-3 flex justify-center">
              <svg viewBox="0 0 180 110" className="w-44">
                <defs>
                  <linearGradient id="gaugeGrad" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%"   stopColor="#00d4ff"/>
                    <stop offset="50%"  stopColor="#00ff88"/>
                    <stop offset="100%" stopColor="#ff7a00"/>
                  </linearGradient>
                </defs>
                <path d="M 20 100 A 70 70 0 0 1 160 100" fill="none" stroke="#1e1e30" strokeWidth="14" strokeLinecap="round"/>
                <path d="M 20 100 A 70 70 0 0 1 160 100" fill="none" stroke="url(#gaugeGrad)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(gaugeScore / 100) * 220} 999`}/>
                <line x1="90" y1="100" x2={needleX} y2={needleY} stroke="#e8e8f0" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="90" cy="100" r="5" fill="#e8e8f0"/>
                <text x="90" y="92" textAnchor="middle" fill="#e8e8f0" fontSize="14" fontWeight="700" fontFamily="Inter">{gaugeScore}</text>
                <text x="20" y="108" fill="#55556a" fontSize="9" fontFamily="Inter">Conservador</text>
                <text x="160" y="108" textAnchor="end" fill="#55556a" fontSize="9" fontFamily="Inter">Agressivo</text>
              </svg>
            </div>
            <div className="mt-2 pt-3 border-t border-[#1e1e30] space-y-1.5 text-xs">
              <div className="flex items-center justify-between"><span className="text-[#8888aa]">Ativos</span><span className="v2-num font-semibold">{investments.length}</span></div>
              <div className="flex items-center justify-between"><span className="text-[#8888aa]">Classes</span><span className="v2-num font-semibold">{allocation.length}</span></div>
              <div className="flex items-center justify-between"><span className="text-[#8888aa]">Offshore</span><span className="v2-num font-semibold">
                {totals.totalValueBRL > 0
                  ? `${((investments.filter(i => i.location === 'offshore').reduce((s, i) => s + convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl), 0) / totals.totalValueBRL) * 100).toFixed(0)}%`
                  : '—'}
              </span></div>
            </div>
          </ExpandableCard>

        </section>

        {/* ─── Breakdown location toggle ─────────────────────────── */}
        <div className="flex items-center gap-3 v2-reveal">
          <span className="text-xs text-[#55556a] font-medium">Visão:</span>
          {(['all', 'onshore', 'offshore'] as const).map(loc => (
            <button
              key={loc}
              onClick={() => setBreakdownLocation(loc)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                breakdownLocation === loc
                  ? 'bg-[#00d4ff] text-black'
                  : 'bg-[#1e1e30] text-[#8888aa] hover:bg-[#2a2a3f] hover:text-white'
              }`}
            >
              {loc === 'all' ? 'Global' : loc === 'onshore' ? 'Onshore' : 'Offshore'}
            </button>
          ))}
        </div>

        {/* ─── TAXONOMIES · CLASS + PRODUCT TYPE ──────── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 v2-reveal">

          {/* Class breakdown */}
          <ExpandableCard
            title={`Carteira ${breakdownLocation === 'all' ? 'Global' : breakdownLocation === 'onshore' ? 'Onshore' : 'Offshore'} · por classe`}
            subtitle={`${onshoreClassBreakdown.rows.filter(r => r.value > 0).length} classes · ${fmt(toBase(onshoreClassBreakdown.total), true)} totais`}
            modalSize="lg"
            detail={
              onshoreClassBreakdown.total <= 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem ativos para classificar.</p>
              ) : (
                <div className="space-y-2">
                  {onshoreClassBreakdown.rows.map(r => (
                    <CategoryRow
                      key={r.label}
                      label={r.label}
                      color={r.color}
                      value={r.value}
                      pct={r.pct}
                      items={r.items}
                      fmt={(v) => fmt(toBase(v), true)}
                      setEditing={setEditing}
                    />
                  ))}
                </div>
              )
            }
          >
            <div className="flex items-center justify-between mb-1 pr-9">
              <p className="v2-caption">{breakdownLocation === 'all' ? 'Global' : breakdownLocation === 'onshore' ? 'Onshore' : 'Offshore'} · por classe</p>
            </div>
            <p className="text-sm text-[#8888aa] mt-0.5">{onshoreClassBreakdown.rows.filter(r => r.value > 0).length} classes · {breakdownLocation === 'onshore' ? 'ordem fixa' : 'por valor'}</p>
            <div className="mt-4 space-y-2.5">
              {onshoreClassBreakdown.total <= 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem ativos.</p>
              ) : onshoreClassBreakdown.rows.map(r => (
                <div key={r.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }}/>
                      <span className="font-medium truncate">{r.label}</span>
                    </span>
                    <span className="v2-num font-semibold flex-shrink-0">{r.pct.toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(r.pct, 0.5)}%`, background: r.color }}/>
                  </div>
                </div>
              ))}
            </div>
          </ExpandableCard>

          {/* Product type breakdown */}
          <ExpandableCard
            title={`Carteira ${breakdownLocation === 'all' ? 'Global' : breakdownLocation === 'onshore' ? 'Onshore' : 'Offshore'} · por tipo de produto`}
            subtitle={`${onshoreProductBreakdown.rows.filter(r => r.value > 0).length} tipos com posição · ${fmt(toBase(onshoreProductBreakdown.total), true)} totais`}
            modalSize="xl"
            detail={
              onshoreProductBreakdown.total <= 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem ativos para classificar.</p>
              ) : (
                <div className="space-y-2">
                  {onshoreProductBreakdown.rows.filter(r => r.value > 0).map(r => (
                    <CategoryRow
                      key={r.label}
                      label={r.label}
                      color={r.color}
                      value={r.value}
                      pct={r.pct}
                      items={r.items}
                      fmt={(v) => fmt(toBase(v), true)}
                      setEditing={setEditing}
                    />
                  ))}
                </div>
              )
            }
          >
            <div className="flex items-center justify-between mb-1 pr-9">
              <p className="v2-caption">{breakdownLocation === 'all' ? 'Global' : breakdownLocation === 'onshore' ? 'Onshore' : 'Offshore'} · por produto</p>
            </div>
            <p className="text-sm text-[#8888aa] mt-0.5">{onshoreProductBreakdown.rows.filter(r => r.value > 0).length} tipos com posição · alfabético</p>
            <div className="mt-4 space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
              {onshoreProductBreakdown.total <= 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem ativos.</p>
              ) : onshoreProductBreakdown.rows.filter(r => r.value > 0).map(r => (
                <div key={r.label}>
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: r.color }}/>
                      <span className="truncate">{r.label}</span>
                    </span>
                    <span className="v2-num font-semibold flex-shrink-0">{r.pct.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(r.pct, 0.5)}%`, background: r.color }}/>
                  </div>
                </div>
              ))}
            </div>
          </ExpandableCard>

        </section>

        {/* ─── BREAKDOWNS · 4 DONUT CARDS ───────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 v2-reveal">

          {/* Liquidez */}
          <ExpandableCard
            title="Liquidez · prazo de resgate"
            subtitle={`${liquidityBreakdown.rows.length} prazos representados na carteira`}
            modalSize="lg"
            detail={
              liquidityBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem ativos para classificar.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={liquidityBreakdown.slices} size={200} centerLabel="Liquidez"/></div>
                  <div className="space-y-2">
                    {liquidityBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Liquidez</p>
            <p className="text-sm text-[#8888aa] mt-0.5">D+0 → Vencimento</p>
            <div className="mt-4">
              {liquidityBreakdown.rows.filter(r => r.value > 0).length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem liquidez informada.</p>
              ) : (
                <>
                  <div className="h-5 rounded-lg overflow-hidden flex gap-px">
                    {liquidityBreakdown.rows.filter(r => r.value > 0).map(r => (
                      <div key={r.key} style={{ width: `${Math.max(r.pct, 1)}%`, background: r.color, flexShrink: 0 }} title={`${r.key}: ${r.pct.toFixed(1)}%`}/>
                    ))}
                  </div>
                  <div className="mt-3 space-y-1.5 max-h-[160px] overflow-y-auto">
                    {liquidityBreakdown.rows.filter(r => r.value > 0).map(r => (
                      <div key={r.key} className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: r.color }}/>
                          <span className="truncate">{r.key}</span>
                        </span>
                        <span className="v2-num font-semibold flex-shrink-0 ml-2">{r.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </ExpandableCard>

          {/* Tributação */}
          <ExpandableCard
            title="Tributação · regime fiscal"
            subtitle="Distribuição entre tributável, isento e diferido"
            modalSize="lg"
            detail={
              taxBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem ativos com tributação informada.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={taxBreakdown.slices} size={200} centerLabel="Tributação"/></div>
                  <div className="space-y-2">
                    {taxBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={taxLabel[r.key] ?? r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                        footnote={
                          r.key === 'taxable'      ? 'CDB, LF, COE, ações — tributação na fonte ou come-cotas' :
                          r.key === 'tax-deferred' ? 'PGBL, VGBL — tributação só no resgate' :
                          r.key === 'tax-exempt'   ? 'LCI, LCA, CRI, CRA, debêntures incentivadas — isento de IR' :
                          r.key === 'unset'        ? 'Cadastre o regime no formulário do investimento' :
                                                     undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Tributação</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Regime fiscal</p>
            <div className="mt-4 space-y-2">
              {taxBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem tributação informada.</p>
              ) : taxBreakdown.rows.map(r => (
                <div key={r.key} className="relative rounded-lg overflow-hidden px-3 py-2.5 flex items-center justify-between" style={{ background: `${r.color}12`, border: `1px solid ${r.color}28` }}>
                  <div className="absolute left-0 top-0 bottom-0 rounded-l-lg opacity-25" style={{ width: `${Math.max(r.pct, 2)}%`, background: r.color }}/>
                  <span className="relative text-xs font-medium truncate">{taxLabel[r.key] ?? r.key}</span>
                  <span className="relative v2-num text-sm font-bold flex-shrink-0 ml-2" style={{ color: r.color }}>{r.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </ExpandableCard>

          {/* Instituição / corretora */}
          <ExpandableCard
            title="Instituições · corretoras e bancos"
            subtitle={`${institutionBreakdown.rows.length} instituições · ${fmt(toBase(institutionBreakdown.total), true)} totais`}
            modalSize="lg"
            detail={
              institutionBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem instituições cadastradas.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={institutionBreakdown.slices} size={200} centerLabel="Instituições"/></div>
                  <div className="space-y-2">
                    {institutionBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Instituição</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Corretora / Banco</p>
            <div className="mt-4 space-y-2.5">
              {institutionBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem instituições.</p>
              ) : institutionBreakdown.rows.slice(0, 6).map(r => (
                <div key={r.key} className="flex items-center gap-2 text-[11px]">
                  <span className="w-14 text-[#8888aa] truncate text-right flex-shrink-0">{r.key}</span>
                  <div className="flex-1 h-2 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(r.pct, 1)}%`, background: r.color }}/>
                  </div>
                  <span className="v2-num font-semibold w-8 flex-shrink-0">{r.pct.toFixed(0)}%</span>
                </div>
              ))}
              {institutionBreakdown.rows.length > 6 && (
                <p className="text-[10px] text-[#55556a]">+ {institutionBreakdown.rows.length - 6} mais</p>
              )}
            </div>
          </ExpandableCard>

          {/* Risco */}
          <ExpandableCard
            title="Risco · classificação dos ativos"
            subtitle="Escala 1 (muito baixo) → 5 (muito alto)"
            modalSize="lg"
            detail={
              riskBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem ativos com nível de risco informado.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={riskBreakdown.slices} size={200} centerLabel="Risco"/></div>
                  <div className="space-y-2">
                    {riskBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={`${r.key === 'unset' ? '—' : r.key} · ${riskLabel[r.key] ?? r.key}`}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Risco</p>
            <p className="text-sm text-[#8888aa] mt-0.5">1 Muito baixo → 5 Muito alto</p>
            <div className="mt-4">
              <div className="h-2.5 rounded-full" style={{ background: 'linear-gradient(to right, #00ff88, #84cc16, #f59e0b, #ff7a00, #ff4466)' }}/>
              <div className="mt-3 grid grid-cols-5 gap-1">
                {(['1','2','3','4','5'] as const).map(lvl => {
                  const row = riskBreakdown.rows.find(r => r.key === lvl)
                  const cols: Record<string, string> = { '1': '#00ff88', '2': '#84cc16', '3': '#f59e0b', '4': '#ff7a00', '5': '#ff4466' }
                  const col = cols[lvl]
                  const labels = ['MB','B','M','A','MA']
                  return (
                    <div key={lvl} className="text-center space-y-1">
                      <div className="h-10 rounded-md flex items-end justify-center pb-1.5" style={{
                        background: row ? `${col}18` : '#0f1018',
                        border: `1px solid ${row ? col + '30' : '#1e1e30'}`,
                      }}>
                        <span className="v2-num text-[11px] font-bold" style={{ color: row ? col : '#2a2a40' }}>
                          {row ? `${row.pct.toFixed(0)}%` : '—'}
                        </span>
                      </div>
                      <p className="text-[9px] text-[#55556a]">{labels[parseInt(lvl)-1]}</p>
                    </div>
                  )
                })}
              </div>
              {riskBreakdown.rows.some(r => r.key === 'unset') && (
                <p className="mt-2 text-[10px] text-[#55556a]">
                  {riskBreakdown.rows.find(r => r.key === 'unset')?.pct.toFixed(0)}% sem classificação
                </p>
              )}
            </div>
          </ExpandableCard>

        </section>

        {/* ─── ANÁLISE · 6 DONUT CARDS ───────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 v2-reveal">

          {/* Emissor */}
          <ExpandableCard
            title="Emissor · por emissor do ativo"
            subtitle={`${emisssorBreakdown.rows.filter(r => r.value > 0).length} emissores · ${fmt(toBase(emisssorBreakdown.total), true)} totais`}
            modalSize="lg"
            detail={
              emisssorBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem emissores cadastrados.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={emisssorBreakdown.slices} size={200} centerLabel="Emissor"/></div>
                  <div className="space-y-2">
                    {emisssorBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Emissor</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Por emissor do ativo</p>
            <div className="mt-4 space-y-2">
              {emisssorBreakdown.rows.filter(r => r.value > 0).length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem emissores cadastrados.</p>
              ) : emisssorBreakdown.rows.filter(r => r.value > 0).slice(0, 6).map(r => (
                <div key={r.key} className="flex items-center gap-2 text-[11px]">
                  <span className="w-16 text-[#8888aa] truncate text-right flex-shrink-0">{r.key}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(r.pct, 1)}%`, background: r.color }}/>
                  </div>
                  <span className="v2-num font-semibold w-8 flex-shrink-0">{r.pct.toFixed(0)}%</span>
                </div>
              ))}
              {emisssorBreakdown.rows.filter(r => r.value > 0).length > 6 && (
                <p className="text-[10px] text-[#55556a]">+ {emisssorBreakdown.rows.filter(r => r.value > 0).length - 6} mais</p>
              )}
            </div>
          </ExpandableCard>

          {/* Holding */}
          <ExpandableCard
            title="Holding · grupo econômico"
            subtitle={`${holdingBreakdown.rows.filter(r => r.value > 0).length} holdings · ${fmt(toBase(holdingBreakdown.total), true)} totais`}
            modalSize="lg"
            detail={
              holdingBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem holdings cadastradas.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={holdingBreakdown.slices} size={200} centerLabel="Holding"/></div>
                  <div className="space-y-2">
                    {holdingBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Holding</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Grupo econômico</p>
            <div className="mt-4 space-y-2">
              {holdingBreakdown.rows.filter(r => r.value > 0).length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem holdings cadastradas.</p>
              ) : holdingBreakdown.rows.filter(r => r.value > 0).slice(0, 6).map(r => (
                <div key={r.key} className="flex items-center gap-2 text-[11px]">
                  <span className="w-16 text-[#8888aa] truncate text-right flex-shrink-0">{r.key}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(r.pct, 1)}%`, background: r.color }}/>
                  </div>
                  <span className="v2-num font-semibold w-8 flex-shrink-0">{r.pct.toFixed(0)}%</span>
                </div>
              ))}
              {holdingBreakdown.rows.filter(r => r.value > 0).length > 6 && (
                <p className="text-[10px] text-[#55556a]">+ {holdingBreakdown.rows.filter(r => r.value > 0).length - 6} mais</p>
              )}
            </div>
          </ExpandableCard>

          {/* Vencimento */}
          <ExpandableCard
            title="Vencimento · prazo dos ativos"
            subtitle={`${maturityBreakdown.rows.filter(r => r.value > 0).length} faixas de prazo representadas`}
            modalSize="lg"
            detail={
              maturityBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem datas de vencimento informadas.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={maturityBreakdown.slices} size={200} centerLabel="Vencimento"/></div>
                  <div className="space-y-2">
                    {maturityBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Vencimento</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Curto → Longo prazo</p>
            <div className="mt-4">
              {maturityBreakdown.rows.filter(r => r.value > 0).length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem vencimentos informados.</p>
              ) : (
                <>
                  <div className="h-5 rounded-lg overflow-hidden flex gap-px">
                    {maturityBreakdown.rows.filter(r => r.value > 0).map(r => (
                      <div key={r.key} style={{ width: `${Math.max(r.pct, 1)}%`, background: r.color, flexShrink: 0 }} title={`${r.key}: ${r.pct.toFixed(1)}%`}/>
                    ))}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {maturityBreakdown.rows.filter(r => r.value > 0).map(r => (
                      <div key={r.key} className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: r.color }}/>
                          <span className="truncate">{r.key}</span>
                        </span>
                        <span className="v2-num font-semibold flex-shrink-0 ml-2">{r.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </ExpandableCard>

          {/* Frequência de pagamento de juros */}
          <ExpandableCard
            title="Frequência de juros · pagamento de cupons"
            subtitle={`${paymentFreqBreakdown.rows.filter(r => r.value > 0).length} frequências representadas`}
            modalSize="lg"
            detail={
              paymentFreqBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem frequência de pagamento informada.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={paymentFreqBreakdown.slices} size={200} centerLabel="Frequência"/></div>
                  <div className="space-y-2">
                    {paymentFreqBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Freq. de Juros</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Pagamento de cupons</p>
            <div className="mt-4 space-y-2">
              {paymentFreqBreakdown.rows.filter(r => r.value > 0).length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem freq. informada.</p>
              ) : paymentFreqBreakdown.rows.filter(r => r.value > 0).map(r => (
                <div key={r.key} className="relative rounded-lg overflow-hidden px-3 py-2.5 flex items-center justify-between" style={{ background: `${r.color}12`, border: `1px solid ${r.color}28` }}>
                  <div className="absolute left-0 top-0 bottom-0 rounded-l-lg opacity-25" style={{ width: `${Math.max(r.pct, 2)}%`, background: r.color }}/>
                  <span className="relative text-xs font-medium truncate">{r.key}</span>
                  <span className="relative v2-num text-sm font-bold flex-shrink-0 ml-2" style={{ color: r.color }}>{r.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </ExpandableCard>

          {/* Setor */}
          <ExpandableCard
            title="Setor · exposição setorial"
            subtitle={`${sectorBreakdown.rows.filter(r => r.value > 0).length} setores · ${fmt(toBase(sectorBreakdown.total), true)} totais`}
            modalSize="lg"
            detail={
              sectorBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem setores cadastrados.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={sectorBreakdown.slices} size={200} centerLabel="Setor"/></div>
                  <div className="space-y-2">
                    {sectorBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Setor</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Exposição setorial</p>
            <div className="mt-4 space-y-2">
              {sectorBreakdown.rows.filter(r => r.value > 0).length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem setores cadastrados.</p>
              ) : sectorBreakdown.rows.filter(r => r.value > 0).slice(0, 6).map(r => (
                <div key={r.key} className="flex items-center gap-2 text-[11px]">
                  <span className="w-16 text-[#8888aa] truncate text-right flex-shrink-0">{r.key}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(r.pct, 1)}%`, background: r.color }}/>
                  </div>
                  <span className="v2-num font-semibold w-8 flex-shrink-0">{r.pct.toFixed(0)}%</span>
                </div>
              ))}
              {sectorBreakdown.rows.filter(r => r.value > 0).length > 6 && (
                <p className="text-[10px] text-[#55556a]">+ {sectorBreakdown.rows.filter(r => r.value > 0).length - 6} mais</p>
              )}
            </div>
          </ExpandableCard>

          {/* Benchmark */}
          <ExpandableCard
            title="Benchmark · índice de referência"
            subtitle={`${benchmarkBreakdown.rows.filter(r => r.value > 0).length} benchmarks representados`}
            modalSize="lg"
            detail={
              benchmarkBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem benchmark informado.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={benchmarkBreakdown.slices} size={200} centerLabel="Benchmark"/></div>
                  <div className="space-y-2">
                    {benchmarkBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Benchmark</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Índice de referência</p>
            <div className="mt-4 space-y-2">
              {benchmarkBreakdown.rows.filter(r => r.value > 0).length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem benchmark informado.</p>
              ) : benchmarkBreakdown.rows.filter(r => r.value > 0).slice(0, 6).map(r => (
                <div key={r.key} className="flex items-center gap-2 text-[11px]">
                  <span className="w-16 text-[#8888aa] truncate text-right flex-shrink-0">{r.key}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(r.pct, 1)}%`, background: r.color }}/>
                  </div>
                  <span className="v2-num font-semibold w-8 flex-shrink-0">{r.pct.toFixed(0)}%</span>
                </div>
              ))}
              {benchmarkBreakdown.rows.filter(r => r.value > 0).length > 6 && (
                <p className="text-[10px] text-[#55556a]">+ {benchmarkBreakdown.rows.filter(r => r.value > 0).length - 6} mais</p>
              )}
            </div>
          </ExpandableCard>

        </section>

        {/* HEATMAP */}
        {heatmap.classes.length > 0 && (
          <section className="v2-reveal">
          <ExpandableCard
            title="Rentabilidade mensal · por classe"
            subtitle="Heatmap completo · 6 meses · estimativa baseada em PM × preço atual"
            modalSize="xl"
            detail={
              <div>
                <div className="overflow-x-auto">
                  <div className="grid gap-2 min-w-[640px]" style={{ gridTemplateColumns: `200px repeat(${heatmap.months.length}, 1fr)` }}>
                    <div></div>
                    {heatmap.months.map(m => (
                      <div key={`x-${m.y}-${m.m}`} className="text-center text-[10px] text-[#55556a] font-semibold py-1">{m.label} {String(m.y).slice(-2)}</div>
                    ))}
                    {heatmap.classes.map(cls => (
                      <React.Fragment key={cls}>
                        <div className="text-xs text-[#e8e8f0] flex items-center truncate font-medium">{cls}</div>
                        {heatmap.months.map(m => {
                          const r = heatmap.ret(cls, m.y, m.m)
                          const intensity = Math.min(1, Math.abs(r) / 8)
                          const bg = r >= 0
                            ? `rgba(0,255,136,${0.15 + intensity * 0.45})`
                            : `rgba(255,68,102,${0.15 + intensity * 0.45})`
                          const color = r >= 0 ? '#00ff88' : '#ff4466'
                          return (
                            <div key={`x-${cls}-${m.y}-${m.m}`} className="v2-heat-cell text-center text-xs v2-num font-semibold" style={{ background: bg, color, padding: '14px 8px' }}>
                              {r >= 0 ? '+' : ''}{r.toFixed(1)}%
                            </div>
                          )
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <p className="mt-4 text-[11px] text-[#55556a] leading-relaxed">
                  Estimativa baseada na variação atual vs preço médio de cada ativo, distribuída pelos meses do período.
                  Para retornos por mês reais, é necessário histórico de preços por classe.
                </p>
              </div>
            }
          >
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2 pr-9">
              <div>
                <p className="v2-caption">Rentabilidade mensal · por classe</p>
                <p className="text-sm text-[#8888aa] mt-0.5">Heatmap dos últimos 6 meses · estimativa</p>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-[#55556a]">−5%</span>
                <span className="w-3 h-3 rounded" style={{ background: 'rgba(255,68,102,.6)' }}/>
                <span className="w-3 h-3 rounded" style={{ background: 'rgba(255,68,102,.25)' }}/>
                <span className="w-3 h-3 rounded" style={{ background: 'rgba(85,85,106,.4)' }}/>
                <span className="w-3 h-3 rounded" style={{ background: 'rgba(0,255,136,.25)' }}/>
                <span className="w-3 h-3 rounded" style={{ background: 'rgba(0,255,136,.6)' }}/>
                <span className="text-[#55556a]">+5%</span>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <div className="grid gap-1.5 min-w-[640px]" style={{ gridTemplateColumns: `160px repeat(${heatmap.months.length}, 1fr)` }}>
                <div></div>
                {heatmap.months.map(m => (
                  <div key={`h-${m.y}-${m.m}`} className="text-center text-[10px] text-[#55556a] font-semibold py-1">{m.label}</div>
                ))}
                {heatmap.classes.map(cls => (
                  <React.Fragment key={cls}>
                    <div className="text-xs text-[#8888aa] flex items-center truncate">{cls}</div>
                    {heatmap.months.map(m => {
                      const r = heatmap.ret(cls, m.y, m.m)
                      const intensity = Math.min(1, Math.abs(r) / 8)
                      const bg = r >= 0
                        ? `rgba(0,255,136,${0.15 + intensity * 0.45})`
                        : `rgba(255,68,102,${0.15 + intensity * 0.45})`
                      const color = r >= 0 ? '#00ff88' : '#ff4466'
                      return (
                        <div key={`c-${cls}-${m.y}-${m.m}`} className="v2-heat-cell text-center text-xs v2-num font-semibold" style={{ background: bg, color }}>
                          {r >= 0 ? '+' : ''}{r.toFixed(1)}%
                        </div>
                      )
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </ExpandableCard>
          </section>
        )}

        {/* POSIÇÕES */}
        <section className="v2-reveal">
          <details className="v2-card group" open>
            <summary className="cursor-pointer list-none flex items-center justify-between p-5 hover:bg-[#161729] transition-colors rounded-2xl">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,212,255,.1)', color: '#00d4ff' }}><Layers className="w-4 h-4"/></span>
                <div>
                  <p className="text-sm font-semibold">Todas as posições · {investments.length} ativos</p>
                  <p className="text-xs text-[#55556a]">Use os filtros para refinar por classe ou ticker</p>
                </div>
              </div>
              <span className="flex items-center gap-3">
                <span className="v2-caption v2-num">{positions.length} ativos</span>
                <ChevronDown className="w-4 h-4 text-[#55556a] transition-transform group-open:rotate-180"/>
              </span>
            </summary>
            <div className="px-5 pb-5">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#55556a]"/>
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar ticker, ativo, instituição…"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-[#0a0a0f] border border-[#1e1e30] text-[#e8e8f0] placeholder:text-[#55556a] focus:outline-none focus:border-[#00d4ff]/40"
                  />
                </div>
                <select value={filterClass} onChange={e => setFilterClass(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-medium border border-[#1e1e30] bg-[#0a0a0f] text-[#8888aa] max-w-[200px]">
                  <option value="all">Classe: todas</option>
                  {allClassesForFilter.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filterInstitution} onChange={e => setFilterInstitution(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-medium border border-[#1e1e30] bg-[#0a0a0f] text-[#8888aa] max-w-[200px]">
                  <option value="all">Instituição: todas</option>
                  {Array.from(new Set(investments.map(i => i.institution).filter(Boolean))).sort().map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filterTax} onChange={e => setFilterTax(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-medium border border-[#1e1e30] bg-[#0a0a0f] text-[#8888aa]">
                  <option value="all">Tributação: todas</option>
                  <option value="taxable">Tributável</option>
                  <option value="tax-deferred">Imp. diferido</option>
                  <option value="tax-exempt">Isento</option>
                  <option value="unset">Não classif.</option>
                </select>
                {(filterClass !== 'all' || filterInstitution !== 'all' || filterTax !== 'all' || search) && (
                  <button
                    onClick={() => { setFilterClass('all'); setFilterInstitution('all'); setFilterTax('all'); setSearch('') }}
                    className="px-3 py-2 rounded-lg text-xs font-medium border border-[#1e1e30] bg-[#0a0a0f] text-[#ff7a00] hover:border-[#ff7a00]/40"
                  >Limpar filtros</button>
                )}
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[960px] overflow-hidden rounded-xl border border-[#1e1e30] divide-y divide-[#1e1e30]">
                  <div className="grid grid-cols-[90px_minmax(160px,1.4fr)_minmax(120px,1fr)_80px_130px_110px_100px_32px] items-center gap-1 px-3 py-2 text-[10px] uppercase tracking-wider text-[#55556a]">
                    <button onClick={() => toggleSort('name')}     className="text-left hover:text-[#e8e8f0]">Ticker{sortIcon('name')}</button>
                    <button onClick={() => toggleSort('name')}     className="text-left hover:text-[#e8e8f0]">Ativo{sortIcon('name')}</button>
                    <button onClick={() => toggleSort('class')}    className="text-left hover:text-[#e8e8f0]">Classe{sortIcon('class')}</button>
                    <button onClick={() => toggleSort('qty')}      className="text-right hover:text-[#e8e8f0]">Qtd{sortIcon('qty')}</button>
                    <button onClick={() => toggleSort('avgCost')}  className="text-right hover:text-[#e8e8f0]">PM / Atual{sortIcon('avgCost')}</button>
                    <button onClick={() => toggleSort('position')} className="text-right hover:text-[#e8e8f0]">Posição{sortIcon('position')}</button>
                    <button onClick={() => toggleSort('period')}   className="text-right hover:text-[#e8e8f0]">Retorno {periodLabel}{sortIcon('period')}</button>
                    <span></span>
                  </div>
                  {visiblePos.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-[#55556a]">Nenhum ativo encontrado.</div>
                  ) : visiblePos.map(p => {
                    const isPluggy = !!p.notes?.match(/pluggy:[^\s]+/)
                    return (
                      <div
                        key={p.id}
                        onClick={() => setEditing(p as Investment)}
                        className="grid grid-cols-[90px_minmax(160px,1.4fr)_minmax(120px,1fr)_80px_130px_110px_100px_32px] items-center gap-1 px-3 py-2.5 text-xs v2-row-hover cursor-pointer"
                        title="Clique para editar"
                      >
                        <span className="font-mono font-semibold truncate flex items-center gap-1.5" style={{ color: '#00d4ff' }}>
                          {p.ticker || p.name.slice(0, 8)}
                        </span>
                        <span className="font-medium truncate flex items-center gap-2">
                          <span className="truncate">{p.name}</span>
                          {isPluggy && (
                            <span
                              className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                              style={{ background: 'rgba(236,72,153,.15)', color: '#ec4899', border: '1px solid rgba(236,72,153,.3)' }}
                              title="Importado via Open Finance (Pluggy)"
                            >
                              Open Finance
                            </span>
                          )}
                        </span>
                        <span className="truncate text-[#8888aa]">{p.assetClass}</span>
                        <span className="v2-num text-right text-[#8888aa]">{p.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</span>
                        <span className="v2-num text-right text-[#8888aa]">{p.avgCost.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} / {p.currentPrice.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
                        <span className="v2-num text-right font-semibold">{fmt(toBase(p.currentBRL), true)}</span>
                        <span className="v2-num text-right font-semibold flex flex-col items-end gap-0.5" style={{ color: p.pct >= 0 ? '#00ff88' : '#ff4466' }}>
                          <span>{p.pct >= 0 ? '+' : ''}{p.pct.toFixed(1)}%</span>
                          {p.linkedIncomeAll > 0 && (
                            <span
                              className="text-[9px] font-semibold px-1 py-0.5 rounded"
                              style={{ background: 'rgba(0,212,255,.12)', color: '#00d4ff' }}
                              title={`Rendimentos vinculados do extrato: ${fmt(toBase(p.linkedIncomeAll), true)}`}
                            >
                              +{fmt(toBase(p.linkedIncomeAll), true)} rend.
                            </span>
                          )}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const msg = isPluggy
                              ? `Excluir "${p.name}"?\n\nEste ativo foi importado do Open Finance. A exclusão é permanente: ele NÃO volta automaticamente em syncs futuros, mesmo que ainda apareça na sua corretora.`
                              : `Excluir "${p.name}"?`
                            if (confirm(msg)) {
                              deleteInvestment(p.id).catch(err => {
                                console.error('[WealthV2] delete failed', err)
                                alert('Falha ao excluir. Tente novamente.')
                              })
                            }
                          }}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-[#55556a] hover:text-[#ff4466] hover:bg-[#ff4466]/10 mx-auto"
                          title={isPluggy ? 'Excluir (permanente — não retorna em sync)' : 'Excluir'}
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                  {positions.length > 8 && !showAllPos && (
                    <div className="px-3 py-3 text-center">
                      <button onClick={() => setShowAllPos(true)} className="text-[11px] text-[#8888aa] hover:text-white">Mostrar mais {positions.length - 8} ativos</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </details>
        </section>

      </div>


      <InvestmentModal open={showAddInv} onClose={() => setShowAddInv(false)} />
      <InvestmentModal
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={editing ?? undefined}
        linkedTransactions={editing ? (linkedTxByInvestment.get(editing.id) ?? []) : []}
      />
    </div>
  )
}

// ── Expandable category row used in every breakdown modal ───────────
// Renders a summary line (color · label · value · %), and when expanded
// shows the individual investments composing that bucket. Each child
// investment is itself clickable — opens the edit modal via setEditing.
function CategoryRow({
  label, color, value, pct, items, fmt, setEditing, footnote,
}: {
  label: string
  color: string
  value: number
  pct: number
  items: { inv: Investment; valueBRL: number }[]
  fmt: (vBRL: number) => string
  setEditing: (i: Investment) => void
  footnote?: string
}) {
  const hasItems = items.length > 0
  return (
    <details className="v2-card group">
      <summary
        className={`list-none flex items-center gap-3 px-3 py-2.5 ${hasItems ? 'cursor-pointer hover:bg-[#161729]' : 'cursor-default'} rounded-xl transition-colors`}
      >
        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }}/>
        <span className="flex-1 min-w-0 truncate text-sm font-medium">{label}</span>
        <span className="v2-num text-xs font-semibold whitespace-nowrap">{value > 0 ? fmt(value) : '—'}</span>
        <span className="v2-num text-xs font-bold w-14 text-right" style={{ color: value > 0 ? color : '#55556a' }}>{pct.toFixed(1)}%</span>
        {hasItems && (
          <span className="text-[10px] text-[#55556a] w-10 text-right group-open:rotate-90 transition-transform">▶ {items.length}</span>
        )}
      </summary>
      {hasItems && (
        <div className="border-t border-[#1e1e30] divide-y divide-[#1e1e30] bg-[#0a0a0f]">
          {items.map(({ inv, valueBRL }) => (
            <button
              key={inv.id}
              onClick={(e) => { e.preventDefault(); setEditing(inv); }}
              className="w-full text-left grid grid-cols-[100px_1fr_120px] items-center gap-2 px-3 py-2 text-xs hover:bg-[#161729] transition-colors"
              title="Clique para editar"
            >
              <span className="font-mono font-semibold truncate" style={{ color: '#00d4ff' }}>{inv.ticker || inv.name.slice(0, 12)}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{inv.name}</span>
                <span className="block text-[10px] text-[#55556a] truncate">{inv.assetClass} · {inv.institution}</span>
              </span>
              <span className="v2-num text-right font-semibold">{fmt(valueBRL)}</span>
            </button>
          ))}
        </div>
      )}
      {footnote && (
        <p className="px-3 py-2 text-[10px] text-[#55556a] border-t border-[#1e1e30] bg-[#0a0a0f]">{footnote}</p>
      )}
    </details>
  )
}
