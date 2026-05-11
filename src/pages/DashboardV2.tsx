// ─────────────────────────────────────────────
//  Luxor V2 — Painel Consolidado
//  Hero net worth + attention strip + 4 KPIs +
//  bento grid (trend, pyramid, allocation, movers,
//  cashflow, coming up) + below-fold collapsibles.
//  Wired to the real Zustand store (transactions,
//  investments, subscriptions) so existing users
//  get the new visual without losing any data.
// ─────────────────────────────────────────────
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, ArrowUpRight, CalendarClock, ChevronDown,
  Copy, FileSearch, Layers, Link2, Plus, RefreshCw, Repeat, ScanLine,
  Scale, TrendingUp, Trophy, Wallet,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatBRL, monthName } from '../lib/formatters'
import { convert } from '../lib/suitability'
import {
  AttentionChip, ExpandableCard, FabMenu, KpiCard, PeriodTabs, stopExpand, useReveal, V2PageHeader,
} from '../components/v2/V2Primitives'
import { AddTransactionModal } from '../components/modals/AddTransactionModal'
import { InvestmentModal } from '../components/modals/InvestmentModal'
import { pfPath } from '../constants'

type PyramidTier = {
  key: string
  name: string
  bracketLabel: string
  percentile: string
  min: number  // BRL
  max: number  // BRL
}

// BR wealth tiers (IBGE PNAD 2023, WID.world BR 2022, Credit Suisse 2023, IRPF 2023)
const PYRAMID_TIERS: PyramidTier[] = [
  { key: 'topo',         name: 'Topo',          bracketLabel: 'R$ 10M+',         percentile: '0,1%', min: 10_000_000, max: Infinity },
  { key: 'soberania',    name: 'Soberania',     bracketLabel: 'R$ 3M – 10M',     percentile: '1%',   min: 3_000_000,  max: 10_000_000 },
  { key: 'independencia',name: 'Independência', bracketLabel: 'R$ 1M – 3M',      percentile: '5%',   min: 1_000_000,  max: 3_000_000 },
  { key: 'conforto',     name: 'Conforto',      bracketLabel: 'R$ 300k – 1M',    percentile: '15%',  min: 300_000,    max: 1_000_000 },
  { key: 'estabilidade', name: 'Estabilidade',  bracketLabel: 'R$ 50k – 300k',   percentile: '50%',  min: 50_000,     max: 300_000 },
  { key: 'base',         name: 'Base',          bracketLabel: '< R$ 50k',        percentile: '100%', min: 0,          max: 50_000 },
]

function tierForPatrim(p: number): PyramidTier {
  return PYRAMID_TIERS.find(t => p >= t.min && p < t.max) ?? PYRAMID_TIERS[PYRAMID_TIERS.length - 1]
}

export default function DashboardV2() {
  const { transactions, investments, subscriptions, settings } = useStore()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  const [periodMode, setPeriodMode] = useState<'monthly' | 'ytd' | 'yearly'>('monthly')
  const [showAddTx, setShowAddTx] = useState(false)
  const [showAddInv, setShowAddInv] = useState(false)

  const eurToBrl = settings.eurToBrl ?? 5.90
  const usdToBrl = settings.usdToBrl
  const today = new Date()
  const todayMonth = today.getMonth() + 1
  const todayYear = today.getFullYear()

  // ── Patrimônio total (always current) ──────────
  const netWorthBRL = useMemo(() => {
    return investments.reduce((sum, inv) => {
      const v = inv.quantity * inv.currentPrice
      return sum + convert(v, inv.currency, 'BRL', usdToBrl, eurToBrl)
    }, 0)
  }, [investments, usdToBrl, eurToBrl])

  const netWorthUSD = netWorthBRL / Math.max(usdToBrl, 0.01)
  const tier = tierForPatrim(netWorthBRL)
  const tierIdx = PYRAMID_TIERS.indexOf(tier)
  const nextTier = tierIdx > 0 ? PYRAMID_TIERS[tierIdx - 1] : null
  const distanceToNext = nextTier ? Math.max(0, nextTier.min - netWorthBRL) : 0
  const progressInTier = useMemo(() => {
    if (tier.max === Infinity) return 100
    if (tier.max <= tier.min) return 0
    return Math.max(0, Math.min(100, ((netWorthBRL - tier.min) / (tier.max - tier.min)) * 100))
  }, [netWorthBRL, tier])

  // ── Period transactions ────────────────────────
  const periodTx = useMemo(() => {
    if (periodMode === 'monthly') {
      const prefix = `${todayYear}-${String(todayMonth).padStart(2, '0')}-`
      return transactions.filter(t => t.date.startsWith(prefix))
    }
    if (periodMode === 'ytd') {
      const jan1 = `${todayYear}-01-01`
      const todayStr = today.toISOString().split('T')[0]
      return transactions.filter(t => t.date >= jan1 && t.date <= todayStr)
    }
    return transactions.filter(t => t.date.startsWith(`${todayYear}-`))
  }, [transactions, periodMode, todayMonth, todayYear])

  // ── Last month delta ──────────────────────────
  const lastMonthNet = useMemo(() => {
    const m = todayMonth === 1 ? 12 : todayMonth - 1
    const y = todayMonth === 1 ? todayYear - 1 : todayYear
    const prefix = `${y}-${String(m).padStart(2, '0')}-`
    const txs = transactions.filter(t => t.date.startsWith(prefix))
    const txBrl = (t: typeof txs[number]) => convert(t.amount, (t.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR', 'BRL', usdToBrl, eurToBrl)
    const inc = txs.filter(t => t.type === 'income').reduce((a, t) => a + txBrl(t), 0)
    const exp = txs.filter(t => t.type === 'expense').reduce((a, t) => a + txBrl(t), 0)
    return inc - exp
  }, [transactions, todayMonth, todayYear, usdToBrl, eurToBrl])

  // ── KPIs ──────────────────────────────────────
  const txBrl = (t: typeof periodTx[number]) =>
    convert(t.amount, (t.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR', 'BRL', usdToBrl, eurToBrl)
  const income = useMemo(() => periodTx.filter(t => t.type === 'income').reduce((a, t) => a + txBrl(t), 0), [periodTx])
  const expenses = useMemo(() => periodTx.filter(t => t.type === 'expense').reduce((a, t) => a + txBrl(t), 0), [periodTx])
  const aportes = useMemo(() => periodTx.filter(t => t.type === 'expense' && t.category === 'investimento').reduce((a, t) => a + txBrl(t), 0), [periodTx])
  const netFlow = income - expenses
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0

  // ── Net worth sparkline (last 12 months — derived from current value
  //    plus monthly aportes/withdrawals from transactions; illustrative) ──
  const sparkData = useMemo(() => {
    // Walk back 12 months: starting from netWorthBRL, subtract each month's
    // net cashflow into investments (aportes - resgates) to estimate prior
    // values. This reflects the data we have without faking trends.
    const months: number[] = []
    let running = netWorthBRL
    for (let i = 0; i < 12; i++) {
      months.unshift(running)
      const m = todayMonth - i
      const y = todayYear + Math.floor((m - 1) / 12)
      const mm = ((m - 1) % 12 + 12) % 12 + 1
      const prefix = `${y}-${String(mm).padStart(2, '0')}-`
      const monthTxs = transactions.filter(t => t.date.startsWith(prefix))
      const ap = monthTxs.filter(t => t.type === 'expense' && t.category === 'investimento').reduce((a, t) => a + txBrl(t), 0)
      const re = monthTxs.filter(t => t.type === 'income' && t.category === 'investimento').reduce((a, t) => a + txBrl(t), 0)
      running = running - ap + re
    }
    return months
  }, [netWorthBRL, transactions, todayMonth, todayYear, usdToBrl, eurToBrl])

  // ── Allocation by asset class ─────────────────
  const allocation = useMemo(() => {
    const m = new Map<string, number>()
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      m.set(i.assetClass, (m.get(i.assetClass) ?? 0) + v)
    })
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0)
    const palette = ['#00d4ff', '#00ff88', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#ff7a00']
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value], i) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0, color: palette[i % palette.length] }))
  }, [investments, usdToBrl, eurToBrl])

  // ── All movers (full list — used by expand modal) ──
  const allMovers = useMemo(() => {
    return investments
      .filter(i => i.location !== 'physical-re')
      .map(i => {
        const cur = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
        const cost = convert(i.quantity * i.avgCost, i.currency, 'BRL', usdToBrl, eurToBrl)
        const gain = cur - cost
        const pct = cost > 0 ? (gain / cost) * 100 : 0
        return { ...i, gain, pct, current: cur }
      })
      .sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain))
  }, [investments, usdToBrl, eurToBrl])
  const topMovers = useMemo(() => allMovers.slice(0, 4), [allMovers])

  // ── Full allocation (no slice — used by expand modal) ──
  const allAllocation = useMemo(() => {
    const m = new Map<string, number>()
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      m.set(i.assetClass, (m.get(i.assetClass) ?? 0) + v)
    })
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0)
    const palette = ['#00d4ff', '#00ff88', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#ff7a00']
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0, color: palette[i % palette.length] }))
  }, [investments, usdToBrl, eurToBrl])

  // ── Coming up: next recurring + scheduled txs ──
  const allComingUp = useMemo(() => {
    const items: { date: Date; label: string; sub: string; amount: number; type: 'income' | 'expense' }[] = []
    const today0 = new Date(); today0.setHours(0, 0, 0, 0)
    const horizon = new Date(today0); horizon.setDate(horizon.getDate() + 60)
    subscriptions.filter(s => s.isActive).forEach(s => {
      // Walk up to two billing cycles into the horizon to catch month-end + next-month
      let d = new Date(today0.getFullYear(), today0.getMonth(), Math.min(s.billingDay, 28))
      if (d < today0) d.setMonth(d.getMonth() + 1)
      while (d <= horizon) {
        const valBrl = convert(s.amount, s.currency, 'BRL', usdToBrl, eurToBrl)
        items.push({ date: new Date(d), label: s.name, sub: 'Recorrente', amount: valBrl, type: s.type })
        d.setMonth(d.getMonth() + 1)
      }
    })
    return items.sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [subscriptions, usdToBrl, eurToBrl])
  const comingUp = useMemo(() => allComingUp.slice(0, 5), [allComingUp])

  // ── Attention signals ─────────────────────────
  const concentrationAlert = useMemo(() => {
    if (netWorthBRL <= 0 || investments.length === 0) return null
    const max = investments
      .filter(i => i.location !== 'physical-re')
      .map(i => ({ inv: i, value: convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl) }))
      .sort((a, b) => b.value - a.value)[0]
    if (!max) return null
    const pct = (max.value / netWorthBRL) * 100
    if (pct >= 15) return { name: max.inv.ticker || max.inv.name, pct }
    return null
  }, [investments, netWorthBRL, usdToBrl, eurToBrl])

  const upcomingBillsAlert = useMemo(() => {
    const total = comingUp.filter(c => c.type === 'expense').reduce((s, c) => s + c.amount, 0)
    return total > 0 ? { count: comingUp.filter(c => c.type === 'expense').length, total } : null
  }, [comingUp])

  const savingsRateAlert = useMemo(() => {
    const goal = settings.savingsRateGoal ?? 30
    if (savingsRate >= goal) return null
    return { rate: savingsRate, goal, gap: goal - savingsRate }
  }, [savingsRate, settings.savingsRateGoal])

  // ── Reveal animations ─────────────────────────
  useReveal(containerRef, [investments.length, transactions.length, periodMode])

  // ── Pyramid SVG geometry: apex (120,10) → base (10,190)–(230,190),
  //     6 layers × 30px, edges form continuous straight lines. ──
  const pyramidLayers = [
    { points: '120,10 138,40 102,40',                        cls: 'tier-topo' },
    { points: '102,40 138,40 157,70 83,70',                  cls: 'tier-soberania' },
    { points: '83,70 157,70 175,100 65,100',                 cls: 'tier-independencia' },
    { points: '65,100 175,100 193,130 47,130',               cls: 'tier-conforto' },
    { points: '47,130 193,130 212,160 28,160',               cls: 'tier-estabilidade' },
    { points: '28,160 212,160 230,190 10,190',               cls: 'tier-base' },
  ]

  // ── Net worth max for spark scaling ───────────
  const sparkMax = Math.max(...sparkData, 1)
  const sparkMin = Math.min(...sparkData, 0)
  const sparkRange = Math.max(sparkMax - sparkMin, 1)

  return (
    <div className="v2-root min-w-0" ref={containerRef}>
      <V2PageHeader
        title="Painel Consolidado"
        subtitle={`${monthName(todayMonth)} ${todayYear} · ${investments.length} ativos · ${transactions.length} transações`}
        right={
          <PeriodTabs
            value={periodMode}
            onChange={setPeriodMode}
            options={[
              { value: 'monthly', label: 'Mensal' },
              { value: 'ytd', label: 'YTD' },
              { value: 'yearly', label: 'Anual' },
            ]}
          />
        }
      />

      <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">

        {/* HERO — Patrimônio Total */}
        <section className="v2-card-emph v2-dot-grid p-6 sm:p-8 v2-reveal">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="flex-1 min-w-0">
              <p className="v2-caption">Patrimônio total</p>
              <div className="flex items-baseline gap-3 mt-1.5 flex-wrap">
                <span className="v2-num text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
                  {formatBRL(netWorthBRL)}
                </span>
                {netFlow !== 0 && (
                  <span className="v2-pill" style={{
                    background: netFlow >= 0 ? 'rgba(0,255,136,.12)' : 'rgba(255,68,102,.12)',
                    color: netFlow >= 0 ? '#00ff88' : '#ff4466',
                    border: `1px solid ${netFlow >= 0 ? 'rgba(0,255,136,.25)' : 'rgba(255,68,102,.25)'}`,
                  }}>
                    <ArrowUpRight className="w-3 h-3" />
                    {netFlow >= 0 ? '+' : ''}{formatBRL(netFlow, true)} {periodMode === 'monthly' ? 'este mês' : periodMode === 'ytd' ? 'YTD' : `em ${todayYear}`}
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-center gap-3 text-xs text-[#8888aa] flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" style={{ color: '#ff7a00' }} />
                  {tierIdx >= 0 ? `${tierIdx + 1}º andar · ` : ''}
                  <span className="text-white font-semibold">{tier.name}</span>
                </span>
                <span className="text-[#2a2a3e]">·</span>
                <span className="flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" style={{ color: '#00d4ff' }} />
                  USD <span className="v2-num text-white font-semibold">${netWorthUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </span>
                {nextTier && distanceToNext > 0 && (
                  <>
                    <span className="text-[#2a2a3e]">·</span>
                    <span className="flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
                      Faltam <span className="v2-num text-white font-semibold">{formatBRL(distanceToNext, true)}</span> para {nextTier.name}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* 12m sparkline */}
            <div className="lg:w-72 lg:flex-shrink-0">
              <p className="v2-caption mb-2">Últimos 12 meses</p>
              <svg viewBox="0 0 280 80" className="w-full h-20" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="dashSparkGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#ff7a00" stopOpacity="0.30"/>
                    <stop offset="100%" stopColor="#ff7a00" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                {sparkData.length > 1 && (() => {
                  const pts = sparkData.map((v, i) => {
                    const x = (i / (sparkData.length - 1)) * 280
                    const y = 70 - ((v - sparkMin) / sparkRange) * 60
                    return `${x},${y}`
                  })
                  return (
                    <>
                      <path d={`M${pts.join(' L')} L280,80 L0,80 Z`} fill="url(#dashSparkGrad)"/>
                      <path d={`M${pts.join(' L')}`} fill="none" stroke="#ff7a00" strokeWidth="2"/>
                      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="3" fill="#ff7a00"/>
                      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="6" fill="#ff7a00" opacity="0.25" className="v2-pulse"/>
                    </>
                  )
                })()}
              </svg>
            </div>
          </div>
        </section>

        {/* ATTENTION STRIP */}
        <section className="space-y-2.5 v2-reveal">
          <p className="v2-caption">Vale sua atenção esta semana</p>
          <div className="grid md:grid-cols-3 gap-2.5">
            {upcomingBillsAlert ? (
              <AttentionChip
                icon={CalendarClock}
                tone="red"
                title={`${upcomingBillsAlert.count} contas vencem em 14 dias`}
                subtitle={`Total ${formatBRL(upcomingBillsAlert.total, true)}`}
                onClick={() => navigate(pfPath('/cashflow'))}
              />
            ) : (
              <AttentionChip
                icon={CalendarClock}
                tone="green"
                title="Sem contas próximas"
                subtitle="Nenhum boleto recorrente nos próximos 14 dias"
              />
            )}
            {concentrationAlert ? (
              <AttentionChip
                icon={AlertTriangle}
                tone="amber"
                title={`Concentração: ${concentrationAlert.name} ${concentrationAlert.pct.toFixed(0)}%`}
                subtitle="Acima do limite sugerido de 10–15% por ativo"
                onClick={() => navigate(pfPath('/wealth'))}
              />
            ) : (
              <AttentionChip
                icon={Scale}
                tone="cyan"
                title="Carteira diversificada"
                subtitle="Nenhum ativo concentrando mais de 15% do patrimônio"
                onClick={() => navigate(pfPath('/wealth'))}
              />
            )}
            {savingsRateAlert ? (
              <AttentionChip
                icon={TrendingUp}
                tone="orange"
                title={`Taxa de poupança em ${savingsRateAlert.rate.toFixed(0)}%`}
                subtitle={`Meta ${savingsRateAlert.goal}% — ${savingsRateAlert.gap.toFixed(0)}pp abaixo`}
                onClick={() => navigate(pfPath('/cashflow'))}
              />
            ) : (
              <AttentionChip
                icon={TrendingUp}
                tone="green"
                title="Taxa de poupança no alvo"
                subtitle={`${savingsRate.toFixed(0)}% — meta ${settings.savingsRateGoal ?? 30}%`}
              />
            )}
          </div>
        </section>

        {/* KPI STRIP */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 v2-reveal">
          <KpiCard
            caption="Patrimônio"
            value={formatBRL(netWorthBRL, true)}
            secondary={`${investments.length} ativos · USD $${netWorthUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
            pillText={tier.name}
            pillColor="orange"
          />
          <KpiCard
            caption={`Saldo ${periodMode === 'monthly' ? 'mês' : periodMode === 'ytd' ? 'YTD' : 'ano'}`}
            value={`${netFlow >= 0 ? '+' : ''}${formatBRL(netFlow, true)}`}
            valueColor={netFlow >= 0 ? '#00ff88' : '#ff4466'}
            secondary={`Receitas ${formatBRL(income, true)} · Despesas ${formatBRL(expenses, true)}`}
            pillText={netFlow >= lastMonthNet ? 'estável' : 'queda'}
            pillColor={netFlow >= lastMonthNet ? 'green' : 'amber'}
          />
          <KpiCard
            caption="Aportes"
            value={formatBRL(aportes, true)}
            valueColor="#00d4ff"
            secondary={periodMode === 'monthly' ? 'transações marcadas como Investimento' : 'período selecionado'}
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

          {/* Net worth trend (large) */}
          <ExpandableCard
            gridClass="lg:col-span-2"
            title="Evolução do patrimônio · 12 meses"
            subtitle="Estimativa baseada em aportes/resgates da carteira"
            modalSize="xl"
            detail={
              <div>
                <svg viewBox="0 0 800 320" className="w-full h-72" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="trendAreaBig" x1="0" x2="0" y1="0" y2="1">
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
                        <path d={`M${pts.join(' L')} L800,320 L0,320 Z`} fill="url(#trendAreaBig)"/>
                        <path d={`M${pts.join(' L')}`} fill="none" stroke="#00ff88" strokeWidth="2"/>
                        {pts.map((p, i) => {
                          const [x, y] = p.split(',')
                          return <circle key={i} cx={x} cy={y} r="3" fill="#00ff88"/>
                        })}
                      </>
                    )
                  })()}
                </svg>
                <div className="mt-6 overflow-hidden rounded-xl border border-[#1e1e30] divide-y divide-[#1e1e30]">
                  <div className="grid grid-cols-[1fr_120px_120px] items-center px-3 py-2 text-[10px] uppercase tracking-wider text-[#55556a]">
                    <span>Mês</span>
                    <span className="text-right">Patrimônio</span>
                    <span className="text-right">Variação</span>
                  </div>
                  {sparkData.map((v, i) => {
                    const m = todayMonth - (sparkData.length - 1 - i)
                    const y = todayYear + Math.floor((m - 1) / 12)
                    const mm = ((m - 1) % 12 + 12) % 12 + 1
                    const prev = i > 0 ? sparkData[i - 1] : v
                    const delta = v - prev
                    return (
                      <div key={i} className="grid grid-cols-[1fr_120px_120px] items-center px-3 py-2 text-xs v2-row-hover">
                        <span className="text-[#8888aa]">{monthName(mm)} {y}</span>
                        <span className="v2-num text-right">{formatBRL(v, true)}</span>
                        <span className="v2-num text-right" style={{ color: delta >= 0 ? '#00ff88' : '#ff4466' }}>
                          {i === 0 ? '—' : `${delta >= 0 ? '+' : ''}${formatBRL(delta, true)}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between mb-1 pr-9">
              <div>
                <p className="v2-caption">Evolução do patrimônio</p>
                <p className="text-sm text-[#8888aa] mt-0.5">12 meses · estimativa baseada em aportes/resgates</p>
              </div>
            </div>
            <svg viewBox="0 0 600 200" className="w-full h-48 mt-3" preserveAspectRatio="none">
              <defs>
                <linearGradient id="trendArea" x1="0" x2="0" y1="0" y2="1">
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
                    <path d={`M${pts.join(' L')} L600,200 L0,200 Z`} fill="url(#trendArea)"/>
                    <path d={`M${pts.join(' L')}`} fill="none" stroke="#00ff88" strokeWidth="2"/>
                  </>
                )
              })()}
            </svg>
            <div className="mt-3 grid grid-cols-3 gap-3 pt-3 border-t border-[#1e1e30]">
              <div>
                <p className="v2-caption">Atual</p>
                <p className="v2-num text-base font-bold mt-0.5">{formatBRL(netWorthBRL, true)}</p>
              </div>
              <div>
                <p className="v2-caption">12m atrás</p>
                <p className="v2-num text-base font-bold mt-0.5 text-[#8888aa]">{formatBRL(sparkData[0] ?? 0, true)}</p>
              </div>
              <div>
                <p className="v2-caption">Variação</p>
                <p className="v2-num text-base font-bold mt-0.5" style={{ color: netWorthBRL >= (sparkData[0] ?? 0) ? '#00ff88' : '#ff4466' }}>
                  {netWorthBRL >= (sparkData[0] ?? 0) ? '+' : ''}{formatBRL(netWorthBRL - (sparkData[0] ?? 0), true)}
                </p>
              </div>
            </div>
          </ExpandableCard>

          {/* Pyramid + tier labels */}
          <ExpandableCard
            title="Pirâmide patrimonial · Brasil"
            subtitle={`Você está em ${tier.name} (${tier.bracketLabel})`}
            modalSize="lg"
            detail={
              <div>
                <p className="text-xs text-[#8888aa] mb-4">
                  Posição estimada do seu patrimônio na distribuição de riqueza brasileira.
                  Faltam <span className="v2-num font-semibold text-white">{nextTier ? formatBRL(distanceToNext, true) : '—'}</span>{' '}
                  para alcançar <span className="font-semibold text-white">{nextTier?.name ?? 'o topo'}</span>.
                </p>
                <div className="space-y-2">
                  {PYRAMID_TIERS.map((t, i) => {
                    const isCurrent = i === tierIdx
                    const isApex = i === 0
                    return (
                      <div key={t.key} className="flex items-center gap-3 p-3 rounded-xl border" style={{
                        borderColor: isApex ? 'rgba(255,154,63,.35)' : isCurrent ? 'rgba(0,212,255,.35)' : '#1e1e30',
                        background: isApex ? 'rgba(255,154,63,.05)' : isCurrent ? 'rgba(0,212,255,.05)' : '#0a0a0f',
                      }}>
                        <span className="v2-num text-2xl font-bold w-8 text-center" style={{ color: isApex ? '#ffc857' : isCurrent ? '#00d4ff' : '#55556a' }}>
                          {6 - i}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: isApex ? '#ffc857' : isCurrent ? '#e8e8f0' : '#8888aa' }}>
                            {isApex ? '⭐ ' : ''}{t.name}{isCurrent ? ' · você' : ''}
                          </p>
                          <p className="text-[11px] text-[#55556a]">{t.percentile} da população adulta · {t.bracketLabel}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="mt-4 text-[10px] text-[#55556a] leading-tight">
                  Estimativas: IBGE PNAD 2023 · WID.world BR 2022 · Credit Suisse 2023 · IRPF 2023.
                  Distribuição aproximada do patrimônio líquido por adulto. Referência informativa.
                </p>
              </div>
            }
          >
            <div className="flex items-center justify-between mb-1 pr-9">
              <div>
                <p className="v2-caption">Pirâmide patrimonial · BR</p>
                <p className="text-sm text-[#8888aa] mt-0.5">Você está em {tier.name}</p>
              </div>
            </div>
            <div className="mt-4 flex items-stretch gap-3">
              <div className="relative flex-shrink-0 w-[140px]">
                <svg viewBox="0 0 240 200" className="w-full h-auto">
                  <defs>
                    <linearGradient id="apexGold" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ffc857"/>
                      <stop offset="55%" stopColor="#ff9a3f"/>
                      <stop offset="100%" stopColor="#ff7a00"/>
                    </linearGradient>
                  </defs>
                  {pyramidLayers.map((layer, i) => {
                    const isApex = i === 0
                    const isCurrent = i === tierIdx
                    return (
                      <polygon
                        key={i}
                        points={layer.points}
                        className={isApex ? 'v2-pyr-apex' : ''}
                        fill={isApex ? 'url(#apexGold)' : isCurrent ? 'rgba(0,212,255,0.20)' : '#1e1e30'}
                        stroke={isCurrent ? '#00d4ff' : 'transparent'}
                        strokeWidth={isCurrent ? '1' : '0'}
                      />
                    )
                  })}
                </svg>
              </div>
              <div className="flex-1 min-w-0 grid grid-rows-6 text-[10px] gap-0.5">
                {PYRAMID_TIERS.map((t, i) => {
                  const isApex = i === 0
                  const isCurrent = i === tierIdx
                  const color = isApex ? '#ff9a3f' : isCurrent ? '#00d4ff' : '#55556a'
                  return (
                    <div key={t.key} className="flex items-center gap-1.5 border-l-2 pl-2 min-w-0" style={{ borderColor: color }}>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate" style={{ color: isApex ? '#ffc857' : isCurrent ? '#e8e8f0' : '#8888aa', fontSize: '11px' }}>
                          {isApex ? 'META · ' : ''}{t.name} <span className="text-[#55556a] font-normal">· {t.percentile}</span>
                        </p>
                        <p className="v2-num text-[10px] text-[#55556a] truncate">{t.bracketLabel}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <p className="mt-3 text-[9px] text-[#55556a] leading-tight">
              Estimativas: IBGE PNAD 2023 · WID.world BR 2022 · Credit Suisse 2023 · IRPF 2023
            </p>
          </ExpandableCard>

          {/* Allocation bars */}
          <ExpandableCard
            title="Alocação por classe · todas"
            subtitle={`${allAllocation.length} classes · ${formatBRL(netWorthBRL, true)} totais`}
            modalSize="lg"
            detail={
              <div className="space-y-3">
                {allAllocation.length === 0 ? (
                  <p className="text-xs text-[#55556a] text-center py-8">Adicione investimentos para ver a alocação.</p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-[#1e1e30] divide-y divide-[#1e1e30]">
                    <div className="grid grid-cols-[1fr_120px_80px] items-center px-3 py-2 text-[10px] uppercase tracking-wider text-[#55556a]">
                      <span>Classe</span>
                      <span className="text-right">Valor</span>
                      <span className="text-right">% carteira</span>
                    </div>
                    {allAllocation.map(a => (
                      <div key={a.name} className="grid grid-cols-[1fr_120px_80px] items-center px-3 py-3 text-xs v2-row-hover">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.color }}/>
                          <span className="font-medium truncate">{a.name}</span>
                        </span>
                        <span className="v2-num text-right font-semibold">{formatBRL(a.value, true)}</span>
                        <span className="v2-num text-right" style={{ color: a.color }}>{a.pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => navigate(pfPath('/wealth'))} className="w-full mt-3 px-3 py-2.5 rounded-xl text-xs font-semibold border border-[#1e1e30] bg-[#0f1018] text-[#00d4ff] hover:border-[#00d4ff]/40">
                  Ver detalhes em Investimentos →
                </button>
              </div>
            }
          >
            <div className="flex items-center justify-between mb-1 pr-9">
              <p className="v2-caption">Alocação por classe</p>
            </div>
            <p className="text-sm text-[#8888aa] mt-0.5">{allocation.length} classes principais</p>
            <div className="mt-4 space-y-3">
              {allocation.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Adicione investimentos para ver a alocação.</p>
              ) : allocation.map(a => (
                <div key={a.name}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.color }}/>
                      <span className="font-medium truncate">{a.name}</span>
                    </span>
                    <span className="v2-num font-semibold flex-shrink-0">{a.pct.toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(a.pct, 1)}%`, background: a.color }}/>
                  </div>
                </div>
              ))}
            </div>
          </ExpandableCard>

          {/* Top movers (large) */}
          <ExpandableCard
            gridClass="lg:col-span-2"
            title="Top movers · todos os ativos"
            subtitle={`${allMovers.length} ativos ranqueados pelo impacto absoluto no patrimônio`}
            modalSize="xl"
            detail={
              allMovers.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Adicione investimentos para ver os movimentos.</p>
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
                    {allMovers.map((m, i) => (
                      <div key={m.id} className="grid grid-cols-[40px_1fr_120px_140px_120px] items-center px-3 py-2.5 text-xs v2-row-hover">
                        <span className="text-[#55556a] v2-num">{i + 1}</span>
                        <span className="min-w-0">
                          <span className="block font-semibold truncate flex items-center gap-2">
                            {m.ticker || m.name}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 font-mono">{m.institution}</span>
                          </span>
                          <span className="text-[10px] text-[#55556a]">{m.assetClass}</span>
                        </span>
                        <span className="v2-num text-right font-semibold">{formatBRL(m.current, true)}</span>
                        <span className="v2-num text-right font-bold" style={{ color: m.gain >= 0 ? '#00ff88' : '#ff4466' }}>
                          {m.gain >= 0 ? '+' : ''}{formatBRL(m.gain, true)}
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
                <p className="v2-caption">Top movers</p>
                <p className="text-sm text-[#8888aa] mt-0.5">Maiores impactos absolutos no patrimônio</p>
              </div>
            </div>
            {topMovers.length === 0 ? (
              <p className="text-xs text-[#55556a] text-center py-8">Adicione investimentos para ver os movimentos.</p>
            ) : (
              <div className="space-y-1">
                {topMovers.map((m, i) => (
                  <div key={m.id} className="v2-row-hover flex items-center gap-3 px-2 py-2 rounded-lg">
                    <span className="text-xs text-[#55556a] w-4 v2-num">{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-semibold truncate flex items-center gap-2">
                        {m.ticker || m.name}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 font-mono">{m.institution}</span>
                      </span>
                      <span className="text-[11px] text-[#55556a]">{m.assetClass}</span>
                    </span>
                    <span className="text-right whitespace-nowrap">
                      <span className="v2-num text-sm font-bold block" style={{ color: m.gain >= 0 ? '#00ff88' : '#ff4466' }}>
                        {m.gain >= 0 ? '+' : ''}{formatBRL(m.gain, true)}
                      </span>
                      <span className="v2-num text-[10px]" style={{ color: m.pct >= 0 ? '#00ff88' : '#ff4466' }}>
                        {m.pct >= 0 ? '+' : ''}{m.pct.toFixed(1)}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ExpandableCard>

          {/* Coming up */}
          <ExpandableCard
            title="Próximos lançamentos · 60 dias"
            subtitle={`${allComingUp.length} eventos · ${formatBRL(allComingUp.filter(c => c.type === 'expense').reduce((s, c) => s + c.amount, 0), true)} em despesas previstas`}
            modalSize="lg"
            detail={
              allComingUp.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Cadastre recorrências em Receitas e Despesas para ver aqui.</p>
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
            <div className="flex items-center justify-between pr-9">
              <div>
                <p className="v2-caption">Próximos 14 dias</p>
                <p className="text-sm text-[#8888aa] mt-0.5">{comingUp.length} lançamentos previstos</p>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              {comingUp.length === 0 ? (
                <p className="text-[11px] text-[#55556a] text-center py-4">Cadastre recorrências em Receitas e Despesas para ver aqui.</p>
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

      </div>

      <FabMenu onPrimary={() => setShowAddTx(true)} />

      <AddTransactionModal open={showAddTx} onClose={() => setShowAddTx(false)} />
      <InvestmentModal    open={showAddInv} onClose={() => setShowAddInv(false)} />
    </div>
  )
}

