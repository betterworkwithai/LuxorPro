import React, { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Wallet, ArrowRight,
  Clock, Globe, Building2, ChevronLeft, ChevronRight,
  ExternalLink, ChevronDown, Activity, Target as TargetIcon,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { Card, CardHeader, CardTitle, CardContent, StatCard } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { formatBRL, formatDate, monthName, currentMonthYear } from '../lib/formatters'
import { useAllCategories } from '../lib/useCategories'
import { AddTransactionModal } from '../components/modals/AddTransactionModal'
import { LOCAL_CLASSES, INTL_CLASSES, canonicalLocalClass, canonicalIntlClass, convert } from '../lib/suitability'
import { pfPath } from '../constants'
import { clsx } from 'clsx'

// ─── Perceptually distinct palette (12 slots, max visual separation) ─────────
const CHART_PALETTE = [
  '#3b82f6',  // blue
  '#ff4466',  // crimson
  '#f59e0b',  // amber
  '#00ff88',  // green
  '#8b5cf6',  // purple
  '#00d4ff',  // cyan
  '#ff7a00',  // orange
  '#ec4899',  // pink
  '#14b8a6',  // teal
  '#84cc16',  // lime
  '#6366f1',  // indigo
  '#fb923c',  // peach
]

// Override specific category IDs/names to fixed brand colors
const CATEGORY_COLORS: Record<string, string> = {
  'imposto': '#ff7a00',
  'Impostos': '#ff7a00',
}

// ─── Types ────────────────────────────────────
type PeriodMode = 'monthly' | 'ytd' | 'yearly'

const PERIOD_LS_KEY = 'luxor_dashboard_period'

// ─── Tooltip ─────────────────────────────────
function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-3 text-xs shadow-xl">
      <p className="text-[#8888aa] mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="font-semibold" style={{ color: p.color }}>
          {p.name}: {formatBRL(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Sparkline ────────────────────────────────
function NetWorthSparkline({ value }: { value: number }) {
  const data = useMemo(() => {
    const seed = Array.from({ length: 7 }, (_, i) => ({
      d: i,
      v: value * (0.88 + i * 0.02 + Math.sin(i) * 0.005),
    }))
    seed[seed.length - 1].v = value
    return seed
  }, [value])

  return (
    <ResponsiveContainer width="100%" height={60}>
      <AreaChart data={data} margin={{ top: 5, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#ff7a00" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ff7a00" stopOpacity={0}   />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke="#ff7a00" strokeWidth={2} fill="url(#sparkGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Period navigator component ───────────────
function PeriodSelector({
  mode, setMode,
  selMonth, setSelMonth,
  selYear,  setSelYear,
  todayMonth, todayYear,
}: {
  mode: PeriodMode
  setMode: (m: PeriodMode) => void
  selMonth: number; setSelMonth: (m: number) => void
  selYear: number;  setSelYear:  (y: number) => void
  todayMonth: number; todayYear: number
}) {
  const prevMonth = () => {
    if (selMonth === 1) { setSelMonth(12); setSelYear(selYear - 1) }
    else setSelMonth(selMonth - 1)
  }
  const nextMonth = () => {
    if (selMonth === 12) { setSelMonth(1); setSelYear(selYear + 1) }
    else setSelMonth(selMonth + 1)
    }
  const isNextMonthFuture = selYear > todayYear || (selYear === todayYear && selMonth >= todayMonth)
  const isNextYearFuture  = selYear >= todayYear

  const periodLabel =
    mode === 'monthly' ? `${monthName(selMonth)} ${selYear}` :
    mode === 'ytd'     ? `Acumulado ${todayYear} · Jan – ${monthName(todayMonth).slice(0, 3)}` :
                         `Ano ${selYear}`

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Mode tabs */}
      <div className="flex items-center gap-1 bg-[#16161f] rounded-xl p-1 border border-[#1e1e2e]">
        {([
          { v: 'monthly', l: 'Mensal'      },
          { v: 'ytd',     l: 'Ano'         },
          { v: 'yearly',  l: 'Anual'       },
        ] as { v: PeriodMode; l: string }[]).map(({ v, l }) => (
          <button
            key={v}
            onClick={() => setMode(v)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              mode === v
                ? 'bg-[#ff7a00]/10 text-[#ff7a00] border border-[#ff7a00]/20'
                : 'text-[#55556a] hover:text-[#8888aa]',
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Navigation arrows + label */}
      {mode !== 'ytd' && (
        <div className="flex items-center gap-2">
          <button
            onClick={mode === 'monthly' ? prevMonth : () => setSelYear(selYear - 1)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#55556a] hover:text-[#e8e8f0] hover:bg-[#1e1e2e] transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-[#e8e8f0] min-w-[130px] text-center">
            {periodLabel}
          </span>
          <button
            onClick={mode === 'monthly' ? nextMonth : () => setSelYear(selYear + 1)}
            disabled={mode === 'monthly' ? isNextMonthFuture : isNextYearFuture}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#55556a] hover:text-[#e8e8f0] hover:bg-[#1e1e2e] transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
      {mode === 'ytd' && (
        <span className="text-sm font-medium text-[#e8e8f0]">{periodLabel}</span>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────
export default function Dashboard() {
  const { transactions, investments, subscriptions, goals, settings, setModal, activeModal } = useStore()
  const allCategories = useAllCategories()
  const { month: todayMonth, year: todayYear } = currentMonthYear()

  // ── Period state — restored from localStorage ────
  const savedPeriod = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(PERIOD_LS_KEY) ?? 'null') } catch { return null }
  }, [])
  const [periodMode, setPeriodMode] = useState<PeriodMode>(savedPeriod?.mode ?? 'monthly')
  const [selMonth,   setSelMonth]   = useState<number>(savedPeriod?.selMonth ?? todayMonth)
  const [selYear,    setSelYear]    = useState<number>(savedPeriod?.selYear  ?? todayYear)

  // Persist whenever period changes
  useEffect(() => {
    localStorage.setItem(PERIOD_LS_KEY, JSON.stringify({ mode: periodMode, selMonth, selYear }))
  }, [periodMode, selMonth, selYear])

  // ── Expanded category state ───────────────
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())

  // ── Portfolio scope toggle (Global / Local / Internacional) ───
  const [portfolioScope, setPortfolioScope] = useState<'global' | 'local' | 'international'>('global')
  const toggleCat = (id: string) =>
    setExpandedCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ── Filter transactions for selected period ──
  const periodTx = useMemo(() => {
    if (periodMode === 'monthly') {
      return transactions.filter(t => {
        const [y, m] = t.date.split('-')
        return parseInt(y) === selYear && parseInt(m) === selMonth
      })
    }
    if (periodMode === 'ytd') {
      const todayStr = new Date().toISOString().split('T')[0]
      const jan1     = `${todayYear}-01-01`
      return transactions.filter(t => t.date >= jan1 && t.date <= todayStr)
    }
    // yearly
    return transactions.filter(t => t.date.startsWith(`${selYear}-`))
  }, [transactions, periodMode, selMonth, selYear, todayYear])

  // ── Currency conversion helper ────────────
  const txToBRL = (t: typeof periodTx[number]) => {
    if (!t.currency || t.currency === 'BRL') return t.amount
    if (t.currency === 'USD') return t.amount * settings.usdToBrl
    if (t.currency === 'EUR') return t.amount * (settings.eurToBrl ?? 5.90)
    return t.amount
  }

  // ── KPIs ──────────────────────────────────
  const income      = useMemo(() => periodTx.filter(t => t.type === 'income').reduce((a, t) => a + txToBRL(t), 0),  [periodTx, settings.usdToBrl, settings.eurToBrl])
  const expenses    = useMemo(() => periodTx.filter(t => t.type === 'expense').reduce((a, t) => a + txToBRL(t), 0), [periodTx, settings.usdToBrl, settings.eurToBrl])
  const expensesExInvest = useMemo(() => periodTx.filter(t => t.type === 'expense' && t.category !== 'investimento').reduce((a, t) => a + txToBRL(t), 0), [periodTx, settings.usdToBrl, settings.eurToBrl])
  const investAportes  = useMemo(() => periodTx.filter(t => t.type === 'expense' && t.category === 'investimento').reduce((a, t) => a + txToBRL(t), 0), [periodTx, settings.usdToBrl, settings.eurToBrl])
  const investResgates = useMemo(() => periodTx.filter(t => t.type === 'income'  && t.category === 'investimento').reduce((a, t) => a + txToBRL(t), 0), [periodTx, settings.usdToBrl, settings.eurToBrl])
  const netInvestment  = investAportes - investResgates
  const cleanIncome    = income   - investResgates
  const cleanExpenses  = expenses - investAportes
  const taxExpenses    = useMemo(() => periodTx.filter(t => t.type === 'expense' && t.category === 'imposto').reduce((a, t) => a + txToBRL(t), 0), [periodTx, settings.usdToBrl, settings.eurToBrl])
  const nonTaxExpenses = cleanExpenses - taxExpenses
  const netFlow     = income - expenses
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0

  // ── KPI labels & secondary metric ────────────────────────────
  const kpiLabel = periodMode === 'monthly' ? 'do Mês' : periodMode === 'ytd' ? 'YTD' : 'do Ano'

  // Secondary line: monthly avg (year/ytd) or yearly forecast (monthly)
  const kpiSecondary = (base: number): string => {
    if (base === 0) return ''
    if (periodMode === 'monthly') {
      return `≈ ${formatBRL(base * 12, true)}/ano (projeção)`
    }
    if (periodMode === 'ytd') {
      const months = todayMonth   // months elapsed so far this year
      return `≈ ${formatBRL(base / months, true)}/mês (média ${months}m)`
    }
    // yearly
    return `≈ ${formatBRL(base / 12, true)}/mês (média)`
  }

  // ── Net worth (always current) ─────────────
  const eurRate = settings.eurToBrl ?? 5.90
  const netWorth = useMemo(() =>
    investments.reduce((sum, inv) => {
      const value = inv.quantity * inv.currentPrice
      const inBrl = inv.currency === 'USD' ? value * settings.usdToBrl
                  : inv.currency === 'EUR' ? value * eurRate
                  : value
      return sum + inBrl
    }, 0), [investments, settings.usdToBrl, eurRate])

  const offshoreValue = useMemo(() =>
    investments.filter(i => i.location === 'offshore')
      .reduce((s, i) => {
        const v = i.quantity * i.currentPrice
        return s + (i.currency === 'USD' ? v * settings.usdToBrl : i.currency === 'EUR' ? v * eurRate : v)
      }, 0),
    [investments, settings.usdToBrl, eurRate])
  const onshoreValue = netWorth - offshoreValue

  // Imobilizado (physical real estate / empresa) vs Líquido
  const immobilizedValue = useMemo(() =>
    investments.filter(i => i.location === 'physical-re')
      .reduce((s, i) => {
        const v = i.quantity * i.currentPrice
        return s + (i.currency === 'USD' ? v * settings.usdToBrl : i.currency === 'EUR' ? v * eurRate : v)
      }, 0),
    [investments, settings.usdToBrl, eurRate])
  const liquidValue = netWorth - immobilizedValue
  const immobilizedPct = netWorth > 0 ? (immobilizedValue / netWorth) * 100 : 0
  const liquidPct      = netWorth > 0 ? (liquidValue / netWorth) * 100 : 0

  // ── Portfolio summary (consolidated/global view) ───
  const portfolioMetrics = useMemo(() => {
    const usd = settings.usdToBrl
    const eur = eurRate
    const toBrl = (i: typeof investments[number], price: number) =>
      convert(i.quantity * price, i.currency as 'BRL' | 'USD' | 'EUR', 'BRL', usd, eur)
    const liquid     = investments.filter(i => i.location !== 'physical-re')
    const totalValue = liquid.reduce((s, i) => s + toBrl(i, i.currentPrice), 0)
    const totalCost  = liquid.reduce((s, i) => s + toBrl(i, i.avgCost),      0)
    const totalGain  = totalValue - totalCost
    const gainPct    = totalCost > 0 ? (totalGain / totalCost) * 100 : 0
    // Offshore % = offshore / all-liquid (same formula as Wealth tab)
    const offshoreValue  = investments.filter(i => i.location === 'offshore')
      .reduce((s, i) => s + toBrl(i, i.currentPrice), 0)
    const liquidValueBrl = investments.filter(i => i.location !== 'physical-re')
      .reduce((s, i) => s + toBrl(i, i.currentPrice), 0)
    const offshorePct = liquidValueBrl > 0 ? (offshoreValue / liquidValueBrl) * 100 : 0
    return { totalValue, totalCost, totalGain, gainPct, offshorePct }
  }, [investments, settings.usdToBrl, eurRate])

  // Currency converter used by chart breakdowns
  const portfolioToBrl = (i: typeof investments[number], price: number) =>
    convert(i.quantity * price, i.currency as 'BRL' | 'USD' | 'EUR', 'BRL', settings.usdToBrl, eurRate)

  // Scope filter for portfolio summary charts
  const scopedLiquid = useMemo(() => {
    return investments.filter(i => {
      if (i.location === 'physical-re') return false
      if (portfolioScope === 'local')         return i.location === 'onshore'
      if (portfolioScope === 'international') return i.location === 'offshore'
      return true
    })
  }, [investments, portfolioScope])

  // FX exposure (liquid only, scoped)
  const fxExposure = useMemo(() => {
    const m = new Map<string, number>()
    scopedLiquid.forEach(i => {
      const v = portfolioToBrl(i, i.currentPrice)
      if (v <= 0) return
      m.set(i.currency, (m.get(i.currency) ?? 0) + v)
    })
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }))
  }, [scopedLiquid, settings.usdToBrl, eurRate])

  // Allocation by asset class (liquid only, scoped) — canonical order
  const allocationByClass = useMemo(() => {
    const m = new Map<string, number>()
    scopedLiquid.forEach(i => {
      const v = portfolioToBrl(i, i.currentPrice)
      if (v <= 0) return
      m.set(i.assetClass, (m.get(i.assetClass) ?? 0) + v)
    })
    const orderIndex = new Map<string, number>()
    let idx = 0
    LOCAL_CLASSES.forEach(c => { if (!orderIndex.has(c)) orderIndex.set(c, idx++) })
    INTL_CLASSES.forEach(c => { if (!orderIndex.has(c)) orderIndex.set(c, idx++) })
    const palette = ['#ff7a00', '#3b82f6', '#00d4ff', '#f59e0b', '#00ff88', '#8b5cf6',
                     '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#10b981']
    return Array.from(m.entries())
      .sort((a, b) => {
        const ia = orderIndex.get(canonicalLocalClass(a[0])) ?? orderIndex.get(canonicalIntlClass(a[0])) ?? Infinity
        const ib = orderIndex.get(canonicalLocalClass(b[0])) ?? orderIndex.get(canonicalIntlClass(b[0])) ?? Infinity
        if (ia !== ib) return ia - ib
        return b[1] - a[1]
      })
      .map(([name, value], i) => ({ name, value, fill: palette[i % palette.length] }))
  }, [scopedLiquid, settings.usdToBrl, eurRate])

  // ── Bar chart ─────────────────────────────
  const cashflowChart = useMemo(() => {
    if (periodMode === 'monthly') {
      // current selected month only — break down by week
      const weeks = [
        { label: 'Sem 1', start: 1,  end: 7  },
        { label: 'Sem 2', start: 8,  end: 14 },
        { label: 'Sem 3', start: 15, end: 21 },
        { label: 'Sem 4', start: 22, end: 31 },
      ]
      const prefix = `${selYear}-${String(selMonth).padStart(2, '0')}-`
      const monthTxs = transactions.filter(t => t.date.startsWith(prefix))
      return weeks.map(w => {
        const txs = monthTxs.filter(t => {
          const day = parseInt(t.date.split('-')[2])
          return day >= w.start && day <= w.end
        })
        return {
          month:    w.label,
          income:   txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
          expenses: txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
          current:  false,
        }
      })
    }
    if (periodMode === 'ytd') {
      return Array.from({ length: todayMonth }, (_, i) => {
        const m = i + 1
        const label = monthName(m).slice(0, 3)
        const txs = transactions.filter(t => {
          const [ty, tm] = t.date.split('-')
          return parseInt(ty) === todayYear && parseInt(tm) === m
        })
        return {
          month: label,
          income:   txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
          expenses: txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
          current: false,
        }
      })
    }
    // yearly — all 12 months
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const label = monthName(m).slice(0, 3)
      const txs = transactions.filter(t => {
        const [ty, tm] = t.date.split('-')
        return parseInt(ty) === selYear && parseInt(tm) === m
      })
      return {
        month: label,
        income:   txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
        expenses: txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
        current: false,
      }
    })
  }, [transactions, periodMode, selMonth, selYear, todayMonth, todayYear])

  // ── Donut transactions follow the main period selector ──
  const donutTx = periodTx

  // ── Category breakdown (uses donut period, always distinct palette colors) ──
  const expByCategory = useMemo(() => {
    const map = new Map<string, number>()
    donutTx.filter(t => t.type === 'expense').forEach(t => {
      map.set(t.category, (map.get(t.category) ?? 0) + txToBRL(t))
    })
    return Array.from(map.entries())
      .map(([id, amount]) => {
        const cat = allCategories.find(c => c.id === id)
        return { id, name: cat?.name ?? id, icon: cat?.icon ?? '📦', amount }
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
      .map((item, i) => ({ ...item, color: CHART_PALETTE[i % CHART_PALETTE.length] }))
  }, [donutTx, allCategories, settings.usdToBrl, settings.eurToBrl])

  const incByCategory = useMemo(() => {
    const map = new Map<string, number>()
    donutTx.filter(t => t.type === 'income').forEach(t => {
      map.set(t.category, (map.get(t.category) ?? 0) + txToBRL(t))
    })
    return Array.from(map.entries())
      .map(([id, amount]) => {
        const cat = allCategories.find(c => c.id === id)
        return { id, name: cat?.name ?? id, icon: cat?.icon ?? '📦', amount }
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
      .map((item, i) => ({ ...item, color: CHART_PALETTE[i % CHART_PALETTE.length] }))
  }, [donutTx, allCategories, settings.usdToBrl, settings.eurToBrl])

  // ── Period insight metrics ────────────────
  const periodDays = useMemo(() => {
    if (periodMode === 'monthly') {
      // If looking at the current month, only count elapsed days
      if (selYear === todayYear && selMonth === todayMonth) return new Date().getDate()
      return new Date(selYear, selMonth, 0).getDate()
    }
    if (periodMode === 'ytd') {
      const start = new Date(todayYear, 0, 1)
      return Math.ceil((Date.now() - start.getTime()) / 86400000) + 1
    }
    return selYear % 4 === 0 ? 366 : 365
  }, [periodMode, selMonth, selYear, todayMonth, todayYear])

  const avgDailySpend = periodDays > 0 ? expenses / periodDays : 0

  const biggestExpense = useMemo(() =>
    periodTx.filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount)[0] ?? null,
    [periodTx])

  const topIncomeSource = useMemo(() => {
    const map = new Map<string, number>()
    periodTx.filter(t => t.type === 'income').forEach(t =>
      map.set(t.category, (map.get(t.category) ?? 0) + t.amount))
    if (!map.size) return null
    const [id, amount] = [...map.entries()].sort((a, b) => b[1] - a[1])[0]
    const cat = allCategories.find(c => c.id === id)
    return { name: cat?.name ?? id, icon: cat?.icon ?? '💰', amount }
  }, [periodTx, allCategories])

  const monthlyAvgExpenses = useMemo(() => {
    if (periodMode === 'monthly') return expensesExInvest
    if (periodMode === 'ytd')    return expensesExInvest / Math.max(todayMonth, 1)
    return expensesExInvest / 12
  }, [periodMode, expensesExInvest, todayMonth])

  const reserveCoverage = monthlyAvgExpenses > 0 ? liquidValue / monthlyAvgExpenses : 0

  // ── Financial health score (0–100) ────────
  const healthScore = useMemo(() => {
    // 1. Savings rate: up to 30 pts (target = settings.savingsRateGoal, default 30%)
    const srGoal  = settings.savingsRateGoal ?? 30
    const srPts   = Math.min(30, (savingsRate / srGoal) * 30)
    // 2. Emergency fund coverage: up to 25 pts (target = 6 months)
    const efPts   = Math.min(25, (reserveCoverage / 6) * 25)
    // 3. Positive cash flow: 20 pts if positive, 0 if negative
    const cfPts   = netFlow > 0 ? 20 : Math.max(0, 20 + (netFlow / (monthlyAvgExpenses || 1)) * 20)
    // 4. Income vs goal: up to 15 pts
    const incGoal = settings.monthlyIncomeGoal ?? 30000
    const incBase = periodMode === 'monthly' ? income : periodMode === 'ytd' ? income / Math.max(todayMonth, 1) : income / 12
    const incPts  = Math.min(15, (incBase / incGoal) * 15)
    // 5. Portfolio diversification: up to 10 pts
    const offPct  = netWorth > 0 ? offshoreValue / netWorth : 0
    const divPts  = offPct >= 0.10 ? 10 : offPct >= 0.05 ? 5 : 0
    return Math.round(Math.min(100, Math.max(0, srPts + efPts + cfPts + incPts + divPts)))
  }, [savingsRate, settings.savingsRateGoal, reserveCoverage, netFlow, monthlyAvgExpenses,
      income, settings.monthlyIncomeGoal, periodMode, todayMonth, offshoreValue, netWorth])

  const healthLabel = healthScore >= 81 ? 'Excelente' : healthScore >= 61 ? 'Bom' : healthScore >= 41 ? 'Regular' : 'Crítico'
  const healthColor = healthScore >= 81 ? '#00ff88' : healthScore >= 61 ? '#3b82f6' : healthScore >= 41 ? '#f59e0b' : '#ff4466'

  // ── Goals progress ────────────────────────
  const activeGoals = useMemo(() => goals.filter(g => !g.isCompleted), [goals])
  const totalGoalTarget  = useMemo(() => activeGoals.reduce((s, g) => s + g.targetAmount, 0), [activeGoals])
  const totalGoalSaved   = useMemo(() => activeGoals.reduce((s, g) => s + g.currentAmount, 0), [activeGoals])
  const totalMonthlyCtrib= useMemo(() => activeGoals.reduce((s, g) => s + g.monthlyContribution, 0), [activeGoals])
  const goalPct          = totalGoalTarget > 0 ? (totalGoalSaved / totalGoalTarget) * 100 : 0
  const goalYearlyProj   = totalMonthlyCtrib * 12
  const goalsSecondary   = totalGoalTarget > 0
    ? `${goalPct.toFixed(1)}% de ${formatBRL(totalGoalTarget, true)} · +${formatBRL(goalYearlyProj, true)}/ano`
    : ''

  // ── Recent transactions ───────────────────
  const recentTx = useMemo(() =>
    [...transactions]
      .sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date))
      .slice(0, 6),
    [transactions])

  // ── Upcoming recurring transactions ───────
  const upcomingSubs = useMemo(() => {
    const today = new Date().getDate()
    return subscriptions
      .filter(s => s.isActive)
      .map(s => {
        let daysUntil = s.billingDay - today
        if (daysUntil < 0) daysUntil += 30
        return { ...s, daysUntil }
      })
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 5)
  }, [subscriptions])

  // ── Chart title ───────────────────────────
  const chartTitle =
    periodMode === 'monthly' ? `Receitas vs Despesas — ${monthName(selMonth)} ${selYear}` :
    periodMode === 'ytd'     ? `Receitas vs Despesas — Jan a ${monthName(todayMonth)} ${todayYear}` :
                               `Receitas vs Despesas — ${selYear}`

  return (
    <div className="min-h-screen animate-fade-in">
      <PageHeader
        title={<>Painel · <span style={{ color: '#FF7900' }}>{settings.name}</span></>}
        subtitle="Visão consolidada do seu patrimônio, receitas, despesas e metas"
        actions={<div />}
      />

      <div className="p-4 sm:p-6 space-y-6">

        {/* ── Period selector ── */}
        <PeriodSelector
          mode={periodMode}       setMode={setPeriodMode}
          selMonth={selMonth}     setSelMonth={setSelMonth}
          selYear={selYear}       setSelYear={setSelYear}
          todayMonth={todayMonth} todayYear={todayYear}
        />

        {/* ── Linha 1: Patrimônio + Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 sm:gap-4">
          {/* Patrimônio card — spans 2 cols */}
          <div className="col-span-2 card p-5 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute inset-0 opacity-5 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 80% 50%, #ff7a00, transparent 60%)' }} />
            <div>
              <p className="text-xs text-[#8888aa] font-medium uppercase tracking-wider mb-1">Patrimônio Total</p>
              <p className="text-4xl font-bold text-[#ff7a00] text-glow-orange tracking-tight">
                {formatBRL(netWorth, true)}
              </p>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <span className="text-xs text-[#8888aa]">
                  Nacional: <span className="text-[#00ff88] font-medium">{formatBRL(onshoreValue, true)}</span>
                </span>
                <span className="text-xs text-[#8888aa]">
                  Internacional: <span className="text-[#8b5cf6] font-medium">{formatBRL(offshoreValue, true)}</span>
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                <span className="text-xs text-[#8888aa]">
                  Líquido: <span className="text-[#00d4ff] font-medium">{formatBRL(liquidValue, true)}</span>
                  <span className="text-[#55556a] ml-1">({liquidPct.toFixed(1)}%)</span>
                </span>
                <span className="text-xs text-[#8888aa]">
                  Imobilizado: <span className="text-[#f59e0b] font-medium">{formatBRL(immobilizedValue, true)}</span>
                  <span className="text-[#55556a] ml-1">({immobilizedPct.toFixed(1)}%)</span>
                </span>
              </div>
            </div>
            <div className="mt-2 -mx-1">
              <NetWorthSparkline value={netWorth} />
            </div>
          </div>

          <StatCard
            title={`Receitas ${kpiLabel}`}
            value={formatBRL(cleanIncome, true)}
            icon={<TrendingUp className="w-4 h-4" />}
            color="green"
            secondary={kpiSecondary(cleanIncome)}
          />
          <StatCard
            title={`Despesas ${kpiLabel}`}
            value={formatBRL(nonTaxExpenses, true)}
            icon={<TrendingDown className="w-4 h-4" />}
            color="red"
            secondary={kpiSecondary(nonTaxExpenses)}
          />
          <StatCard
            title={`Impostos ${kpiLabel}`}
            value={formatBRL(taxExpenses, true)}
            icon={<TrendingDown className="w-4 h-4" />}
            color="orange"
            secondary={kpiSecondary(taxExpenses)}
          />
          <StatCard
            title={`Investimentos ${kpiLabel}`}
            value={formatBRL(netInvestment, true)}
            icon={<Wallet className="w-4 h-4" />}
            color="cyan"
            secondary={kpiSecondary(netInvestment)}
          />
          <StatCard
            title={`Saldo ${kpiLabel}`}
            value={formatBRL(netFlow, true)}
            icon={<Wallet className="w-4 h-4" />}
            color={netFlow >= 0 ? 'green' : 'red'}
            subtitle={`${savingsRate.toFixed(1)}% poupado`}
            secondary={kpiSecondary(netFlow)}
          />
        </div>

        {/* ── Linha 1b: Health score + Goals + Reserve ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Financial health score */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs text-[#8888aa] font-medium uppercase tracking-wider">Saúde Financeira</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: healthColor + '18', border: `1px solid ${healthColor}33` }}>
                <Activity className="w-4 h-4" style={{ color: healthColor }} />
              </div>
            </div>
            <div className="flex items-end gap-3 mb-2">
              <p className="text-3xl font-bold" style={{ color: healthColor }}>{healthScore}</p>
              <p className="text-sm font-medium mb-0.5" style={{ color: healthColor }}>{healthLabel}</p>
            </div>
            {/* Score bar */}
            <div className="h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${healthScore}%`, background: healthColor }} />
            </div>
            <div className="flex justify-between text-[10px] text-[#55556a] mt-1.5">
              <span>Crítico</span><span>Regular</span><span>Bom</span><span>Excelente</span>
            </div>
          </div>

          {/* Goals progress */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs text-[#8888aa] font-medium uppercase tracking-wider">Metas Ativas</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#8b5cf6]/10 border border-[#8b5cf6]/20">
                <TargetIcon className="w-4 h-4 text-[#8b5cf6]" />
              </div>
            </div>
            {totalGoalTarget === 0 ? (
              <p className="text-sm text-[#55556a]">Nenhuma meta cadastrada</p>
            ) : (
              <>
                <p className="text-2xl font-bold text-[#8b5cf6] tracking-tight">{formatBRL(totalGoalSaved, true)}</p>
                <div className="mt-2 h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
                  <div className="h-full bg-[#8b5cf6] rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, goalPct)}%` }} />
                </div>
                <p className="text-[11px] text-[#55556a] mt-1.5 border-t border-[#1e1e2e] pt-1.5">{goalsSecondary}</p>
              </>
            )}
          </div>

          {/* Reserve coverage */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs text-[#8888aa] font-medium uppercase tracking-wider">Cobertura de Reserva</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#f59e0b]/10 border border-[#f59e0b]/20">
                <span className="text-[#f59e0b] text-sm">🛡</span>
              </div>
            </div>
            <p className="text-2xl font-bold text-[#f59e0b] tracking-tight">
              {reserveCoverage >= 100 ? '99+' : reserveCoverage.toFixed(1)}
              <span className="text-sm font-normal text-[#8888aa] ml-1">meses</span>
            </p>
            <div className="mt-2 h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
              <div className="h-full bg-[#f59e0b] rounded-full"
                style={{ width: `${Math.min(100, (reserveCoverage / 6) * 100)}%` }} />
            </div>
            <p className="text-[11px] text-[#55556a] mt-1.5 border-t border-[#1e1e2e] pt-1.5">
              Meta: 6 meses · {monthlyAvgExpenses > 0 ? formatBRL(monthlyAvgExpenses * 6, true) : '—'}
            </p>
          </div>
        </div>

        {/* ── Bar chart ── */}
        <Card>
          <CardHeader><CardTitle>{chartTitle}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={cashflowChart} barCategoryGap="30%">
                <XAxis
                  dataKey="month"
                  tick={({ x, y, payload, index }: any) => {
                    const isCurrent = cashflowChart[index]?.current
                    return (
                      <text x={x} y={y + 12} textAnchor="middle" fill={isCurrent ? '#00d4ff' : '#55556a'} fontSize={11} fontWeight={isCurrent ? 700 : 400}>
                        {payload.value}
                      </text>
                    )
                  }}
                  axisLine={false} tickLine={false}
                />
                <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fill: '#55556a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar dataKey="income"   name="Receitas" fill="#00ff88" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Despesas" fill="#ff4466" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ── Donut charts: Despesas + Receitas por Categoria ── */}
        {(() => {
          const CategoryList = ({ items, txType }: { items: typeof expByCategory; txType: 'expense' | 'income' }) => {
            const total = items.reduce((s, c) => s + c.amount, 0)
            return (
            <div className="w-full space-y-0.5">
              {items.map(cat => {
                const isOpen = expandedCats.has(cat.id + txType)
                const pct = total > 0 ? (cat.amount / total * 100).toFixed(1) : '0'
                const catTxs = donutTx.filter(t => t.type === txType && t.category === cat.id)
                  .sort((a, b) => b.amount - a.amount)
                return (
                  <div key={cat.id}>
                    <button
                      onClick={() => toggleCat(cat.id + txType)}
                      className="w-full flex items-center justify-between text-xs py-1.5 px-1 rounded-lg hover:bg-[#16161f] transition-colors group"
                    >
                      <span className="flex items-center gap-1.5 text-[#8888aa] group-hover:text-[#e8e8f0]">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                        {cat.icon} {cat.name}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-[#e8e8f0] font-medium">{formatBRL(cat.amount)}</span>
                        <span className="text-[#55556a] font-semibold w-9 text-right flex-shrink-0">{pct}%</span>
                        <ChevronDown className={clsx('w-3 h-3 text-[#55556a] transition-transform flex-shrink-0', isOpen && 'rotate-180')} />
                      </span>
                    </button>
                    {isOpen && (() => {
                      const subGroups = catTxs.reduce((acc, t) => {
                        const key = (t.description || 'Sem descrição').trim().toLowerCase()
                        const display = (t.description || 'Sem descrição').trim()
                        if (!acc[key]) acc[key] = { name: display, total: 0, count: 0, isWanted: false }
                        acc[key].total += txToBRL(t); acc[key].count += 1
                        if (t.isWanted) acc[key].isWanted = true
                        return acc
                      }, {} as Record<string, { name: string; total: number; count: number; isWanted: boolean }>)
                      return (
                        <div className="mb-1 space-y-0.5 border-l border-[#1e1e2e] ml-4 pl-3">
                          {Object.values(subGroups).sort((a, b) => b.total - a.total).map(row => {
                            const rowPct = total > 0 ? (row.total / total * 100).toFixed(1) : '0'
                            return (
                              <div key={row.name} className="flex items-center justify-between text-[11px] py-0.5 px-1">
                                <span className="text-[#55556a] truncate flex items-center gap-1 min-w-0 mr-2">
                                  {row.name}
                                  {row.count > 1 && <span className="bg-[#1e1e2e] rounded px-1 py-0.5 text-[10px] flex-shrink-0">{row.count}×</span>}
                                  {row.isWanted && <span className="bg-[#8b5cf6]/20 text-[#8b5cf6] rounded px-1 py-0.5 text-[10px] flex-shrink-0">desejo</span>}
                                </span>
                                <span className="flex items-center gap-2 flex-shrink-0">
                                  <span className="font-medium" style={{ color: cat.color }}>
                                    {formatBRL(row.total)}
                                  </span>
                                  <span className="text-[#55556a] w-9 text-right">{rowPct}%</span>
                                  <span className="w-3" />
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
              {total > 0 && (
                <div className="flex items-center justify-between text-xs pt-1.5 mt-0.5 border-t border-[#1e1e2e] px-1">
                  <span className="text-[#55556a] font-semibold">Total</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[#e8e8f0] font-semibold">{formatBRL(total)}</span>
                    <span className="text-[#55556a] font-semibold w-9 text-right flex-shrink-0">100%</span>
                    <span className="w-3 flex-shrink-0" />
                  </span>
                </div>
              )}
            </div>
          )}

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Despesas por Categoria */}
              <Card>
                <CardHeader>
                  <CardTitle>Despesas por Categoria</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-3">
                  {expByCategory.length === 0 ? (
                    <p className="text-xs text-[#55556a] py-8">Sem despesas no período selecionado</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={expByCategory} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                            {expByCategory.map(entry => (
                              <Cell key={entry.id} fill={entry.color} stroke="#0a0a0f" strokeWidth={2} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v: any, name: any) => {
                              const total = expByCategory.reduce((s, c) => s + c.amount, 0)
                              const pct = total > 0 ? (Number(v) / total) * 100 : 0
                              return [`${formatBRL(v)} (${pct.toFixed(1)}%)`, name]
                            }}
                            contentStyle={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 12, fontSize: 12, color: '#ffffff' }}
                            itemStyle={{ color: '#ffffff' }} labelStyle={{ color: '#ffffff', fontWeight: 600 }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11, color: '#8888aa' }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <CategoryList items={expByCategory} txType="expense" />
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Receitas por Categoria */}
              <Card>
                <CardHeader>
                  <CardTitle>Receitas por Categoria</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-3">
                  {incByCategory.length === 0 ? (
                    <p className="text-xs text-[#55556a] py-8">Sem receitas no período selecionado</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={incByCategory} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                            {incByCategory.map(entry => (
                              <Cell key={entry.id} fill={entry.color} stroke="#0a0a0f" strokeWidth={2} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v: any, name: any) => {
                              const total = incByCategory.reduce((s, c) => s + c.amount, 0)
                              const pct = total > 0 ? (Number(v) / total) * 100 : 0
                              return [`${formatBRL(v)} (${pct.toFixed(1)}%)`, name]
                            }}
                            contentStyle={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 12, fontSize: 12, color: '#ffffff' }}
                            itemStyle={{ color: '#ffffff' }} labelStyle={{ color: '#ffffff', fontWeight: 600 }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11, color: '#8888aa' }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <CategoryList items={incByCategory} txType="income" />
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )
        })()}

        {/* ── Linha 3: Transações Recentes + Próximas Contas ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Transações Recentes</CardTitle>
                <Link to={pfPath('/cashflow')} className="text-xs text-[#ff7a00] hover:text-[#e06500] flex items-center gap-1">
                  Ver todas <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <div className="divide-y divide-[#1e1e2e]">
              {recentTx.length === 0 && (
                <p className="px-5 py-8 text-center text-[#55556a] text-sm">Nenhuma transação ainda</p>
              )}
              {recentTx.map(t => {
                const cat = allCategories.find(c => c.id === t.category)
                return (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#16161f]/50 transition-colors">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                      style={{ background: (cat?.color ?? '#55556a') + '18' }}>
                      {cat?.icon ?? '📦'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#e8e8f0] truncate">{t.description}</p>
                      <p className="text-xs text-[#55556a]">{cat?.name ?? t.category} · {formatDate(t.date)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={clsx('text-sm font-semibold', t.type === 'income' ? 'text-[#00ff88]' : 'text-[#ff4466]')}>
                        {t.type === 'income' ? '+' : '-'}{formatBRL(t.amount)}
                      </p>
                      <p className="text-[10px] text-[#55556a]">{t.account}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recorrências</CardTitle>
                <Link to={pfPath('/cashflow')} className="flex items-center gap-1 text-xs text-[#55556a] hover:text-[#ff7a00] transition-colors">
                  <Clock className="w-3.5 h-3.5" /> Gerenciar
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingSubs.length === 0 && (
                <p className="text-xs text-[#55556a]">Nenhuma recorrência cadastrada</p>
              )}
              {upcomingSubs.map(sub => {
                const isIncome = sub.type === 'income'
                const amountBRL = sub.currency === 'USD' ? sub.amount * settings.usdToBrl : sub.amount
                return (
                  <div key={sub.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={clsx('w-2 h-2 rounded-full flex-shrink-0',
                        isIncome    ? 'bg-[#00ff88]'
                        : sub.daysUntil <= 3 ? 'bg-[#ff4466]'
                        : sub.daysUntil <= 7 ? 'bg-[#f59e0b]'
                        : 'bg-[#ff7a00]')} />
                      <div>
                        <p className="text-xs font-medium text-[#e8e8f0]">{sub.name}</p>
                        <p className="text-[10px] text-[#55556a]">
                          Dia {sub.billingDay} · {sub.daysUntil === 0 ? 'Hoje!' : `${sub.daysUntil}d`}
                        </p>
                      </div>
                    </div>
                    <span className={clsx('text-xs font-semibold', isIncome ? 'text-[#00ff88]' : 'text-[#ff4466]')}>
                      {isIncome ? '+' : '-'}{formatBRL(amountBRL)}
                    </span>
                  </div>
                )
              })}

              <hr className="neon-divider my-2" />

              <div className="pt-1">
                <p className="text-xs text-[#8888aa] font-medium mb-2">Alocação do Portfólio</p>
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-3.5 h-3.5 text-[#00ff88]" />
                  <span className="text-xs text-[#8888aa] flex-1">Nacional (BRL)</span>
                  <span className="text-xs font-semibold text-[#00ff88]">{netWorth > 0 ? ((onshoreValue / netWorth) * 100).toFixed(0) : 0}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-[#8b5cf6]" />
                  <span className="text-xs text-[#8888aa] flex-1">Internacional (USD)</span>
                  <span className="text-xs font-semibold text-[#8b5cf6]">{netWorth > 0 ? ((offshoreValue / netWorth) * 100).toFixed(0) : 0}%</span>
                </div>
                <div className="mt-2 h-1.5 bg-[#8b5cf6] rounded-full overflow-hidden">
                  <div className="h-full bg-[#00ff88] rounded-full"
                    style={{ width: netWorth > 0 ? `${(onshoreValue / netWorth) * 100}%` : '0%' }} />
                </div>
                <div className="flex justify-between text-[10px] text-[#55556a] mt-1">
                  <span>{formatBRL(onshoreValue, true)}</span>
                  <span>{formatBRL(offshoreValue, true)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Linha 4: Resumo de Investimentos (Global) ── */}
        {investments.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
              <h2 className="text-sm font-semibold text-[#e8e8f0] uppercase tracking-wider">Resumo de Investimentos</h2>
              <Link to={pfPath('/wealth')} className="text-xs text-[#ff7a00] hover:text-[#e06500] flex items-center gap-1">
                Ver Portfólio <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                title="Patrimônio Líquido (Investido)"
                value={formatBRL(portfolioMetrics.totalValue, true)}
                subtitle={`Custo: ${formatBRL(portfolioMetrics.totalCost, true)}`}
                icon={<Wallet className="w-4 h-4" />}
                color="orange"
              />
              <StatCard
                title="Ganho Total"
                value={formatBRL(portfolioMetrics.totalGain, true)}
                delta={portfolioMetrics.gainPct}
                icon={portfolioMetrics.totalGain >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                color={portfolioMetrics.totalGain >= 0 ? 'green' : 'red'}
              />
              <StatCard
                title="Alocação Offshore"
                value={`${portfolioMetrics.offshorePct.toFixed(1)}%`}
                subtitle="Sobre líquido"
                icon={<Globe className="w-4 h-4" />}
                color="purple"
              />
              <StatCard
                title="Imobilizado"
                value={`${immobilizedPct.toFixed(1)}%`}
                subtitle={formatBRL(immobilizedValue, true)}
                icon={<Building2 className="w-4 h-4" />}
                color="cyan"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle>Exposição Por Moeda</CardTitle></CardHeader>
                <CardContent>
                  {fxExposure.length === 0 ? (
                    <div className="h-56 flex items-center justify-center text-xs text-[#55556a]">Sem dados</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={fxExposure} dataKey="value" nameKey="name" cx="50%" cy="50%"
                          innerRadius={55} outerRadius={90} paddingAngle={2}>
                          {fxExposure.map((_, i) => (
                            <Cell key={i} fill={['#ff7a00', '#3b82f6', '#8b5cf6'][i % 3]} stroke="#0a0a0f" strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 12, fontSize: 12, color: '#ffffff' }}
                          itemStyle={{ color: '#ffffff' }} labelStyle={{ color: '#ffffff', fontWeight: 600 }}
                          formatter={(v: number, name: string) => {
                            const total = fxExposure.reduce((s, d) => s + d.value, 0)
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
                  {allocationByClass.length === 0 ? (
                    <div className="h-56 flex items-center justify-center text-xs text-[#55556a]">Sem dados</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={allocationByClass} dataKey="value" nameKey="name" cx="50%" cy="50%"
                          innerRadius={55} outerRadius={90} paddingAngle={2}>
                          {allocationByClass.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} stroke="#0a0a0f" strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 12, fontSize: 12, color: '#ffffff' }}
                          itemStyle={{ color: '#ffffff' }} labelStyle={{ color: '#ffffff', fontWeight: 600 }}
                          formatter={(v: number, name: string) => {
                            const total = allocationByClass.reduce((s, d) => s + d.value, 0)
                            const pct = total > 0 ? (v / total) * 100 : 0
                            return [`${formatBRL(v)} (${pct.toFixed(1)}%)`, name]
                          }} />
                        <Legend wrapperStyle={{ fontSize: 11, color: '#8888aa' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}

      </div>

      <AddTransactionModal open={activeModal === 'add-transaction'} onClose={() => setModal(null)} />
    </div>
  )
}
