// ─────────────────────────────────────────────
//  Luxor V2 — Receitas e Despesas
//  Hero saldo do mês + attention strip + 4 KPIs +
//  bento grid (income vs expense bars, top
//  categorias, aportes vs resgates, daily burn,
//  top movers, coming up) + transactions table.
//  Wired to the real Zustand store.
// ─────────────────────────────────────────────
import React, { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownUp, ArrowRight, ArrowUpRight, CalendarClock, ChevronDown,
  ChevronLeft, ChevronRight, Copy, CreditCard, Download, Filter, List,
  PiggyBank, Plus, Receipt, RefreshCw, Repeat, Search, Tag, TrendingUp,
  Upload, Building2,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatBRL, monthName, formatDate } from '../lib/formatters'
import { convert } from '../lib/suitability'
import { useAllCategories } from '../lib/useCategories'
import { findAllDuplicateGroups } from '../lib/duplicateCheck'
import {
  AttentionChip, ExpandableCard, FabMenu, KpiCard, PeriodTabs, useReveal, V2PageHeader,
} from '../components/v2/V2Primitives'
import { AddTransactionModal } from '../components/modals/AddTransactionModal'
import { DeduplicateModal } from '../components/modals/DeduplicateModal'
import { RecurringModal } from '../components/modals/RecurringModal'
import { pfPath } from '../constants'

type PeriodMode = 'monthly' | 'ytd' | 'yearly'

export default function CashflowV2() {
  const { transactions, subscriptions, settings, updateTransaction, deleteTransaction, updateSubscription, deleteSubscription } = useStore()
  const allCategories = useAllCategories()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  const today = new Date()
  const [selMonth, setSelMonth] = useState(today.getMonth() + 1)
  const [selYear, setSelYear]   = useState(today.getFullYear())
  const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly')
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [filterCat, setFilterCat] = useState<string>('all')
  const [showAddTx, setShowAddTx] = useState(false)
  const [editingTx, setEditingTx] = useState<import('../lib/types').Transaction | null>(null)
  const [showDedup, setShowDedup] = useState(false)
  const [showAllTx, setShowAllTx] = useState(false)
  const [showAddRec, setShowAddRec] = useState(false)
  const [editingRec, setEditingRec] = useState<import('../lib/types').RecurringTransaction | null>(null)
  // ── Bulk selection for the transactions table ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCategory, setBulkCategory] = useState<string>('')
  const [bulkRename, setBulkRename] = useState<string>('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false)
  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const clearSelection = () => setSelectedIds(new Set())
  type TxSortKey = 'date' | 'description' | 'category' | 'value'
  const [txSortKey, setTxSortKey] = useState<TxSortKey>('date')
  const [txSortDir, setTxSortDir] = useState<'asc' | 'desc'>('desc')
  const toggleTxSort = (k: TxSortKey) => {
    if (txSortKey === k) setTxSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setTxSortKey(k); setTxSortDir(k === 'description' || k === 'category' ? 'asc' : 'desc') }
  }
  const txSortIcon = (k: TxSortKey) => txSortKey !== k ? '' : (txSortDir === 'asc' ? ' ▲' : ' ▼')

  const eurToBrl = settings.eurToBrl ?? 5.90
  const usdToBrl = settings.usdToBrl
  const todayMonth = today.getMonth() + 1
  const todayYear = today.getFullYear()

  const txBrl = (t: typeof transactions[number]) =>
    convert(t.amount, (t.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR', 'BRL', usdToBrl, eurToBrl)

  // ── Period transactions ────────────────────────
  const periodTx = useMemo(() => {
    if (periodMode === 'monthly') {
      const prefix = `${selYear}-${String(selMonth).padStart(2, '0')}-`
      return transactions.filter(t => t.date.startsWith(prefix))
    }
    if (periodMode === 'ytd') {
      const jan1 = `${todayYear}-01-01`
      const todayStr = today.toISOString().split('T')[0]
      return transactions.filter(t => t.date >= jan1 && t.date <= todayStr)
    }
    return transactions.filter(t => t.date.startsWith(`${selYear}-`))
  }, [transactions, periodMode, selMonth, selYear, todayMonth, todayYear])

  const lastPeriodTx = useMemo(() => {
    if (periodMode === 'monthly') {
      const m = selMonth === 1 ? 12 : selMonth - 1
      const y = selMonth === 1 ? selYear - 1 : selYear
      const prefix = `${y}-${String(m).padStart(2, '0')}-`
      return transactions.filter(t => t.date.startsWith(prefix))
    }
    if (periodMode === 'ytd') {
      const lastYearJan = `${todayYear - 1}-01-01`
      const lastYearDay = `${todayYear - 1}-${String(todayMonth).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      return transactions.filter(t => t.date >= lastYearJan && t.date <= lastYearDay)
    }
    return transactions.filter(t => t.date.startsWith(`${selYear - 1}-`))
  }, [transactions, periodMode, selMonth, selYear, todayMonth, todayYear])

  const income     = useMemo(() => periodTx.filter(t => t.type === 'income').reduce((a, t) => a + txBrl(t), 0), [periodTx])
  const expenses   = useMemo(() => periodTx.filter(t => t.type === 'expense').reduce((a, t) => a + txBrl(t), 0), [periodTx])
  const aportes    = useMemo(() => periodTx.filter(t => t.type === 'expense' && t.category === 'investimento').reduce((a, t) => a + txBrl(t), 0), [periodTx])
  const resgates   = useMemo(() => periodTx.filter(t => t.type === 'income' && t.category === 'investimento').reduce((a, t) => a + txBrl(t), 0), [periodTx])
  const netFlow    = income - expenses
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0

  const lastIncome = useMemo(() => lastPeriodTx.filter(t => t.type === 'income').reduce((a, t) => a + txBrl(t), 0), [lastPeriodTx])
  const lastExpenses = useMemo(() => lastPeriodTx.filter(t => t.type === 'expense').reduce((a, t) => a + txBrl(t), 0), [lastPeriodTx])
  const lastNet = lastIncome - lastExpenses

  // ── Period days for daily burn ─────────────────
  const periodDays = useMemo(() => {
    if (periodMode === 'monthly') {
      if (selYear === todayYear && selMonth === todayMonth) return today.getDate()
      return new Date(selYear, selMonth, 0).getDate()
    }
    if (periodMode === 'ytd') {
      const start = new Date(todayYear, 0, 1)
      return Math.ceil((Date.now() - start.getTime()) / 86400000) + 1
    }
    return selYear % 4 === 0 ? 366 : 365
  }, [periodMode, selMonth, selYear, todayMonth, todayYear, today])

  const dailyExpense = periodDays > 0 ? expenses / periodDays : 0
  const dailyIncome  = periodDays > 0 ? income   / periodDays : 0

  // Today's burn so far (only for current month)
  const todayBurn = useMemo(() => {
    if (periodMode !== 'monthly' || selYear !== todayYear || selMonth !== todayMonth) return 0
    const todayStr = today.toISOString().split('T')[0]
    return transactions.filter(t => t.date === todayStr && t.type === 'expense').reduce((a, t) => a + txBrl(t), 0)
  }, [transactions, periodMode, selMonth, selYear, todayMonth, todayYear, today])

  // ── Daily flow for sparkline ───────────────────
  const dailyFlow = useMemo(() => {
    if (periodMode !== 'monthly') return []
    const prefix = `${selYear}-${String(selMonth).padStart(2, '0')}-`
    const monthTxs = transactions.filter(t => t.date.startsWith(prefix))
    const lastDay = new Date(selYear, selMonth, 0).getDate()
    const out: { day: number; net: number; income: number; expense: number }[] = []
    for (let d = 1; d <= lastDay; d++) {
      const dStr = `${prefix}${String(d).padStart(2, '0')}`
      const dayTxs = monthTxs.filter(t => t.date === dStr)
      const inc = dayTxs.filter(t => t.type === 'income').reduce((a, t) => a + txBrl(t), 0)
      const exp = dayTxs.filter(t => t.type === 'expense').reduce((a, t) => a + txBrl(t), 0)
      out.push({ day: d, net: inc - exp, income: inc, expense: exp })
    }
    return out
  }, [transactions, periodMode, selMonth, selYear])

  // ── Weekly buckets (for income/expense + aportes) ──
  const weekly = useMemo(() => {
    if (periodMode === 'monthly') {
      const weeks = [
        { label: 'Sem 1', start: 1, end: 7 },
        { label: 'Sem 2', start: 8, end: 14 },
        { label: 'Sem 3', start: 15, end: 21 },
        { label: 'Sem 4+', start: 22, end: 31 },
      ]
      const prefix = `${selYear}-${String(selMonth).padStart(2, '0')}-`
      const monthTxs = transactions.filter(t => t.date.startsWith(prefix))
      return weeks.map(w => {
        const txs = monthTxs.filter(t => {
          const d = parseInt(t.date.split('-')[2])
          return d >= w.start && d <= w.end
        })
        return {
          label: w.label,
          income: txs.filter(t => t.type === 'income').reduce((a, t) => a + txBrl(t), 0),
          expense: txs.filter(t => t.type === 'expense').reduce((a, t) => a + txBrl(t), 0),
          aportes: txs.filter(t => t.type === 'expense' && t.category === 'investimento').reduce((a, t) => a + txBrl(t), 0),
          resgates: txs.filter(t => t.type === 'income' && t.category === 'investimento').reduce((a, t) => a + txBrl(t), 0),
        }
      })
    }
    // YTD/yearly: aggregate by month
    const months = periodMode === 'ytd' ? todayMonth : 12
    return Array.from({ length: months }, (_, i) => {
      const m = i + 1
      const prefix = `${periodMode === 'ytd' ? todayYear : selYear}-${String(m).padStart(2, '0')}-`
      const txs = transactions.filter(t => t.date.startsWith(prefix))
      return {
        label: monthName(m).slice(0, 3),
        income: txs.filter(t => t.type === 'income').reduce((a, t) => a + txBrl(t), 0),
        expense: txs.filter(t => t.type === 'expense').reduce((a, t) => a + txBrl(t), 0),
        aportes: txs.filter(t => t.type === 'expense' && t.category === 'investimento').reduce((a, t) => a + txBrl(t), 0),
        resgates: txs.filter(t => t.type === 'income' && t.category === 'investimento').reduce((a, t) => a + txBrl(t), 0),
      }
    })
  }, [transactions, periodMode, selMonth, selYear, todayMonth, todayYear])

  // ── All categories (sorted) ─────────────────────
  const allCategoryRows = useMemo(() => {
    const map = new Map<string, number>()
    periodTx.filter(t => t.type === 'expense' && t.category !== 'investimento').forEach(t => {
      map.set(t.category, (map.get(t.category) ?? 0) + txBrl(t))
    })
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0)
    const palette = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#ff4466', '#00d4ff', '#00ff88', '#ff7a00']
    const rows = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, amount], i) => {
        const cat = allCategories.find(c => c.id === id)
        return {
          id,
          name: cat?.name ?? id,
          icon: cat?.icon ?? '📦',
          amount,
          pct: total > 0 ? (amount / total) * 100 : 0,
          color: palette[i % palette.length],
        }
      })
    return { total, rows }
  }, [periodTx, allCategories])

  // ── Top 5 categories (summary) ──────────────────
  const topCategories = useMemo(() => {
    const top5 = allCategoryRows.rows.slice(0, 5)
    const others = allCategoryRows.total - top5.reduce((a, r) => a + r.amount, 0)
    return { total: allCategoryRows.total, rows: top5, others }
  }, [allCategoryRows])

  // ── All inflows / outflows (full lists for expand modal) ──
  const allInflows = useMemo(() =>
    [...periodTx].filter(t => t.type === 'income').sort((a, b) => txBrl(b) - txBrl(a)),
    [periodTx])
  const allOutflows = useMemo(() =>
    [...periodTx].filter(t => t.type === 'expense').sort((a, b) => txBrl(b) - txBrl(a)),
    [periodTx])
  const topInflows = useMemo(() => allInflows.slice(0, 3), [allInflows])
  const topOutflows = useMemo(() => allOutflows.slice(0, 3), [allOutflows])

  // ── Coming up: full 60-day horizon for expand, 7d for summary ──
  const allComingUp = useMemo(() => {
    const items: { date: Date; label: string; sub: string; amount: number; type: 'income' | 'expense' }[] = []
    const today0 = new Date(); today0.setHours(0, 0, 0, 0)
    const horizon = new Date(today0); horizon.setDate(horizon.getDate() + 60)
    subscriptions.filter(s => s.isActive).forEach(s => {
      let d = new Date(today0.getFullYear(), today0.getMonth(), Math.min(s.billingDay, 28))
      if (d < today0) d.setMonth(d.getMonth() + 1)
      while (d <= horizon) {
        const v = convert(s.amount, s.currency, 'BRL', usdToBrl, eurToBrl)
        items.push({ date: new Date(d), label: s.name, sub: 'Recorrente', amount: v, type: s.type })
        d.setMonth(d.getMonth() + 1)
      }
    })
    return items.sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [subscriptions, usdToBrl, eurToBrl])

  const comingUp = useMemo(() => {
    const today0 = new Date(); today0.setHours(0, 0, 0, 0)
    const horizon = new Date(today0); horizon.setDate(horizon.getDate() + 7)
    return allComingUp.filter(c => c.date <= horizon).slice(0, 5)
  }, [allComingUp])

  // ── Duplicate groups ───────────────────────────
  const dupGroups = useMemo(() => findAllDuplicateGroups(transactions), [transactions])

  // ── Filtered transactions for the table ────────
  const filtered = useMemo(() => {
    let out = periodTx
    if (filterType !== 'all') out = out.filter(t => t.type === filterType)
    if (filterCat !== 'all')  out = out.filter(t => t.category === filterCat)
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(t => t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
    }
    const dir = txSortDir === 'asc' ? 1 : -1
    return [...out].sort((a, b) => {
      switch (txSortKey) {
        case 'description': return dir * a.description.localeCompare(b.description, 'pt-BR')
        case 'category':    return dir * a.category.localeCompare(b.category, 'pt-BR')
        case 'value':       return dir * (txBrl(a) - txBrl(b))
        case 'date':
        default:            return dir * a.date.localeCompare(b.date)
      }
    })
  }, [periodTx, filterType, filterCat, search, txSortKey, txSortDir])

  const visibleRows = showAllTx ? filtered : filtered.slice(0, 10)

  // ── Reveal animations ──────────────────────────
  useReveal(containerRef, [transactions.length, periodMode, selMonth, selYear])

  // ── Period nav ─────────────────────────────────
  const prevMonth = () => {
    if (selMonth === 1) { setSelMonth(12); setSelYear(selYear - 1) } else setSelMonth(selMonth - 1)
  }
  const nextMonth = () => {
    if (selMonth === 12) { setSelMonth(1); setSelYear(selYear + 1) } else setSelMonth(selMonth + 1)
  }
  const isFutureMonth = selYear > todayYear || (selYear === todayYear && selMonth >= todayMonth)

  // ── Hero scale for daily-flow sparkline ────────
  const dfMax = Math.max(...dailyFlow.map(d => Math.max(d.income, d.expense)), 1)
  const wMax = Math.max(...weekly.flatMap(w => [w.income, w.expense]), 1)

  const periodSubtitle = periodMode === 'monthly'
    ? `${monthName(selMonth)} ${selYear} · ${periodTx.length} lançamentos`
    : periodMode === 'ytd'
    ? `Acumulado ${todayYear} · ${periodTx.length} lançamentos`
    : `Ano ${selYear} · ${periodTx.length} lançamentos`

  const expenseCategories = allCategories.filter(c => c.type === 'expense' || c.type === 'both')

  return (
    <div className="v2-root min-w-0" ref={containerRef}>
      <V2PageHeader
        title="Receitas e Despesas"
        subtitle={periodSubtitle}
        right={
          <>
            {periodMode === 'monthly' && (
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0f1018] border border-[#1e1e30]">
                <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-[#161729] text-[#8888aa]"><ChevronLeft className="w-3.5 h-3.5"/></button>
                <span className="v2-period-tab active px-3">{monthName(selMonth).slice(0, 3)} {selYear}</span>
                <button onClick={nextMonth} disabled={isFutureMonth} className="p-1 rounded-lg hover:bg-[#161729] text-[#8888aa] disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5"/></button>
              </div>
            )}
            <PeriodTabs
              value={periodMode}
              onChange={setPeriodMode}
              options={[
                { value: 'monthly', label: 'Mensal' },
                { value: 'ytd', label: 'YTD' },
                { value: 'yearly', label: 'Anual' },
              ]}
            />
            <button
              onClick={() => setShowAddTx(true)}
              className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              style={{ background: '#ff7a00', color: '#0a0a0f' }}
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar lançamento
            </button>
          </>
        }
      />

      <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">

        {/* HERO — Saldo do mês */}
        <section className="v2-card-emph v2-card-emph-green v2-dot-grid-green p-6 sm:p-8 v2-reveal">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex-1 min-w-0">
              <p className="v2-caption">
                Saldo {periodMode === 'monthly' ? `· ${monthName(selMonth)}` : periodMode === 'ytd' ? '· YTD' : `· ${selYear}`}
              </p>
              <div className="flex items-baseline gap-3 mt-1.5 flex-wrap">
                <span
                  className="v2-num text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight"
                  style={{ color: netFlow >= 0 ? '#00ff88' : '#ff4466' }}
                >
                  {netFlow >= 0 ? '+' : ''}{formatBRL(netFlow)}
                </span>
                {lastNet !== 0 && (
                  <span className="v2-pill" style={{
                    background: netFlow - lastNet >= 0 ? 'rgba(0,255,136,.12)' : 'rgba(255,68,102,.12)',
                    color: netFlow - lastNet >= 0 ? '#00ff88' : '#ff4466',
                    border: `1px solid ${netFlow - lastNet >= 0 ? 'rgba(0,255,136,.25)' : 'rgba(255,68,102,.25)'}`,
                  }}>
                    <ArrowUpRight className="w-3 h-3"/>
                    {netFlow - lastNet >= 0 ? '+' : ''}{formatBRL(netFlow - lastNet, true)} vs período anterior
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-center gap-3 text-xs text-[#8888aa] flex-wrap">
                <span className="flex items-center gap-1.5"><PiggyBank className="w-3.5 h-3.5" style={{ color: '#ff7a00' }}/>Taxa de poupança: <span className="v2-num text-white font-semibold">{income > 0 ? `${savingsRate.toFixed(0)}%` : '—'}</span></span>
                <span className="text-[#2a2a3e]">·</span>
                <span className="flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5"/>{periodTx.length} lançamentos</span>
                {periodMode === 'monthly' && periodDays > 0 && (
                  <>
                    <span className="text-[#2a2a3e]">·</span>
                    <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" style={{ color: '#00d4ff' }}/>{formatBRL(dailyExpense, true)}/dia média</span>
                  </>
                )}
              </div>
            </div>

            {/* Daily flow sparkline */}
            {periodMode === 'monthly' && dailyFlow.length > 0 && (
              <div className="lg:w-72 lg:flex-shrink-0">
                <p className="v2-caption mb-2">Fluxo diário · {monthName(selMonth).toLowerCase()}</p>
                <svg viewBox="0 0 280 80" className="w-full h-20" preserveAspectRatio="none">
                  <line x1="0" y1="50" x2="280" y2="50" stroke="#1e1e30" strokeWidth="1" strokeDasharray="2 4"/>
                  {dailyFlow.map((d, i) => {
                    const w = 280 / dailyFlow.length
                    const x = i * w + 1
                    const bw = Math.max(w - 2, 2)
                    if (d.net > 0) {
                      const h = (d.net / dfMax) * 40
                      return <rect key={i} x={x} y={50 - h} width={bw} height={h} fill="#00ff88" opacity={0.85}/>
                    }
                    if (d.net < 0) {
                      const h = (Math.abs(d.net) / dfMax) * 40
                      return <rect key={i} x={x} y={50} width={bw} height={h} fill="#ff4466" opacity={0.7}/>
                    }
                    return null
                  })}
                </svg>
              </div>
            )}
          </div>
        </section>

        {/* ATTENTION STRIP */}
        <section className="space-y-2.5 v2-reveal">
          <p className="v2-caption">Vale sua atenção</p>
          <div className="grid md:grid-cols-3 gap-2.5">
            {comingUp.length > 0 ? (
              <AttentionChip
                icon={CalendarClock}
                tone="red"
                title={`${comingUp.filter(c => c.type === 'expense').length} contas em 7 dias`}
                subtitle={`Total ${formatBRL(comingUp.filter(c => c.type === 'expense').reduce((a, c) => a + c.amount, 0), true)}`}
              />
            ) : (
              <AttentionChip icon={CalendarClock} tone="green" title="Sem contas próximas" subtitle="Nenhum boleto recorrente em 7 dias"/>
            )}
            {topCategories.rows[0] && topCategories.rows[0].pct > 30 ? (
              <AttentionChip
                icon={TrendingUp}
                tone="amber"
                title={`${topCategories.rows[0].name} concentra ${topCategories.rows[0].pct.toFixed(0)}%`}
                subtitle={`${formatBRL(topCategories.rows[0].amount, true)} no período`}
              />
            ) : (
              <AttentionChip icon={TrendingUp} tone="cyan" title="Despesas distribuídas" subtitle="Nenhuma categoria acima de 30% do total"/>
            )}
            {dupGroups.length > 0 ? (
              <AttentionChip
                icon={Copy}
                tone="amber"
                title={`${dupGroups.length} grupos de duplicatas`}
                subtitle="Mesma data + descrição + valor"
                onClick={() => setShowDedup(true)}
              />
            ) : (
              <AttentionChip icon={Copy} tone="green" title="Sem duplicatas" subtitle="Histórico limpo"/>
            )}
          </div>
        </section>

        {/* KPI STRIP */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 v2-reveal">
          <KpiCard
            caption="Receitas"
            value={`+${formatBRL(income, true)}`}
            valueColor="#00ff88"
            secondary={`vs ${formatBRL(lastIncome, true)} período anterior`}
            pillText={lastIncome > 0 ? `${(((income - lastIncome) / lastIncome) * 100).toFixed(0)}%` : '—'}
            pillColor={income >= lastIncome ? 'green' : 'amber'}
          />
          <KpiCard
            caption="Despesas"
            value={`−${formatBRL(expenses, true)}`}
            valueColor="#ff4466"
            secondary={`vs ${formatBRL(lastExpenses, true)} período anterior`}
            pillText={lastExpenses > 0 ? `${(((expenses - lastExpenses) / lastExpenses) * 100).toFixed(0)}%` : '—'}
            pillColor={expenses <= lastExpenses ? 'green' : 'red'}
          />
          <KpiCard
            caption="Aportes"
            value={formatBRL(aportes, true)}
            valueColor="#00d4ff"
            secondary={resgates > 0 ? `Resgates ${formatBRL(resgates, true)}` : 'sem resgates no período'}
            pillText={aportes > 0 ? 'ativo' : 'sem'}
            pillColor={aportes > 0 ? 'cyan' : 'muted'}
          />
          <KpiCard
            caption="Taxa de poupança"
            value={income > 0 ? `${savingsRate.toFixed(0)}%` : '—'}
            secondary={`Meta ${settings.savingsRateGoal ?? 30}%`}
            pillText={savingsRate >= (settings.savingsRateGoal ?? 30) ? 'no alvo' : 'abaixo'}
            pillColor={savingsRate >= (settings.savingsRateGoal ?? 30) ? 'green' : 'amber'}
          />
        </section>

        {/* BENTO GRID */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 v2-reveal">

          {/* Receitas vs Despesas — large */}
          <ExpandableCard
            gridClass="lg:col-span-2"
            title={`Receitas vs Despesas · ${periodMode === 'monthly' ? `${monthName(selMonth)} ${selYear}` : periodMode === 'ytd' ? `YTD ${todayYear}` : selYear}`}
            subtitle={`${weekly.length} ${periodMode === 'monthly' ? 'semanas' : 'meses'} · saldo ${netFlow >= 0 ? '+' : ''}${formatBRL(netFlow, true)}`}
            modalSize="xl"
            detail={
              <div className="overflow-hidden rounded-xl border border-[#1e1e30] divide-y divide-[#1e1e30]">
                <div className="grid grid-cols-[1fr_120px_120px_120px] items-center px-3 py-2 text-[10px] uppercase tracking-wider text-[#55556a]">
                  <span>{periodMode === 'monthly' ? 'Semana' : 'Mês'}</span>
                  <span className="text-right">Receitas</span>
                  <span className="text-right">Despesas</span>
                  <span className="text-right">Net</span>
                </div>
                {weekly.map((w, i) => {
                  const net = w.income - w.expense
                  return (
                    <div key={i} className="grid grid-cols-[1fr_120px_120px_120px] items-center px-3 py-2.5 text-xs v2-row-hover">
                      <span className="text-[#8888aa]">{w.label}</span>
                      <span className="v2-num text-right" style={{ color: '#00ff88' }}>+{formatBRL(w.income, true)}</span>
                      <span className="v2-num text-right" style={{ color: '#ff4466' }}>−{formatBRL(w.expense, true)}</span>
                      <span className="v2-num text-right font-semibold" style={{ color: net >= 0 ? '#00ff88' : '#ff4466' }}>
                        {net >= 0 ? '+' : ''}{formatBRL(net, true)}
                      </span>
                    </div>
                  )
                })}
                <div className="grid grid-cols-[1fr_120px_120px_120px] items-center px-3 py-3 text-xs bg-[#0a0a0f]">
                  <span className="font-semibold">Total</span>
                  <span className="v2-num text-right font-bold" style={{ color: '#00ff88' }}>+{formatBRL(income, true)}</span>
                  <span className="v2-num text-right font-bold" style={{ color: '#ff4466' }}>−{formatBRL(expenses, true)}</span>
                  <span className="v2-num text-right font-bold" style={{ color: netFlow >= 0 ? '#00ff88' : '#ff4466' }}>
                    {netFlow >= 0 ? '+' : ''}{formatBRL(netFlow, true)}
                  </span>
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2 pr-9">
              <div>
                <p className="v2-caption">Receitas vs Despesas</p>
                <p className="text-sm text-[#8888aa] mt-0.5">{periodMode === 'monthly' ? 'Por semana' : 'Por mês'}</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#00ff88' }}/><span className="text-[#8888aa]">Receitas</span></span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#ff4466' }}/><span className="text-[#8888aa]">Despesas</span></span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#8888aa' }}/><span className="text-[#8888aa]">Net</span></span>
              </div>
            </div>
            <svg viewBox="0 0 600 240" className="w-full h-60 mt-3" preserveAspectRatio="none">
              <line x1="0" y1="120" x2="600" y2="120" stroke="#1e1e30" strokeWidth="2"/>
              <line x1="0" y1="40" x2="600" y2="40" stroke="#1e1e30" strokeWidth="1"/>
              <line x1="0" y1="200" x2="600" y2="200" stroke="#1e1e30" strokeWidth="1"/>
              {weekly.map((w, i) => {
                const groupW = 600 / weekly.length
                const cx = i * groupW + groupW / 2
                const incH = wMax > 0 ? (w.income / wMax) * 80 : 0
                const expH = wMax > 0 ? (w.expense / wMax) * 80 : 0
                const net = w.income - w.expense
                const netH = wMax > 0 ? (Math.abs(net) / wMax) * 80 : 0
                return (
                  <g key={i}>
                    <rect x={cx - 36} y={120 - incH} width="22" height={incH} fill="#00ff88" rx="3"/>
                    <rect x={cx - 11} y={120}        width="22" height={expH} fill="#ff4466" rx="3"/>
                    <rect x={cx + 14} y={net >= 0 ? 120 - netH : 120} width="22" height={netH} fill="#8888aa" rx="3" opacity="0.85"/>
                    <text x={cx} y="226" textAnchor="middle" fill="#55556a" fontSize="11" fontFamily="Inter">{w.label}</text>
                  </g>
                )
              })}
            </svg>
            <div className="mt-2 grid grid-cols-3 gap-3 pt-3 border-t border-[#1e1e30]">
              <div><p className="v2-caption">Receitas</p><p className="v2-num text-base font-bold mt-0.5" style={{ color: '#00ff88' }}>+{formatBRL(income, true)}</p></div>
              <div><p className="v2-caption">Despesas</p><p className="v2-num text-base font-bold mt-0.5" style={{ color: '#ff4466' }}>−{formatBRL(expenses, true)}</p></div>
              <div><p className="v2-caption">Saldo líquido</p><p className="v2-num text-base font-bold mt-0.5">{netFlow >= 0 ? '+' : ''}{formatBRL(netFlow, true)}</p></div>
            </div>
          </ExpandableCard>

          {/* Top categorias */}
          <ExpandableCard
            title="Top categorias · todas"
            subtitle={`${allCategoryRows.rows.length} categorias · ${formatBRL(allCategoryRows.total, true)} em despesas`}
            modalSize="lg"
            detail={
              allCategoryRows.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem despesas no período.</p>
              ) : (
                <div className="space-y-3">
                  {allCategoryRows.rows.map(c => (
                    <div key={c.id}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-base">{c.icon}</span>
                          <span className="font-medium truncate">{c.name}</span>
                        </span>
                        <span className="v2-num font-semibold flex-shrink-0">{formatBRL(c.amount, true)} <span className="text-[10px] text-[#55556a] font-normal">· {c.pct.toFixed(1)}%</span></span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#1e1e30] overflow-hidden">
                        <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.min(c.pct, 100)}%`, background: c.color }}/>
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Top categorias · despesas</p>
            <p className="text-sm text-[#8888aa] mt-0.5">{topCategories.rows.length} maiores</p>
            <div className="mt-4 space-y-3">
              {topCategories.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-4">Sem despesas no período.</p>
              ) : topCategories.rows.map(c => (
                <div key={c.id}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-base">{c.icon}</span>
                      <span className="font-medium truncate">{c.name}</span>
                    </span>
                    <span className="v2-num font-semibold flex-shrink-0">{formatBRL(c.amount, true)} <span className="text-[10px] text-[#55556a] font-normal">· {c.pct.toFixed(0)}%</span></span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.min(c.pct, 100)}%`, background: c.color }}/>
                  </div>
                </div>
              ))}
              {topCategories.others > 0 && (
                <div className="pt-2 mt-2 border-t border-[#1e1e30] flex items-center justify-between text-xs">
                  <span className="text-[#8888aa]">Outras categorias</span>
                  <span className="v2-num text-[#8888aa]">{formatBRL(topCategories.others, true)}</span>
                </div>
              )}
            </div>
          </ExpandableCard>

          {/* Aportes vs Resgates */}
          <ExpandableCard
            title="Aportes vs Resgates"
            subtitle={`${formatBRL(aportes, true)} aportados · ${formatBRL(resgates, true)} resgatados no período`}
            modalSize="lg"
            detail={
              <div>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="v2-card p-4">
                    <p className="v2-caption">Aportes</p>
                    <p className="v2-num text-2xl font-bold mt-1" style={{ color: '#00d4ff' }}>{formatBRL(aportes, true)}</p>
                  </div>
                  <div className="v2-card p-4">
                    <p className="v2-caption">Resgates</p>
                    <p className="v2-num text-2xl font-bold mt-1" style={{ color: '#ff7a00' }}>{formatBRL(resgates, true)}</p>
                  </div>
                  <div className="v2-card p-4">
                    <p className="v2-caption">Net</p>
                    <p className="v2-num text-2xl font-bold mt-1" style={{ color: aportes - resgates >= 0 ? '#00ff88' : '#ff4466' }}>
                      {aportes - resgates >= 0 ? '+' : ''}{formatBRL(aportes - resgates, true)}
                    </p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-[#1e1e30] divide-y divide-[#1e1e30]">
                  <div className="grid grid-cols-[1fr_120px_120px_120px] items-center px-3 py-2 text-[10px] uppercase tracking-wider text-[#55556a]">
                    <span>{periodMode === 'monthly' ? 'Semana' : 'Mês'}</span>
                    <span className="text-right">Aportes</span>
                    <span className="text-right">Resgates</span>
                    <span className="text-right">Net</span>
                  </div>
                  {weekly.map((w, i) => (
                    <div key={i} className="grid grid-cols-[1fr_120px_120px_120px] items-center px-3 py-2.5 text-xs v2-row-hover">
                      <span className="text-[#8888aa]">{w.label}</span>
                      <span className="v2-num text-right" style={{ color: '#00d4ff' }}>{formatBRL(w.aportes, true)}</span>
                      <span className="v2-num text-right" style={{ color: '#ff7a00' }}>{formatBRL(w.resgates, true)}</span>
                      <span className="v2-num text-right font-semibold" style={{ color: w.aportes - w.resgates >= 0 ? '#00ff88' : '#ff4466' }}>
                        {w.aportes - w.resgates >= 0 ? '+' : ''}{formatBRL(w.aportes - w.resgates, true)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            }
          >
            <p className="v2-caption pr-9">Aportes vs Resgates</p>
            <p className="text-sm text-[#8888aa] mt-0.5">{periodMode === 'monthly' ? `${monthName(selMonth)} ${selYear}` : ''}</p>
            <svg viewBox="0 0 280 130" className="w-full mt-3" preserveAspectRatio="none">
              <line x1="0" y1="65" x2="280" y2="65" stroke="#1e1e30" strokeWidth="1.5"/>
              {weekly.map((w, i) => {
                const groupW = 280 / weekly.length
                const cx = i * groupW + groupW / 2
                const apMax = Math.max(...weekly.map(x => x.aportes), 1)
                const reMax = Math.max(...weekly.map(x => x.resgates), 1)
                const scale = Math.max(apMax, reMax)
                const apH = scale > 0 ? (w.aportes / scale) * 50 : 0
                const reH = scale > 0 ? (w.resgates / scale) * 50 : 0
                const netH = scale > 0 ? (Math.abs(w.aportes - w.resgates) / scale) * 50 : 0
                return (
                  <g key={i}>
                    <rect x={cx - 24} y={65 - apH} width="14" height={apH} fill="#00d4ff" rx="2"/>
                    <rect x={cx - 7}  y="65"      width="14" height={reH} fill="#ff7a00" rx="2"/>
                    <rect x={cx + 10} y={(w.aportes - w.resgates) >= 0 ? 65 - netH : 65} width="14" height={netH} fill="#8888aa" rx="2"/>
                    <text x={cx} y="125" textAnchor="middle" fill="#55556a" fontSize="9" fontFamily="Inter">{w.label}</text>
                  </g>
                )
              })}
            </svg>
            <div className="mt-3 pt-3 border-t border-[#1e1e30] flex items-center justify-around text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#00d4ff' }}/>
                <span className="text-[#8888aa]">Aportes</span>
                <span className="v2-num font-semibold" style={{ color: '#00d4ff' }}>{formatBRL(aportes, true)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#ff7a00' }}/>
                <span className="text-[#8888aa]">Resgates</span>
                <span className="v2-num font-semibold" style={{ color: '#ff7a00' }}>{formatBRL(resgates, true)}</span>
              </div>
            </div>
          </ExpandableCard>

          {/* Daily burn */}
          <ExpandableCard
            title="Ritmo do mês · detalhes"
            subtitle={`Despesas: ${formatBRL(dailyExpense, true)}/dia · Receitas: ${formatBRL(dailyIncome, true)}/dia`}
            modalSize="lg"
            detail={
              <div>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="v2-card p-4">
                    <p className="v2-caption">Média diária · despesas</p>
                    <p className="v2-num text-2xl font-bold mt-1" style={{ color: '#ff4466' }}>{formatBRL(dailyExpense, true)}</p>
                    <p className="text-[11px] text-[#55556a] mt-1">{periodDays} dias no período · total {formatBRL(expenses, true)}</p>
                  </div>
                  <div className="v2-card p-4">
                    <p className="v2-caption">Média diária · receitas</p>
                    <p className="v2-num text-2xl font-bold mt-1" style={{ color: '#00ff88' }}>{formatBRL(dailyIncome, true)}</p>
                    <p className="text-[11px] text-[#55556a] mt-1">{periodDays} dias no período · total {formatBRL(income, true)}</p>
                  </div>
                </div>
                {dailyFlow.length > 0 && (
                  <div className="overflow-hidden rounded-xl border border-[#1e1e30] divide-y divide-[#1e1e30] max-h-96 overflow-y-auto">
                    <div className="grid grid-cols-[60px_1fr_120px_120px] items-center px-3 py-2 text-[10px] uppercase tracking-wider text-[#55556a] sticky top-0 bg-[#0f1018]">
                      <span>Dia</span>
                      <span>Net</span>
                      <span className="text-right">Receitas</span>
                      <span className="text-right">Despesas</span>
                    </div>
                    {dailyFlow.filter(d => d.income > 0 || d.expense > 0).map(d => (
                      <div key={d.day} className="grid grid-cols-[60px_1fr_120px_120px] items-center px-3 py-2.5 text-xs v2-row-hover">
                        <span className="v2-num text-[#8888aa]">{String(d.day).padStart(2, '0')}/{String(selMonth).padStart(2, '0')}</span>
                        <span className="v2-num font-semibold" style={{ color: d.net >= 0 ? '#00ff88' : '#ff4466' }}>
                          {d.net >= 0 ? '+' : ''}{formatBRL(d.net, true)}
                        </span>
                        <span className="v2-num text-right" style={{ color: '#00ff88' }}>{d.income > 0 ? `+${formatBRL(d.income, true)}` : '—'}</span>
                        <span className="v2-num text-right" style={{ color: '#ff4466' }}>{d.expense > 0 ? `−${formatBRL(d.expense, true)}` : '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            }
          >
            <p className="v2-caption pr-9">Ritmo do mês</p>
            <p className="text-sm text-[#8888aa] mt-0.5">No passo atual…</p>
            <div className="mt-5">
              <div className="flex items-baseline gap-2">
                <span className="v2-num text-3xl font-bold" style={{ color: '#ff4466' }}>{formatBRL(dailyExpense, true)}</span>
                <span className="text-xs text-[#8888aa]">/dia em despesas</span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="v2-num text-3xl font-bold" style={{ color: '#00ff88' }}>{formatBRL(dailyIncome, true)}</span>
                <span className="text-xs text-[#8888aa]">/dia em receitas</span>
              </div>
              {periodMode === 'monthly' && selYear === todayYear && selMonth === todayMonth && (
                <div className="mt-4 pt-4 border-t border-[#1e1e30]">
                  <p className="v2-caption">Burn de hoje</p>
                  <p className="v2-num text-base font-semibold mt-1" style={{ color: '#ff4466' }}>−{formatBRL(todayBurn, true)} <span className="text-xs text-[#8888aa] font-normal">de {formatBRL(dailyExpense, true)} estimado</span></p>
                  <div className="w-full h-1.5 rounded-full bg-[#1e1e30] overflow-hidden mt-2">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.min((dailyExpense > 0 ? (todayBurn / dailyExpense) * 100 : 0), 100)}%`, background: '#ff4466' }}/>
                  </div>
                </div>
              )}
            </div>
          </ExpandableCard>

          {/* Top movers (large) */}
          <ExpandableCard
            gridClass="lg:col-span-2"
            title={`Top movers · todos · ${periodMode === 'monthly' ? `${monthName(selMonth)} ${selYear}` : periodMode === 'ytd' ? `YTD ${todayYear}` : selYear}`}
            subtitle={`${allInflows.length} receitas · ${allOutflows.length} despesas no período`}
            modalSize="xl"
            detail={
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <p className="v2-caption mb-2" style={{ color: '#00ff88' }}>Todas as entradas ({allInflows.length})</p>
                  <div className="overflow-hidden rounded-xl border border-[#1e1e30] divide-y divide-[#1e1e30] max-h-96 overflow-y-auto">
                    {allInflows.length === 0 ? (
                      <p className="text-xs text-[#55556a] text-center py-6">Sem receitas no período.</p>
                    ) : allInflows.map((t, i) => (
                      <div key={t.id} className="flex items-center gap-2 px-3 py-2 text-xs v2-row-hover">
                        <span className="v2-num text-[#55556a] w-6">{i + 1}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold truncate">{t.description}</span>
                          <span className="text-[10px] text-[#55556a]">{formatDate(t.date)} · {t.account || '—'}</span>
                        </span>
                        <span className="v2-num font-bold whitespace-nowrap" style={{ color: '#00ff88' }}>+{formatBRL(txBrl(t), true)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="v2-caption mb-2" style={{ color: '#ff4466' }}>Todas as saídas ({allOutflows.length})</p>
                  <div className="overflow-hidden rounded-xl border border-[#1e1e30] divide-y divide-[#1e1e30] max-h-96 overflow-y-auto">
                    {allOutflows.length === 0 ? (
                      <p className="text-xs text-[#55556a] text-center py-6">Sem despesas no período.</p>
                    ) : allOutflows.map((t, i) => (
                      <div key={t.id} className="flex items-center gap-2 px-3 py-2 text-xs v2-row-hover">
                        <span className="v2-num text-[#55556a] w-6">{i + 1}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold truncate">{t.description}</span>
                          <span className="text-[10px] text-[#55556a]">{formatDate(t.date)} · {t.account || '—'}</span>
                        </span>
                        <span className="v2-num font-bold whitespace-nowrap" style={{ color: '#ff4466' }}>−{formatBRL(txBrl(t), true)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between mb-3 pr-9">
              <div>
                <p className="v2-caption">Top movers · {periodMode === 'monthly' ? monthName(selMonth) : periodMode === 'ytd' ? 'YTD' : selYear}</p>
                <p className="text-sm text-[#8888aa] mt-0.5">As maiores entradas e saídas</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6">
              <div>
                <p className="v2-caption mb-2" style={{ color: '#00ff88' }}>Maiores entradas</p>
                <div className="space-y-1">
                  {topInflows.length === 0 ? (
                    <p className="text-[11px] text-[#55556a] py-2">Sem receitas no período.</p>
                  ) : topInflows.map((t, i) => (
                    <div key={t.id} className="v2-row-hover flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer">
                      <span className="text-xs text-[#55556a] w-4 v2-num">{i + 1}</span>
                      <span className="flex-1 min-w-0">
                        <span className="text-sm font-semibold block truncate">{t.description}</span>
                        <span className="text-[11px] text-[#55556a]">{formatDate(t.date)} · {t.account || '—'}</span>
                      </span>
                      <span className="v2-num text-sm font-bold whitespace-nowrap" style={{ color: '#00ff88' }}>+{formatBRL(txBrl(t), true)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 sm:mt-0">
                <p className="v2-caption mb-2" style={{ color: '#ff4466' }}>Maiores saídas</p>
                <div className="space-y-1">
                  {topOutflows.length === 0 ? (
                    <p className="text-[11px] text-[#55556a] py-2">Sem despesas no período.</p>
                  ) : topOutflows.map((t, i) => (
                    <div key={t.id} className="v2-row-hover flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer">
                      <span className="text-xs text-[#55556a] w-4 v2-num">{i + 1}</span>
                      <span className="flex-1 min-w-0">
                        <span className="text-sm font-semibold block truncate">{t.description}</span>
                        <span className="text-[11px] text-[#55556a]">{formatDate(t.date)} · {t.account || '—'}</span>
                      </span>
                      <span className="v2-num text-sm font-bold whitespace-nowrap" style={{ color: '#ff4466' }}>−{formatBRL(txBrl(t), true)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ExpandableCard>

          {/* Coming up */}
          <ExpandableCard
            title="Próximos lançamentos · 60 dias"
            subtitle={`${allComingUp.length} eventos · ${formatBRL(allComingUp.filter(c => c.type === 'expense').reduce((s, c) => s + c.amount, 0), true)} em despesas previstas`}
            modalSize="lg"
            detail={
              allComingUp.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Cadastre recorrências em Configurações para ver aqui.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#1e1e30] divide-y divide-[#1e1e30]">
                  <div className="grid grid-cols-[80px_1fr_140px] items-center px-3 py-2 text-[10px] uppercase tracking-wider text-[#55556a]">
                    <span>Data</span>
                    <span>Lançamento</span>
                    <span className="text-right">Valor</span>
                  </div>
                  {allComingUp.map((c, i) => (
                    <div key={i} className="grid grid-cols-[80px_1fr_140px] items-center px-3 py-2.5 text-xs v2-row-hover">
                      <span className="v2-num text-[#8888aa]">{String(c.date.getDate()).padStart(2,'0')}/{String(c.date.getMonth()+1).padStart(2,'0')}</span>
                      <span className="min-w-0">
                        <span className="block font-medium truncate">{c.label}</span>
                        <span className="text-[10px] text-[#55556a]">{c.sub}</span>
                      </span>
                      <span className="v2-num text-right font-semibold" style={{ color: c.type === 'expense' ? '#ff4466' : '#00ff88' }}>
                        {c.type === 'expense' ? '−' : '+'}{formatBRL(c.amount, true)}
                      </span>
                    </div>
                  ))}
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Próximos 7 dias</p>
            <p className="text-sm text-[#8888aa] mt-0.5">{comingUp.length} lançamentos previstos</p>
            <div className="mt-4 space-y-2 text-xs">
              {comingUp.length === 0 ? (
                <p className="text-[11px] text-[#55556a] py-2">Sem recorrências em 7 dias.</p>
              ) : comingUp.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-9 text-center text-[10px] text-[#55556a] font-mono leading-tight">
                    <span className="block text-[#e8e8f0] font-bold text-sm">{c.date.getDate()}</span>
                    {monthName(c.date.getMonth() + 1).slice(0, 3).toLowerCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="font-medium block truncate">{c.label}</span>
                    <span className="text-[10px] text-[#55556a]">{c.sub}</span>
                  </span>
                  <span className="v2-num font-semibold" style={{ color: c.type === 'expense' ? '#ff4466' : '#00ff88' }}>
                    {c.type === 'expense' ? '−' : '+'}{formatBRL(c.amount, true)}
                  </span>
                </div>
              ))}
            </div>
          </ExpandableCard>

        </section>

        {/* TRANSACTIONS TABLE */}
        <section className="v2-reveal">
          <details className="v2-card group" open>
            <summary className="cursor-pointer list-none flex items-center justify-between p-5 hover:bg-[#161729] transition-colors rounded-2xl">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,212,255,.1)', color: '#00d4ff' }}><List className="w-4 h-4"/></span>
                <div>
                  <p className="text-sm font-semibold">Todos os lançamentos · {periodMode === 'monthly' ? `${monthName(selMonth)} ${selYear}` : periodMode === 'ytd' ? `YTD ${todayYear}` : selYear}</p>
                  <p className="text-xs text-[#55556a]">{filtered.length} transações · use os filtros para refinar</p>
                </div>
              </div>
              <span className="flex items-center gap-3">
                <span className="v2-caption v2-num">{filtered.length} itens</span>
                <ChevronDown className="w-4 h-4 text-[#55556a] transition-transform group-open:rotate-180"/>
              </span>
            </summary>
            <div className="px-5 pb-5">
              {/* Filter bar */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#55556a]"/>
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar descrição, categoria…"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-[#0a0a0f] border border-[#1e1e30] text-[#e8e8f0] placeholder:text-[#55556a] focus:outline-none focus:border-[#00d4ff]/40"
                  />
                </div>
                <select value={filterType} onChange={e => setFilterType(e.target.value as any)} className="px-3 py-2 rounded-lg text-xs font-medium border border-[#1e1e30] bg-[#0a0a0f] text-[#8888aa]">
                  <option value="all">Tipo: todos</option>
                  <option value="income">Receitas</option>
                  <option value="expense">Despesas</option>
                </select>
                <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-medium border border-[#1e1e30] bg-[#0a0a0f] text-[#8888aa] max-w-[160px]">
                  <option value="all">Categoria: todas</option>
                  {allCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </div>
              {/* Bulk action toolbar — appears when any row is selected */}
              {selectedIds.size > 0 && (
                <div className="mb-3 flex items-center gap-2 flex-wrap px-3 py-2.5 rounded-xl border border-[#00d4ff]/30 bg-[#00d4ff]/5">
                  <span className="text-xs font-semibold" style={{ color: '#00d4ff' }}>
                    {selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}
                  </span>
                  <span className="text-[#2a2a3e]">·</span>
                  {/* Renomear em massa */}
                  <input
                    type="text"
                    value={bulkRename}
                    onChange={e => setBulkRename(e.target.value)}
                    placeholder="Renomear todas para…"
                    className="flex-1 min-w-[160px] px-3 py-1.5 text-xs rounded-lg bg-[#0a0a0f] border border-[#1e1e30] text-[#e8e8f0] placeholder:text-[#55556a] focus:outline-none focus:border-[#00d4ff]/40"
                  />
                  <button
                    onClick={async () => {
                      if (!bulkRename.trim()) return
                      setBulkBusy(true)
                      try {
                        for (const id of selectedIds) {
                          const t = transactions.find(x => x.id === id)
                          if (t) await updateTransaction({ ...t, description: bulkRename.trim() })
                        }
                        setBulkRename('')
                        clearSelection()
                      } finally { setBulkBusy(false) }
                    }}
                    disabled={!bulkRename.trim() || bulkBusy}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#00d4ff]/10 text-[#00d4ff] hover:bg-[#00d4ff]/20 disabled:opacity-40"
                  >Aplicar</button>
                  {/* Mudar categoria em massa */}
                  <select
                    value={bulkCategory}
                    onChange={async (e) => {
                      const newCat = e.target.value
                      if (!newCat) { setBulkCategory(''); return }
                      setBulkCategory(newCat); setBulkBusy(true)
                      try {
                        for (const id of selectedIds) {
                          const t = transactions.find(x => x.id === id)
                          if (t) await updateTransaction({ ...t, category: newCat })
                        }
                        setBulkCategory(''); clearSelection()
                      } finally { setBulkBusy(false) }
                    }}
                    disabled={bulkBusy}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#1e1e30] bg-[#0a0a0f] text-[#8888aa]"
                  >
                    <option value="">Mudar categoria…</option>
                    {allCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                  {/* Delete em massa */}
                  {!bulkConfirmDelete ? (
                    <button
                      onClick={() => setBulkConfirmDelete(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#ff4466]/10 text-[#ff4466] hover:bg-[#ff4466]/20"
                    >Excluir</button>
                  ) : (
                    <>
                      <button
                        onClick={async () => {
                          setBulkBusy(true)
                          try {
                            for (const id of selectedIds) await deleteTransaction(id)
                            clearSelection(); setBulkConfirmDelete(false)
                          } finally { setBulkBusy(false) }
                        }}
                        disabled={bulkBusy}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#ff4466] text-[#0a0a0f] hover:opacity-90"
                      >Confirmar exclusão</button>
                      <button
                        onClick={() => setBulkConfirmDelete(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#8888aa] hover:text-white"
                      >Cancelar</button>
                    </>
                  )}
                  <button
                    onClick={clearSelection}
                    className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium text-[#55556a] hover:text-white"
                  >Limpar seleção</button>
                </div>
              )}
              {/* Table */}
              <div className="overflow-x-auto">
                <div className="min-w-[700px] overflow-hidden rounded-xl border border-[#1e1e30] divide-y divide-[#1e1e30]">
                  <div className="grid grid-cols-[34px_80px_1fr_140px_120px] items-center px-3 py-2 text-[10px] uppercase tracking-wider text-[#55556a] gap-1">
                    <input
                      type="checkbox"
                      checked={visibleRows.length > 0 && visibleRows.every(r => selectedIds.has(r.id))}
                      ref={(el) => { if (el) el.indeterminate = visibleRows.some(r => selectedIds.has(r.id)) && !visibleRows.every(r => selectedIds.has(r.id)) }}
                      onChange={(e) => {
                        setSelectedIds(prev => {
                          const next = new Set(prev)
                          if (e.target.checked) visibleRows.forEach(r => next.add(r.id))
                          else visibleRows.forEach(r => next.delete(r.id))
                          return next
                        })
                      }}
                      className="accent-[#00d4ff] w-3.5 h-3.5 cursor-pointer"
                      title="Selecionar todos visíveis"
                    />
                    <button onClick={() => toggleTxSort('date')}        className="text-left hover:text-[#e8e8f0] uppercase tracking-wider">Data{txSortIcon('date')}</button>
                    <button onClick={() => toggleTxSort('description')} className="text-left hover:text-[#e8e8f0] uppercase tracking-wider">Descrição{txSortIcon('description')}</button>
                    <button onClick={() => toggleTxSort('category')}    className="text-left hover:text-[#e8e8f0] uppercase tracking-wider">Categoria{txSortIcon('category')}</button>
                    <button onClick={() => toggleTxSort('value')}       className="text-right hover:text-[#e8e8f0] uppercase tracking-wider">Valor{txSortIcon('value')}</button>
                  </div>
                  {visibleRows.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-[#55556a]">Nenhuma transação encontrada.</div>
                  ) : visibleRows.map(t => {
                    const cat = allCategories.find(c => c.id === t.category)
                    const v = txBrl(t)
                    const isSelected = selectedIds.has(t.id)
                    return (
                      <div
                        key={t.id}
                        className="grid grid-cols-[34px_80px_1fr_140px_120px] items-center px-3 py-2.5 text-xs v2-row-hover gap-1"
                        style={{ background: isSelected ? 'rgba(0,212,255,.05)' : undefined }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(t.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="accent-[#00d4ff] w-3.5 h-3.5 cursor-pointer"
                          title="Selecionar"
                        />
                        <button
                          onClick={() => setEditingTx(t)}
                          className="contents text-left cursor-pointer"
                          title="Clique para editar"
                        >
                          <span className="v2-num text-[#8888aa]">{formatDate(t.date).slice(0, 5)}</span>
                          <span className="font-medium truncate">{t.description}</span>
                          <span className="text-[#8888aa] truncate">{cat?.icon ?? '📦'} {cat?.name ?? t.category}</span>
                          <span className="v2-num font-semibold text-right" style={{ color: t.type === 'expense' ? '#ff4466' : '#00ff88' }}>
                            {t.type === 'expense' ? '−' : '+'}{formatBRL(v, true)}
                          </span>
                        </button>
                      </div>
                    )
                  })}
                  {filtered.length > 10 && !showAllTx && (
                    <div className="px-3 py-3 text-center">
                      <button onClick={() => setShowAllTx(true)} className="text-[11px] text-[#8888aa] hover:text-white">
                        Mostrar mais {filtered.length - 10} lançamentos
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </details>
        </section>

        {/* OTHER COLLAPSIBLES */}
        <section className="space-y-2.5 v2-reveal">
          <details className="v2-card group">
            <summary className="cursor-pointer list-none flex items-center justify-between p-5 hover:bg-[#161729] transition-colors rounded-2xl">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,122,0,.1)', color: '#ff7a00' }}><Repeat className="w-4 h-4"/></span>
                <div>
                  <p className="text-sm font-semibold">Recorrências · {subscriptions.filter(s => s.isActive).length} ativas</p>
                  <p className="text-xs text-[#55556a]">
                    {subscriptions.filter(s => s.isActive && s.type === 'income').reduce((a, s) => a + convert(s.amount, s.currency, 'BRL', usdToBrl, eurToBrl), 0) > 0
                      ? `+${formatBRL(subscriptions.filter(s => s.isActive && s.type === 'income').reduce((a, s) => a + convert(s.amount, s.currency, 'BRL', usdToBrl, eurToBrl), 0), true)}/mês receitas · `
                      : ''}
                    −{formatBRL(subscriptions.filter(s => s.isActive && s.type === 'expense').reduce((a, s) => a + convert(s.amount, s.currency, 'BRL', usdToBrl, eurToBrl), 0), true)}/mês despesas
                  </p>
                </div>
              </div>
              <span className="flex items-center gap-3">
                <span className="v2-caption v2-num">{subscriptions.length} itens</span>
                <ChevronDown className="w-4 h-4 text-[#55556a] transition-transform group-open:rotate-180"/>
              </span>
            </summary>
            <div className="px-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-[#8888aa]">Clique numa recorrência pra editar, no toggle para ativar/desativar, ou no X pra excluir.</p>
                <button
                  onClick={() => setShowAddRec(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  style={{ background: '#ff7a00', color: '#0a0a0f' }}
                >
                  <Plus className="w-3.5 h-3.5" /> Nova recorrência
                </button>
              </div>
              {subscriptions.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Nenhuma recorrência cadastrada. Crie a primeira pra automatizar contas mensais.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#1e1e30] divide-y divide-[#1e1e30]">
                  {subscriptions.map(s => {
                    const cat = allCategories.find(c => c.id === s.category)
                    const valBrl = convert(s.amount, s.currency, 'BRL', usdToBrl, eurToBrl)
                    return (
                      <div
                        key={s.id}
                        className="grid grid-cols-[40px_1fr_140px_120px_60px_30px] items-center gap-2 px-3 py-2.5 text-xs v2-row-hover"
                        style={{ opacity: s.isActive ? 1 : 0.45 }}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); updateSubscription({ ...s, isActive: !s.isActive }) }}
                          title={s.isActive ? 'Desativar' : 'Ativar'}
                          className="flex items-center justify-center"
                        >
                          <span className={`inline-block w-7 h-3.5 rounded-full relative transition-colors ${s.isActive ? 'bg-[#ff7a00]' : 'bg-[#2a2a3e]'}`}>
                            <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${s.isActive ? 'left-3.5' : 'left-0.5'}`}/>
                          </span>
                        </button>
                        <button onClick={() => setEditingRec(s)} className="text-left min-w-0">
                          <span className="block font-medium truncate">{s.name}</span>
                          <span className="block text-[10px] text-[#55556a]">
                            {s.frequency === 'weekly'
                              ? `Toda ${s.weeklyInterval && s.weeklyInterval > 1 ? `${s.weeklyInterval}ª ` : ''}semana`
                              : `Dia ${s.billingDay}`}
                            {' · '}{s.account || '—'}
                          </span>
                        </button>
                        <button onClick={() => setEditingRec(s)} className="text-left text-[#8888aa] truncate">{cat?.icon ?? '📦'} {cat?.name ?? s.category}</button>
                        <button onClick={() => setEditingRec(s)} className="v2-num text-right font-semibold" style={{ color: s.type === 'expense' ? '#ff4466' : '#00ff88' }}>
                          {s.type === 'expense' ? '−' : '+'}{formatBRL(valBrl, true)}
                        </button>
                        <button onClick={() => setEditingRec(s)} className="text-[10px] text-[#55556a] uppercase tracking-wider text-right">
                          {s.frequency === 'weekly' ? 'sem' : 'mês'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`Excluir recorrência "${s.name}"?\nLançamentos já gerados no fluxo não serão removidos.`)) {
                              deleteSubscription(s.id)
                            }
                          }}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-[#55556a] hover:text-[#ff4466] hover:bg-[#ff4466]/10"
                          title="Excluir recorrência"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </details>

          <button onClick={() => setShowDedup(true)} className="v2-card w-full text-left flex items-center justify-between p-5 hover:bg-[#161729] transition-colors">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,.1)', color: '#f59e0b' }}><Copy className="w-4 h-4"/></span>
              <div>
                <p className="text-sm font-semibold">Duplicatas detectadas · {dupGroups.length} grupos</p>
                <p className="text-xs text-[#55556a]">Mesma data + descrição + valor — possível duplicação</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#55556a]"/>
          </button>
        </section>

      </div>


      <AddTransactionModal open={showAddTx} onClose={() => setShowAddTx(false)} />
      <AddTransactionModal open={!!editingTx} onClose={() => setEditingTx(null)} initial={editingTx ?? undefined} />
      <RecurringModal open={showAddRec} onClose={() => setShowAddRec(false)} />
      <RecurringModal open={!!editingRec} onClose={() => setEditingRec(null)} initial={editingRec ?? undefined} />
      <DeduplicateModal    open={showDedup} onClose={() => setShowDedup(false)} />
    </div>
  )
}
