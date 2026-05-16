import React, { useEffect, useState, useCallback } from 'react'
import {
  Users, TrendingUp, CreditCard, AlertTriangle, RefreshCw,
  CheckCircle, Clock, XCircle, Crown, BarChart2, Activity,
  ChevronDown, ChevronUp, ExternalLink, Shield, Settings2, Save, RotateCcw,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { clsx } from 'clsx'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Summary {
  total: number; active: number; trialing: number; pastDue: number
  canceled: number; noPlan: number
  monthly: number; annual: number; lifetime: number
  mrr: number; arr: number
  dau: number; wau: number; mau: number
}
interface WeekBucket   { week: string; count: number }
interface MonthBucket  { month: string; count: number }
interface Subscriber   {
  email: string; plan: string | null; status: string
  period_end: string | null; trial_end: string | null
  created_at: string; last_sign_in_at: string | null
  stripe_customer_id: string | null
}
interface RecentUser   {
  email: string; created_at: string; last_sign_in_at: string | null
  subscription_status: string; subscription_plan: string | null; period_end: string | null
}
interface Upcoming     { email: string; plan: string | null; status: string; period_end: string | null }
interface AdminData    {
  summary: Summary; weeklySignups: WeekBucket[]; monthlySignups: MonthBucket[]
  upcoming: Upcoming[]; recentUsers: RecentUser[]; subscribers: Subscriber[]
  generatedAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number, decimals = 0) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

const fmtBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })

const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const fmtDateTime = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'ontem'
  if (diff < 7)  return `${diff}d atrás`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const daysUntil = (iso: string | null) => {
  if (!iso) return null
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
  return diff
}

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  active:    { label: 'Ativo',       color: '#00ff88', Icon: CheckCircle },
  trialing:  { label: 'Trial',       color: '#00d4ff', Icon: Clock       },
  past_due:  { label: 'Inadimpl.',   color: '#f59e0b', Icon: AlertTriangle },
  canceled:  { label: 'Cancelado',   color: '#ff4466', Icon: XCircle     },
  none:      { label: 'Sem plano',   color: '#55556a', Icon: Users       },
}

const PLAN_LABEL: Record<string, string> = {
  monthly: 'Mensal', annual: 'Anual', lifetime: 'Vitalício',
}

const PLAN_COLORS: Record<string, string> = {
  monthly: '#00d4ff', annual: '#ff7a00', lifetime: '#8b5cf6',
}

const CHART_TOOLTIP = {
  contentStyle: { background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 8, fontSize: 12, color: '#fff' },
  itemStyle: { color: '#fff' }, labelStyle: { color: '#e8e8f0', fontWeight: 600 },
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, Icon }: {
  label: string; value: string | number; sub?: string; color: string; Icon: React.ElementType
}) {
  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <p className="text-[10px] uppercase tracking-widest text-[#8888aa] font-semibold">{label}</p>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: color + '18', border: `1px solid ${color}30` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-bold tracking-tight" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-[#55556a]">{sub}</p>}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['none']
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
      style={{ background: cfg.color + '18', color: cfg.color, border: `1px solid ${cfg.color}30` }}>
      <cfg.Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  )
}

function PlanBadge({ plan }: { plan: string | null }) {
  if (!plan) return <span className="text-[#55556a] text-xs">—</span>
  const color = PLAN_COLORS[plan] ?? '#8888aa'
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
      style={{ background: color + '18', color, border: `1px solid ${color}30` }}>
      {PLAN_LABEL[plan] ?? plan}
    </span>
  )
}

// ─── Suitability target defaults (mirrors suitability.ts) ───────────────────
type RawTargets = Record<string, [number, number, number, number]>
const SUIT_PROFILES = ['Conservador', 'Moderado', 'Arrojado', 'Agressivo'] as const
const LOCAL_RAW_DEFAULT: RawTargets = {
  'Pós-Fixado':               [76,   42,    25,   18  ],
  'Prefixado':                [1,    4,     7,    7.5 ],
  'IPCA Juro Real (Curto)':   [12,   17,    13,   9.5 ],
  'IPCA Juro Real (Longo)':   [1,    5,     11,   15  ],
  'Renda Fixa Ativo':         [3,    3,     0,    0   ],
  'Multimercados':            [7,    8,     12,   10  ],
  'RV Ibovespa':              [0,    4,     6,    13  ],
  'RV S&P (BRL)':             [0,    3,     6,    7   ],
  'Alt. Crédito Estruturado': [0,    10,    10,   9   ],
  'Alt. FII (Tijolo)':        [0,    4,     6,    6   ],
  'Alt. PE/VC/Real Assets':   [0,    0,     4,    5   ],
}
const INTL_RAW_DEFAULT: RawTargets = {
  'Cash/CD':              [10,   5,     4,    3   ],
  'US Treasury':          [22,   12.5,  6,    2.5 ],
  'US Investment Grade':  [10,   7.5,   5,    3   ],
  'Developed Govt/Corp':  [38,   28,    13.5, 5.5 ],
  'US High Yield':        [8,    2,     2,    2.5 ],
  'EM Govt/Corp':         [12,   5,     6,    6   ],
  'RV US':                [0,    6,     12,   18  ],
  'RV Europe':            [0,    5,     8.5,  10.5],
  'RV Asia':              [0,    3.5,   5.5,  7   ],
  'RV Emerging':          [0,    4.5,   8,    10.5],
  'Commodities':          [0,    1.5,   2,    2   ],
  'Gold':                 [0,    3,     3,    3   ],
  'Crypto':               [0,    0,     0,    1.5 ],
  'Hedge Funds':          [0,    7,     8.5,  6   ],
  'Private Credit':       [0,    3,     4,    4   ],
  'Private Real Estate':  [0,    2,     3,    3   ],
  'Private Equity':       [0,    4.5,   9,    12  ],
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Admin() {
  const [data,    setData]    = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [subSort, setSubSort] = useState<'status' | 'plan' | 'created' | 'renewal'>('status')
  const [subDir,  setSubDir]  = useState<'asc' | 'desc'>('asc')
  const [subOpen, setSubOpen] = useState(true)
  const [recOpen, setRecOpen] = useState(true)

  // ── Suitability editor ────────────────────────────────────────────────────
  const [suitOpen,   setSuitOpen]   = useState(false)
  const [suitTab,    setSuitTab]    = useState<'onshore' | 'offshore'>('onshore')
  const [localRaw,   setLocalRaw]   = useState<RawTargets>(LOCAL_RAW_DEFAULT)
  const [intlRaw,    setIntlRaw]    = useState<RawTargets>(INTL_RAW_DEFAULT)
  const [suitSaving, setSuitSaving] = useState(false)
  const [suitMsg,    setSuitMsg]    = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    async function loadTargets() {
      try {
        const { data: row } = await supabase
          .from('admin_config')
          .select('value')
          .eq('key', 'suitability_targets')
          .single()
        if (row?.value) {
          if (row.value.local) setLocalRaw(row.value.local as RawTargets)
          if (row.value.intl)  setIntlRaw(row.value.intl as RawTargets)
        }
      } catch { /* table may not exist yet */ }
    }
    loadTargets()
  }, [])

  const handleSuitSave = async () => {
    setSuitSaving(true); setSuitMsg(null)
    try {
      const { error: err } = await supabase
        .from('admin_config')
        .upsert({ key: 'suitability_targets', value: { local: localRaw, intl: intlRaw }, updated_at: new Date().toISOString() })
      if (err) throw err
      setSuitMsg({ type: 'ok', text: 'Alvos salvos! Usuários verão as recomendações atualizadas.' })
    } catch (e) {
      setSuitMsg({ type: 'err', text: `Erro: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setSuitSaving(false)
    }
  }

  const handleSuitReset = (scope: 'onshore' | 'offshore') => {
    if (scope === 'onshore') setLocalRaw({ ...LOCAL_RAW_DEFAULT })
    else setIntlRaw({ ...INTL_RAW_DEFAULT })
    setSuitMsg(null)
  }

  const updateCell = (
    scope: 'onshore' | 'offshore',
    cls: string,
    profileIdx: number,
    val: number,
  ) => {
    if (scope === 'onshore') {
      setLocalRaw(prev => {
        const row = [...(prev[cls] ?? [0, 0, 0, 0])] as [number, number, number, number]
        row[profileIdx] = val
        return { ...prev, [cls]: row }
      })
    } else {
      setIntlRaw(prev => {
        const row = [...(prev[cls] ?? [0, 0, 0, 0])] as [number, number, number, number]
        row[profileIdx] = val
        return { ...prev, [cls]: row }
      })
    }
    setSuitMsg(null)
  }

  const colSums = (raw: RawTargets) =>
    SUIT_PROFILES.map((_, i) => Object.values(raw).reduce((s, r) => s + (r[i] ?? 0), 0))

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Não autenticado — faça login novamente')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL não configurada')

      const fnUrl = `${supabaseUrl}/functions/v1/admin-stats`
      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!resp.ok) {
        let body = ''
        try { body = await resp.text() } catch { /* ignore */ }
        throw new Error(`HTTP ${resp.status} — ${body || resp.statusText}`)
      }

      const res = await resp.json()
      setData(res as AdminData)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <RefreshCw className="w-6 h-6 text-[#ff7a00] animate-spin" />
        <p className="text-sm text-[#8888aa]">Carregando dados…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="card p-8 max-w-md text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-[#f59e0b] mx-auto" />
        <p className="text-sm text-[#e8e8f0] font-semibold">Erro ao carregar</p>
        <p className="text-xs text-[#55556a]">{error}</p>
        <button onClick={load} className="btn-primary text-xs px-4 py-2">Tentar novamente</button>
      </div>
    </div>
  )

  if (!data) return null

  const { summary, weeklySignups, monthlySignups, upcoming, recentUsers, subscribers, generatedAt } = data

  // Plan breakdown pie
  const planPieData = [
    { name: 'Mensal',    value: summary.monthly,  color: '#00d4ff' },
    { name: 'Anual',     value: summary.annual,   color: '#ff7a00' },
    { name: 'Vitalício', value: summary.lifetime, color: '#8b5cf6' },
  ].filter(d => d.value > 0)

  // Status breakdown pie
  const statusPieData = [
    { name: 'Ativo',      value: summary.active,   color: '#00ff88' },
    { name: 'Trial',      value: summary.trialing, color: '#00d4ff' },
    { name: 'Inadimpl.',  value: summary.pastDue,  color: '#f59e0b' },
    { name: 'Sem plano',  value: summary.noPlan,   color: '#2a2a3e' },
    { name: 'Cancelado',  value: summary.canceled, color: '#ff4466' },
  ].filter(d => d.value > 0)

  // Sort subscribers
  const sortedSubs = [...subscribers].sort((a, b) => {
    let cmp = 0
    if (subSort === 'status')  cmp = a.status.localeCompare(b.status)
    if (subSort === 'plan')    cmp = (a.plan ?? '').localeCompare(b.plan ?? '')
    if (subSort === 'created') cmp = a.created_at.localeCompare(b.created_at)
    if (subSort === 'renewal') cmp = (a.period_end ?? '').localeCompare(b.period_end ?? '')
    return subDir === 'asc' ? cmp : -cmp
  })

  const toggleSort = (field: typeof subSort) => {
    if (subSort === field) setSubDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSubSort(field); setSubDir('asc') }
  }

  const SortIcon = ({ field }: { field: typeof subSort }) =>
    subSort === field
      ? (subDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
      : <ChevronDown className="w-3 h-3 opacity-30" />

  return (
    <div className="min-h-screen animate-fade-in pb-12">
      {/* Header */}
      <div className="px-4 sm:px-6 py-5 border-b border-[#1e1e2e] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#ff7a00]/10 border border-[#ff7a00]/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-[#ff7a00]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#e8e8f0]">Admin Dashboard</h1>
            <p className="text-[10px] text-[#55556a]">Atualizado {fmtDateTime(generatedAt)}</p>
          </div>
        </div>
        <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-xs px-3 py-2">
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      <div className="p-4 sm:p-6 space-y-6">

        {/* ── KPI Cards Row 1 — Revenue ───────────────────────────────────────── */}
        <div>
          <p className="text-[10px] text-[#55556a] uppercase tracking-widest font-semibold mb-3">Receita</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="MRR"  value={fmtBRL(summary.mrr)} sub="Receita Mensal Recorrente" color="#ff7a00" Icon={TrendingUp} />
            <KpiCard label="ARR"  value={fmtBRL(summary.arr)} sub="Receita Anual Recorrente"  color="#ff7a00" Icon={BarChart2}  />
            <KpiCard label="Assinantes Ativos" value={fmt(summary.active + summary.trialing)}
              sub={`${summary.active} ativos + ${summary.trialing} em trial`} color="#00ff88" Icon={CheckCircle} />
            <KpiCard label="Inadimplentes"  value={fmt(summary.pastDue)}
              sub="Past due — pagamento falhou" color="#f59e0b" Icon={AlertTriangle} />
          </div>
        </div>

        {/* ── KPI Cards Row 2 — Users ─────────────────────────────────────────── */}
        <div>
          <p className="text-[10px] text-[#55556a] uppercase tracking-widest font-semibold mb-3">Usuários</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Total de Usuários" value={fmt(summary.total)} sub="Cadastrados" color="#00d4ff" Icon={Users} />
            <KpiCard label="DAU" value={fmt(summary.dau)} sub="Ativos hoje"          color="#8b5cf6" Icon={Activity} />
            <KpiCard label="WAU" value={fmt(summary.wau)} sub="Ativos últimos 7d"    color="#8b5cf6" Icon={Activity} />
            <KpiCard label="MAU" value={fmt(summary.mau)} sub="Ativos últimos 30d"   color="#8b5cf6" Icon={Activity} />
          </div>
        </div>

        {/* ── KPI Cards Row 3 — Plans ─────────────────────────────────────────── */}
        <div>
          <p className="text-[10px] text-[#55556a] uppercase tracking-widest font-semibold mb-3">Planos</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Mensal"    value={fmt(summary.monthly)}  sub="R$ 20/mês"              color="#00d4ff" Icon={CreditCard} />
            <KpiCard label="Anual"     value={fmt(summary.annual)}   sub="R$ 200/ano (R$ 16,67/m)" color="#ff7a00" Icon={CreditCard} />
            <KpiCard label="Vitalício" value={fmt(summary.lifetime)} sub="R$ 350 único"            color="#8b5cf6" Icon={Crown}      />
            <KpiCard label="Sem plano" value={fmt(summary.noPlan)}   sub="Cadastrados sem assinar"  color="#55556a" Icon={Users}      />
          </div>
        </div>

        {/* ── Charts ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Sign-ups by month */}
          <div className="card p-4 lg:col-span-2">
            <p className="text-xs font-semibold text-[#e8e8f0] mb-4">Novos cadastros por mês</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlySignups} barSize={24}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8888aa' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#8888aa' }} axisLine={false} tickLine={false} width={28} />
                <Tooltip {...CHART_TOOLTIP} />
                <Bar dataKey="count" name="Cadastros" fill="#ff7a00" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Plan distribution */}
          <div className="card p-4">
            <p className="text-xs font-semibold text-[#e8e8f0] mb-4">Distribuição de planos</p>
            {planPieData.length === 0 ? (
              <p className="text-xs text-[#55556a] text-center py-8">Nenhum assinante</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={planPieData} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} minAngle={5}>
                    {planPieData.map(d => <Cell key={d.name} fill={d.color} stroke="#0a0a0f" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip {...CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#8888aa' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Status + Weekly sign-ups */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Status pie */}
          <div className="card p-4">
            <p className="text-xs font-semibold text-[#e8e8f0] mb-4">Status dos usuários</p>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={statusPieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} minAngle={3}>
                  {statusPieData.map(d => <Cell key={d.name} fill={d.color} stroke="#0a0a0f" strokeWidth={2} />)}
                </Pie>
                <Tooltip {...CHART_TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#8888aa' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Weekly sign-ups */}
          <div className="card p-4 lg:col-span-2">
            <p className="text-xs font-semibold text-[#e8e8f0] mb-4">Novos cadastros por semana (12 semanas)</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={weeklySignups} barSize={14}>
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#8888aa' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#8888aa' }} axisLine={false} tickLine={false} width={24} />
                <Tooltip {...CHART_TOOLTIP} />
                <Bar dataKey="count" name="Cadastros" fill="#00d4ff" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Upcoming renewals ──────────────────────────────────────────────── */}
        {upcoming.length > 0 && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-[#f59e0b]" />
              <p className="text-xs font-semibold text-[#e8e8f0]">Renovações nos próximos 30 dias</p>
              <span className="ml-auto text-[10px] bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 px-2 py-0.5 rounded-full font-semibold">
                {upcoming.length}
              </span>
            </div>
            <div className="space-y-2">
              {upcoming.map((u, i) => {
                const days = daysUntil(u.period_end)
                return (
                  <div key={i} className="flex items-center justify-between py-2 px-3 rounded-xl bg-[#16161f] border border-[#1e1e2e] text-xs">
                    <span className="text-[#e8e8f0] font-mono truncate mr-4">{u.email}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <PlanBadge plan={u.plan} />
                      <span className="text-[#55556a]">{fmtDate(u.period_end)}</span>
                      {days !== null && days <= 7 && (
                        <span className="text-[10px] text-[#f59e0b] font-semibold">{days}d</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Subscribers table ─────────────────────────────────────────────── */}
        <div className="card">
          <button onClick={() => setSubOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 border-b border-[#1e1e2e]">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#00ff88]" />
              <p className="text-sm font-semibold text-[#e8e8f0]">Assinantes</p>
              <span className="text-[10px] bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20 px-2 py-0.5 rounded-full font-semibold">
                {subscribers.length}
              </span>
            </div>
            {subOpen ? <ChevronUp className="w-4 h-4 text-[#55556a]" /> : <ChevronDown className="w-4 h-4 text-[#55556a]" />}
          </button>

          {subOpen && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e1e2e]">
                    {[
                      { label: 'Email',        field: null        as typeof subSort | null },
                      { label: 'Plano',        field: 'plan'      as typeof subSort },
                      { label: 'Status',       field: 'status'    as typeof subSort },
                      { label: 'Renovação',    field: 'renewal'   as typeof subSort },
                      { label: 'Cadastro',     field: 'created'   as typeof subSort },
                      { label: 'Último login', field: null        as typeof subSort | null },
                      { label: 'Stripe',       field: null        as typeof subSort | null },
                    ].map(({ label, field }) => (
                      <th key={label}
                        className={clsx('text-left px-4 py-3 text-[#55556a] font-semibold uppercase tracking-wider text-[10px]',
                          field && 'cursor-pointer hover:text-[#e8e8f0] select-none')}
                        onClick={() => field && toggleSort(field)}>
                        <span className="flex items-center gap-1">
                          {label} {field && <SortIcon field={field} />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedSubs.map((sub, i) => {
                    const days = daysUntil(sub.period_end)
                    const renewalUrgent = days !== null && days <= 7
                    return (
                      <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors">
                        <td className="px-4 py-2.5 text-[#e8e8f0] font-mono">{sub.email}</td>
                        <td className="px-4 py-2.5"><PlanBadge plan={sub.plan} /></td>
                        <td className="px-4 py-2.5"><StatusBadge status={sub.status} /></td>
                        <td className="px-4 py-2.5">
                          <span className={clsx('font-medium', renewalUrgent ? 'text-[#f59e0b]' : 'text-[#8888aa]')}>
                            {sub.status === 'trialing'
                              ? `Trial até ${fmtDate(sub.trial_end)}`
                              : fmtDate(sub.period_end)}
                          </span>
                          {renewalUrgent && <span className="ml-1 text-[#f59e0b]">({days}d)</span>}
                        </td>
                        <td className="px-4 py-2.5 text-[#55556a]">{fmtDate(sub.created_at)}</td>
                        <td className="px-4 py-2.5 text-[#55556a]">{fmtDateTime(sub.last_sign_in_at)}</td>
                        <td className="px-4 py-2.5">
                          {sub.stripe_customer_id ? (
                            <a
                              href={`https://dashboard.stripe.com/customers/${sub.stripe_customer_id}`}
                              target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[#00d4ff] hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" /> Ver
                            </a>
                          ) : <span className="text-[#2a2a3e]">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                  {sortedSubs.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-[#55556a]">Nenhum assinante</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Recent sign-ups ────────────────────────────────────────────────── */}
        <div className="card">
          <button onClick={() => setRecOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 border-b border-[#1e1e2e]">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#00d4ff]" />
              <p className="text-sm font-semibold text-[#e8e8f0]">Cadastros Recentes</p>
              <span className="text-[10px] bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 px-2 py-0.5 rounded-full font-semibold">
                últimos 20
              </span>
            </div>
            {recOpen ? <ChevronUp className="w-4 h-4 text-[#55556a]" /> : <ChevronDown className="w-4 h-4 text-[#55556a]" />}
          </button>

          {recOpen && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e1e2e]">
                    {['Email', 'Cadastro', 'Último login', 'Status', 'Plano', 'Renova em'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[#55556a] font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentUsers.map((u, i) => (
                    <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors">
                      <td className="px-4 py-2.5 text-[#e8e8f0] font-mono">{u.email}</td>
                      <td className="px-4 py-2.5 text-[#8888aa]">{fmtDateTime(u.created_at)}</td>
                      <td className="px-4 py-2.5 text-[#55556a]">{fmtDateTime(u.last_sign_in_at)}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={u.subscription_status} /></td>
                      <td className="px-4 py-2.5"><PlanBadge plan={u.subscription_plan} /></td>
                      <td className="px-4 py-2.5 text-[#55556a]">{fmtDate(u.period_end)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Suitability Targets Editor ─────────────────────────────────── */}
        <div className="card">
          <button onClick={() => setSuitOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 border-b border-[#1e1e2e]">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-[#8b5cf6]" />
              <p className="text-sm font-semibold text-[#e8e8f0]">Alocação Recomendada · Suitability</p>
              <span className="text-[10px] bg-[#8b5cf6]/10 text-[#8b5cf6] border border-[#8b5cf6]/20 px-2 py-0.5 rounded-full font-semibold">
                Admin
              </span>
            </div>
            {suitOpen ? <ChevronUp className="w-4 h-4 text-[#55556a]" /> : <ChevronDown className="w-4 h-4 text-[#55556a]" />}
          </button>

          {suitOpen && (
            <div className="p-5 space-y-4">
              <p className="text-xs text-[#8888aa] leading-relaxed">
                Edite os percentuais alvo por classe de ativo e perfil de suitability.
                Cada coluna deve somar <strong className="text-[#e8e8f0]">100%</strong>.
                Alterações são salvas na tabela <code className="text-[#00d4ff] text-[10px]">admin_config</code>.
              </p>

              {/* Tab: Onshore / Offshore */}
              <div className="flex gap-2">
                {(['onshore', 'offshore'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setSuitTab(tab)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      suitTab === tab
                        ? 'bg-[#8b5cf6] text-white'
                        : 'bg-[#16161f] text-[#8888aa] border border-[#1e1e2e] hover:border-[#8b5cf6]/40'
                    }`}
                  >
                    {tab === 'onshore' ? 'Onshore (BRL)' : 'Offshore (USD)'}
                  </button>
                ))}
              </div>

              {/* Grid editor */}
              {(() => {
                const raw = suitTab === 'onshore' ? localRaw : intlRaw
                const sums = colSums(raw)
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[560px]">
                      <thead>
                        <tr className="border-b border-[#1e1e2e]">
                          <th className="text-left px-3 py-2 text-[#55556a] font-semibold uppercase tracking-wider text-[10px] w-44">Classe</th>
                          {SUIT_PROFILES.map(p => (
                            <th key={p} className="text-center px-2 py-2 text-[#55556a] font-semibold uppercase tracking-wider text-[10px] w-28">{p}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(raw).map(([cls, vals]) => (
                          <tr key={cls} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors">
                            <td className="px-3 py-1.5 text-[#e8e8f0] font-medium">{cls}</td>
                            {vals.map((v, pi) => (
                              <td key={pi} className="px-2 py-1.5 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.5}
                                  value={v}
                                  onChange={e => updateCell(suitTab, cls, pi, parseFloat(e.target.value) || 0)}
                                  className="w-20 text-center px-1.5 py-1 rounded-md bg-[#0a0a0f] border border-[#1e1e2e] text-[#e8e8f0] text-xs focus:outline-none focus:border-[#8b5cf6]/60 v2-num"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[#1e1e2e]">
                          <td className="px-3 py-2 text-[#55556a] font-semibold text-[10px] uppercase">Soma</td>
                          {sums.map((s, i) => (
                            <td key={i} className="px-2 py-2 text-center">
                              <span className={`v2-num text-sm font-bold ${Math.abs(s - 100) < 0.1 ? 'text-[#00ff88]' : 'text-[#f59e0b]'}`}>
                                {s.toFixed(1)}%
                              </span>
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              })()}

              {/* Actions */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleSuitSave}
                  disabled={suitSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#8b5cf6] text-white hover:bg-[#7c3aed] disabled:opacity-50 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  {suitSaving ? 'Salvando…' : 'Salvar alvos'}
                </button>
                <button
                  onClick={() => handleSuitReset(suitTab)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-[#1e1e2e] bg-[#0a0a0f] text-[#8888aa] hover:border-[#55556a] transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Resetar {suitTab === 'onshore' ? 'Onshore' : 'Offshore'}
                </button>
                {suitMsg && (
                  <span className={`text-xs font-medium ${suitMsg.type === 'ok' ? 'text-[#00ff88]' : 'text-[#ff4466]'}`}>
                    {suitMsg.text}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
