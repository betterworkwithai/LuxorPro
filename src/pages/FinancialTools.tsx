import React, { useState, useMemo, useCallback } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { ChevronDown, ChevronUp, Lock, LockOpen, RotateCcw } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { formatBRL } from '../lib/formatters'
import { clsx } from 'clsx'

// ─── IRR via Newton-Raphson ──────────────────────────────────────────────────
function calcIRR(cashflows: number[], guess = 0.1): number | null {
  let r = guess
  for (let i = 0; i < 100; i++) {
    const npv  = cashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0)
    const dnpv = cashflows.reduce((s, cf, t) => s - t * cf / Math.pow(1 + r, t + 1), 0)
    if (Math.abs(dnpv) < 1e-10) break
    const r2 = r - npv / dnpv
    if (Math.abs(r2 - r) < 1e-7) return r2 * 100
    r = r2
  }
  return null
}

// ─── NPV ─────────────────────────────────────────────────────────────────────
function calcNPV(cashflows: number[], rate: number): number {
  return cashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + rate / 100, t), 0)
}

// ─── CET approximation via Newton-Raphson ────────────────────────────────────
function calcCET(pv: number, pmt: number, n: number): number | null {
  // solve: pv = pmt * (1 - (1+r)^-n) / r
  return calcIRR([-pv, ...Array(n).fill(pmt)])
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'tvm',      label: 'TVM — Valor do Dinheiro' },
  { id: 'npv',      label: 'VPL / TIR' },
  { id: 'loan',     label: 'SAC vs Price' },
  { id: 'savings',  label: 'Simulador de Aportes' },
]

// ─── Shared input style ───────────────────────────────────────────────────────
const inputCls = 'w-full bg-[#12121a] border border-[#1e1e2e] rounded-xl px-3 py-2 text-sm text-[#e8e8f0] placeholder-[#55556a] focus:outline-none focus:border-[#ff7a00]/50 transition-colors'
const labelCls = 'block text-xs font-medium text-[#8888aa] mb-1'
const resultBox = 'bg-[#ff7a00]/10 border border-[#ff7a00]/20 rounded-xl p-4 space-y-2'

// ─────────────────────────────────────────────────────────────────────────────
// TVM math helpers
// ─────────────────────────────────────────────────────────────────────────────
function solveFV(pv: number, i: number, n: number, pmt: number): number {
  if (i === 0) return pv + pmt * n
  return pv * Math.pow(1 + i, n) + pmt * (Math.pow(1 + i, n) - 1) / i
}
function solvePV(fv: number, i: number, n: number, pmt: number): number {
  if (i === 0) return fv - pmt * n
  return (fv - pmt * (Math.pow(1 + i, n) - 1) / i) / Math.pow(1 + i, n)
}
function solvePMT(fv: number, pv: number, i: number, n: number): number {
  if (n === 0) return 0
  if (i === 0) return (fv - pv) / n
  return (fv - pv * Math.pow(1 + i, n)) * i / (Math.pow(1 + i, n) - 1)
}
function solveNPER(fv: number, pv: number, i: number, pmt: number): number {
  if (pmt === 0) {
    if (i === 0 || fv <= 0 || pv <= 0) return NaN
    return Math.log(fv / pv) / Math.log(1 + i)
  }
  // Newton-Raphson on n
  let n = 12
  for (let k = 0; k < 200; k++) {
    const fn = pv * Math.pow(1 + i, n) + pmt * (Math.pow(1 + i, n) - 1) / i - fv
    const dfn = pv * Math.log(1 + i) * Math.pow(1 + i, n) + pmt * Math.log(1 + i) * Math.pow(1 + i, n) / i
    if (Math.abs(dfn) < 1e-12) break
    const n2 = n - fn / dfn
    if (Math.abs(n2 - n) < 1e-10) return n2
    n = n2
  }
  return n
}
function solveRate(pv: number, fv: number, nper: number, pmt: number): number {
  if (pmt === 0) {
    if (pv <= 0 || fv <= 0 || nper === 0) return NaN
    return (Math.pow(fv / pv, 1 / nper) - 1) * 100
  }
  let r = 0.01
  for (let k = 0; k < 200; k++) {
    const fn  = pv * Math.pow(1 + r, nper) + pmt * (Math.pow(1 + r, nper) - 1) / r - fv
    const dfn = nper * pv * Math.pow(1 + r, nper - 1)
      + pmt * (nper * Math.pow(1 + r, nper - 1) * r - (Math.pow(1 + r, nper) - 1)) / (r * r)
    if (Math.abs(dfn) < 1e-12) break
    const r2 = r - fn / dfn
    if (Math.abs(r2 - r) < 1e-10) return r2 * 100
    r = Math.max(r2, -0.9999) // clamp to prevent negative divergence
  }
  return r * 100
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculator 1 — TVM Solver
// ─────────────────────────────────────────────────────────────────────────────
type TVMField = 'pv' | 'fv' | 'i' | 'nper' | 'pmt'

const TVM_LABELS: Record<TVMField, { label: string; hint: string; placeholder: string }> = {
  pv:   { label: 'PV — Valor Presente',      hint: 'Valor Presente (R$)',         placeholder: '100000' },
  fv:   { label: 'FV — Valor Futuro',        hint: 'Valor Futuro (R$)',           placeholder: '200000' },
  i:    { label: 'i — Taxa por Período (%)', hint: 'Taxa por Período (%)',        placeholder: '1.0' },
  nper: { label: 'NPER — Nº de Períodos',    hint: 'Número de Períodos',          placeholder: '24' },
  pmt:  { label: 'PMT — Pagamento',          hint: 'Pagamento por Período (R$)',  placeholder: '0' },
}

function TVMCalc() {
  // locked = user-editable; unlocked = calculated
  const [locked, setLocked] = useState<Record<TVMField, boolean>>({
    pv: true, fv: false, i: true, nper: true, pmt: true,
  })
  const [values, setValues] = useState<Record<TVMField, string>>({
    pv: '100000', fv: '', i: '1', nper: '24', pmt: '0',
  })

  const fields: TVMField[] = ['pv', 'fv', 'i', 'nper', 'pmt']

  const toggleLock = (field: TVMField) => {
    // Exactly one field must be unlocked (calculated). Enforce that constraint.
    const currentUnlocked = fields.filter(f => !locked[f])
    if (locked[field]) {
      // User wants to unlock this field → lock it and unlock the previously unlocked one
      // We swap: unlock this, lock the one that was unlocked
      if (currentUnlocked.length === 1) {
        const prevUnlocked = currentUnlocked[0]
        setLocked(prev => ({ ...prev, [field]: false, [prevUnlocked]: true }))
        // Clear the new calculated field
        setValues(prev => ({ ...prev, [field]: '' }))
      }
    } else {
      // Already unlocked — re-lock requires picking another to unlock
      // Do nothing if clicking the unlocked field (it's already unlocked)
    }
  }

  const computed = useMemo((): Partial<Record<TVMField, number>> => {
    const unlockedField = fields.find(f => !locked[f])
    if (!unlockedField) return {}
    const parse = (f: TVMField) => parseFloat(values[f].replace(',', '.'))
    const pv   = parse('pv')
    const fv   = parse('fv')
    const rate = parse('i')
    const nper = parse('nper')
    const pmt  = parse('pmt')

    const required = fields.filter(f => f !== unlockedField)
    if (required.some(f => isNaN(parse(f)))) return {}

    const i = rate / 100
    try {
      switch (unlockedField) {
        case 'fv':   return { fv:   solveFV(pv, i, nper, pmt) }
        case 'pv':   return { pv:   solvePV(fv, i, nper, pmt) }
        case 'pmt':  return { pmt:  solvePMT(fv, pv, i, nper) }
        case 'nper': return { nper: solveNPER(fv, pv, i, pmt) }
        case 'i':    return { i:    solveRate(pv, fv, nper, pmt) }
        default:     return {}
      }
    } catch {
      return {}
    }
  }, [locked, values])

  const unlockedField = fields.find(f => !locked[f])

  const reset = () => {
    setLocked({ pv: true, fv: false, i: true, nper: true, pmt: true })
    setValues({ pv: '100000', fv: '', i: '1', nper: '24', pmt: '0' })
  }

  const formatComputed = (field: TVMField, val: number) => {
    if (!isFinite(val) || isNaN(val)) return '—'
    if (field === 'i') return `${val.toFixed(4)}%`
    if (field === 'nper') return val.toFixed(2)
    return formatBRL(val)
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-[#8888aa]">
        Clique no cadeado para escolher qual variável calcular. O campo laranja é calculado automaticamente.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {fields.map(field => {
          const isUnlocked = !locked[field]
          const meta = TVM_LABELS[field]
          const computedVal = isUnlocked ? computed[field] : undefined

          return (
            <div key={field}
              className={clsx(
                'rounded-xl border p-3 space-y-2 transition-colors',
                isUnlocked
                  ? 'bg-orange-950/30 border-orange-500/50'
                  : 'bg-[#12121a] border-[#1e1e2e]',
              )}>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-[#8888aa] uppercase tracking-wider leading-tight">
                  {meta.label}
                </label>
                <button
                  onClick={() => toggleLock(field)}
                  title={isUnlocked ? 'Campo calculado — clique para trocar' : 'Clique para calcular este campo'}
                  className={clsx(
                    'w-6 h-6 rounded-lg flex items-center justify-center transition-colors flex-shrink-0',
                    isUnlocked
                      ? 'text-orange-400 hover:text-orange-300'
                      : 'text-[#55556a] hover:text-[#e8e8f0]',
                  )}>
                  {isUnlocked ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                </button>
              </div>

              {isUnlocked ? (
                <div className="min-h-[36px] flex items-center">
                  {computedVal !== undefined && isFinite(computedVal) ? (
                    <p className="text-sm font-bold text-orange-400">
                      {formatComputed(field, computedVal)}
                    </p>
                  ) : (
                    <p className="text-xs text-[#55556a] italic">Preencha os demais</p>
                  )}
                </div>
              ) : (
                <input
                  className={inputCls}
                  placeholder={meta.placeholder}
                  value={values[field]}
                  onChange={e => setValues(prev => ({ ...prev, [field]: e.target.value }))}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Results summary */}
      {unlockedField && computed[unlockedField] !== undefined && isFinite(computed[unlockedField]!) && (
        <div className={resultBox}>
          <p className="text-xs font-semibold text-[#ff7a00] uppercase tracking-wider">Resultado</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {fields.map(field => {
              const isCalc = field === unlockedField
              const rawVal = isCalc ? computed[field] : parseFloat(values[field].replace(',', '.'))
              const display = rawVal !== undefined && !isNaN(rawVal) ? formatComputed(field, rawVal) : '—'
              return (
                <div key={field}>
                  <p className="text-[10px] text-[#8888aa]">{TVM_LABELS[field].hint}</p>
                  <p className={clsx('text-sm font-bold', isCalc ? 'text-orange-400' : 'text-[#e8e8f0]')}>
                    {display}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Reset */}
      <button onClick={reset} className="flex items-center gap-1.5 text-xs text-[#55556a] hover:text-[#e8e8f0] transition-colors">
        <RotateCcw className="w-3.5 h-3.5" /> Limpar / Reset
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculator 2 — VPL / TIR
// ─────────────────────────────────────────────────────────────────────────────
function NPVCalc() {
  const [initial,    setInitial]   = useState('')
  const [discount,   setDiscount]  = useState('')
  const [mode,       setMode]      = useState<'monthly' | 'yearly'>('monthly')
  const [numPeriods, setNumPeriods] = useState('3')
  const [flows,      setFlows]     = useState<Record<number, string>>({})

  const switchMode = (m: 'monthly' | 'yearly') => { setMode(m); setFlows({}) }
  const setFlow = (i: number, v: string) => setFlows(f => ({ ...f, [i]: v }))

  const count = Math.min(12, Math.max(1, parseInt(numPeriods) || 1))
  const cashflowValues = Array.from({ length: count }, (_, i) => flows[i] ?? '')
  const periodLabel = mode === 'monthly' ? 'Mês' : 'Ano'
  const rateLabel = mode === 'monthly' ? 'Taxa de Desconto % ao mês (para VPL)' : 'Taxa de Desconto % ao ano (para VPL)'
  const tirLabel = mode === 'monthly' ? 'TIR (mensal)' : 'TIR (anual)'

  const result = useMemo(() => {
    const inv = parseFloat(initial.replace(',', '.'))
    const dr  = parseFloat(discount.replace(',', '.'))
    if (isNaN(inv) || inv <= 0) return null
    const parsed = cashflowValues.map(f => parseFloat(f.replace(',', '.') || '0'))
    const allFlows = [-inv, ...parsed]
    const npv = isNaN(dr) ? null : calcNPV(allFlows, dr)
    const irr = calcIRR(allFlows)
    return { npv, irr }
  }, [initial, discount, cashflowValues])

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(['monthly', 'yearly'] as const).map(m => (
          <button key={m} onClick={() => switchMode(m)}
            className={clsx('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              mode === m ? 'bg-[#ff7a00] text-white' : 'bg-[#1a1a2e] text-[#8888aa] hover:text-white border border-[#2a2a3e]')}>
            {m === 'monthly' ? 'Mensal' : 'Anual'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Investimento Inicial (R$)</label>
          <input className={inputCls} placeholder="50000" value={initial} onChange={e => setInitial(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>{rateLabel}</label>
          <input className={inputCls} placeholder="12" value={discount} onChange={e => setDiscount(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Número de períodos (máx. 12)</label>
          <input className={inputCls} type="number" min={1} max={12} placeholder="3"
            value={numPeriods} onChange={e => setNumPeriods(e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Fluxos de Caixa por Período</label>
        <div className="space-y-2">
          {cashflowValues.map((cf, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] text-[#55556a] w-16 flex-shrink-0">{periodLabel} {i + 1}</span>
              <input className={inputCls} placeholder="0" value={cf}
                onChange={e => setFlow(i, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      {result && (
        <div className={resultBox}>
          <p className="text-xs font-semibold text-[#ff7a00] uppercase tracking-wider">Resultado</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-[#8888aa]">VPL</p>
              {result.npv !== null ? (
                <p className={clsx('text-lg font-bold', result.npv >= 0 ? 'text-[#00ff88]' : 'text-[#ff4466]')}>
                  {formatBRL(result.npv)}
                </p>
              ) : (
                <p className="text-sm text-[#55556a]">Informe a taxa de desconto</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-[#8888aa]">{tirLabel}</p>
              {result.irr !== null ? (
                <p className="text-lg font-bold text-[#ff7a00]">{result.irr.toFixed(2)}%</p>
              ) : (
                <p className="text-sm text-[#55556a]">Não convergiu</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculator 3 — SAC vs Price
// ─────────────────────────────────────────────────────────────────────────────
interface AmortRow {
  period: number
  payment: number
  interest: number
  amortization: number
  balance: number
}

function LoanCalc() {
  const [loanAmt,   setLoanAmt]   = useState('')
  const [entrada,   setEntrada]   = useState('')
  const [rate,      setRate]      = useState('')
  const [rateUnit,  setRateUnit]  = useState<'am' | 'aa'>('am')
  const [prazo,     setPrazo]     = useState('')
  const [prazoUnit, setPrazoUnit] = useState<'meses' | 'anos'>('meses')
  const [residual,  setResidual]  = useState('')
  const [tipo,      setTipo]      = useState<'SAC' | 'Price'>('Price')
  const [expanded,  setExpanded]  = useState(false)

  const result = useMemo(() => {
    const loan    = parseFloat(loanAmt.replace(',', '.'))
    const down    = parseFloat(entrada.replace(',', '.') || '0')
    const r       = parseFloat(rate.replace(',', '.'))
    const prazoN  = parseInt(prazo)
    const balloon = parseFloat(residual.replace(',', '.') || '0')
    if (isNaN(loan) || isNaN(r) || isNaN(prazoN) || loan <= 0 || r <= 0 || prazoN <= 0) return null
    const pv     = loan - (isNaN(down) ? 0 : down)
    // Always work in months — convert inputs as needed
    const mrate  = rateUnit === 'aa' ? Math.pow(1 + r / 100, 1 / 12) - 1 : r / 100
    const n      = prazoUnit === 'anos' ? prazoN * 12 : prazoN
    const residPV = balloon > 0 ? balloon / Math.pow(1 + mrate, n) : 0

    const schedule: AmortRow[] = []

    if (tipo === 'SAC') {
      const amort = (pv - residPV) / n
      let balance = pv
      for (let t = 1; t <= n; t++) {
        const interest = balance * mrate
        const payment  = amort + interest
        balance -= amort
        if (t === n && balloon > 0) {
          schedule.push({ period: t, payment: payment + balloon, interest, amortization: amort + residPV, balance: 0 })
        } else {
          schedule.push({ period: t, payment, interest, amortization: amort, balance: Math.max(0, balance) })
        }
      }
    } else {
      // Price
      let pmt: number
      if (residPV > 0) {
        pmt = (pv - residPV) * mrate / (1 - Math.pow(1 + mrate, -n))
      } else {
        pmt = pv * mrate / (1 - Math.pow(1 + mrate, -n))
      }
      let balance = pv
      for (let t = 1; t <= n; t++) {
        const interest    = balance * mrate
        const amortization = pmt - interest
        balance -= amortization
        if (t === n && balloon > 0) {
          schedule.push({ period: t, payment: pmt + balloon, interest, amortization: amortization + residPV, balance: 0 })
        } else {
          schedule.push({ period: t, payment: pmt, interest, amortization, balance: Math.max(0, balance) })
        }
      }
    }

    const totalPago   = schedule.reduce((s, r) => s + r.payment, 0)
    const totalJuros  = schedule.reduce((s, r) => s + r.interest, 0)
    const primeira    = schedule[0]?.payment ?? 0
    const ultima      = schedule[schedule.length - 1]?.payment ?? 0

    // CET
    const cetMonthly = calcIRR([-pv, ...schedule.map(r => r.payment)])
    const cet = cetMonthly !== null ? cetMonthly : null

    return { schedule, totalPago, totalJuros, primeira, ultima, cet }
  }, [loanAmt, entrada, rate, rateUnit, prazo, prazoUnit, residual, tipo])

  const visibleRows = result
    ? (expanded ? result.schedule : result.schedule.slice(0, 12))
    : []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Valor do Empréstimo (R$)</label>
          <input className={inputCls} placeholder="200000" value={loanAmt} onChange={e => setLoanAmt(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Entrada (R$)</label>
          <input className={inputCls} placeholder="0" value={entrada} onChange={e => setEntrada(e.target.value)} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={labelCls + ' mb-0'}>Taxa de Juros (%)</label>
            <div className="flex rounded-lg overflow-hidden border border-[#1e1e2e] text-[10px] font-semibold">
              {(['am', 'aa'] as const).map(u => (
                <button key={u} onClick={() => setRateUnit(u)}
                  className={clsx('px-2 py-1 transition-colors',
                    rateUnit === u ? 'bg-[#ff7a00] text-white' : 'bg-[#12121a] text-[#55556a] hover:text-[#e8e8f0]')}>
                  {u === 'am' ? '% a.m.' : '% a.a.'}
                </button>
              ))}
            </div>
          </div>
          <input className={inputCls} placeholder={rateUnit === 'am' ? '1.2' : '14.5'} value={rate} onChange={e => setRate(e.target.value)} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={labelCls + ' mb-0'}>Prazo</label>
            <div className="flex rounded-lg overflow-hidden border border-[#1e1e2e] text-[10px] font-semibold">
              {(['meses', 'anos'] as const).map(u => (
                <button key={u} onClick={() => setPrazoUnit(u)}
                  className={clsx('px-2 py-1 transition-colors',
                    prazoUnit === u ? 'bg-[#ff7a00] text-white' : 'bg-[#12121a] text-[#55556a] hover:text-[#e8e8f0]')}>
                  {u === 'meses' ? 'Meses' : 'Anos'}
                </button>
              ))}
            </div>
          </div>
          <input className={inputCls} placeholder={prazoUnit === 'meses' ? '360' : '30'} value={prazo} onChange={e => setPrazo(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Valor Residual / Balloon (R$, opcional)</label>
          <input className={inputCls} placeholder="0" value={residual} onChange={e => setResidual(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Sistema</label>
          <div className="flex gap-2">
            {(['SAC', 'Price'] as const).map(t => (
              <button key={t} onClick={() => setTipo(t)}
                className={clsx('flex-1 py-2 rounded-xl text-sm font-semibold transition-all border',
                  tipo === t
                    ? 'bg-[#ff7a00] text-white border-[#ff7a00]'
                    : 'bg-[#12121a] text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]')}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {result && (
        <>
          <div className={resultBox}>
            <p className="text-xs font-semibold text-[#ff7a00] uppercase tracking-wider">Resultado</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-[10px] text-[#8888aa]">Primeira Parcela</p>
                <p className="text-base font-bold text-[#e8e8f0]">{formatBRL(result.primeira)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#8888aa]">Última Parcela</p>
                <p className="text-base font-bold text-[#e8e8f0]">{formatBRL(result.ultima)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#8888aa]">Total Pago</p>
                <p className="text-base font-bold text-[#ff4466]">{formatBRL(result.totalPago)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#8888aa]">Total Juros</p>
                <p className="text-base font-bold text-[#f59e0b]">{formatBRL(result.totalJuros)}</p>
              </div>
            </div>
            {result.cet !== null && (
              <div className="pt-2 border-t border-[#ff7a00]/20">
                <p className="text-[10px] text-[#8888aa]">CET (mensal aproximado)</p>
                <p className="text-sm font-bold text-[#ff7a00]">{result.cet.toFixed(4)}%</p>
              </div>
            )}
          </div>

          {/* Amortization table */}
          <div>
            <p className="text-xs font-semibold text-[#8888aa] uppercase tracking-wider mb-2">Tabela de Amortização</p>
            <div className="overflow-x-auto rounded-xl border border-[#1e1e2e]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e1e2e]">
                    {['Mês', 'Parcela', 'Juros', 'Amortização', 'Saldo'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-medium uppercase text-[#55556a]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(row => (
                    <tr key={row.period} className="odd:bg-[#111118] border-b border-[#1e1e2e]/50">
                      <td className="px-3 py-2 text-[#8888aa]">{row.period}</td>
                      <td className="px-3 py-2 text-[#e8e8f0] font-medium">{formatBRL(row.payment)}</td>
                      <td className="px-3 py-2 text-[#ff4466]">{formatBRL(row.interest)}</td>
                      <td className="px-3 py-2 text-[#00ff88]">{formatBRL(row.amortization)}</td>
                      <td className="px-3 py-2 text-[#8888aa]">{formatBRL(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.schedule.length > 12 && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="mt-2 flex items-center gap-1 text-xs text-[#ff7a00] hover:text-[#ff9933] transition-colors">
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? 'Recolher' : `Ver todas as ${result.schedule.length} parcelas`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculator 4 — Simulador de Aportes
// ─────────────────────────────────────────────────────────────────────────────
function SavingsCalc() {
  const [patrimonio, setPatrimonio] = useState('')
  const [aporte,     setAporte]     = useState('')
  const [taxaAnual,  setTaxaAnual]  = useState('')
  const [anos,       setAnos]       = useState('')

  const result = useMemo(() => {
    const pv  = parseFloat(patrimonio.replace(',', '.') || '0')
    const pmt = parseFloat(aporte.replace(',', '.') || '0')
    const ra  = parseFloat(taxaAnual.replace(',', '.'))
    const y   = parseFloat(anos.replace(',', '.'))
    if (isNaN(ra) || isNaN(y) || y <= 0 || ra < 0) return null
    const r = Math.pow(1 + ra / 100, 1 / 12) - 1
    const n = Math.round(y * 12)

    // Build monthly chart data
    const chartData: { month: number; value: number; contributions: number }[] = []
    let balance = pv
    let totalContrib = pv
    for (let m = 0; m <= n; m++) {
      if (m > 0) {
        balance = balance * (1 + r) + pmt
        totalContrib += pmt
      }
      if (m % 3 === 0 || m === n) {
        chartData.push({ month: m, value: balance, contributions: totalContrib })
      }
    }

    const fv     = pv * Math.pow(1 + r, n) + (r > 0 ? pmt * (Math.pow(1 + r, n) - 1) / r : pmt * n)
    const total  = pv + pmt * n
    const juros  = fv - total

    return { fv, total, juros, chartData }
  }, [patrimonio, aporte, taxaAnual, anos])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Patrimônio Atual (R$)</label>
          <input className={inputCls} placeholder="50000" value={patrimonio} onChange={e => setPatrimonio(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Aporte Mensal (R$)</label>
          <input className={inputCls} placeholder="2000" value={aporte} onChange={e => setAporte(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Taxa Anual (%)</label>
          <input className={inputCls} placeholder="12" value={taxaAnual} onChange={e => setTaxaAnual(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Período (anos)</label>
          <input className={inputCls} placeholder="10" value={anos} onChange={e => setAnos(e.target.value)} />
        </div>
      </div>

      {result && (
        <>
          <div className={resultBox}>
            <p className="text-xs font-semibold text-[#ff7a00] uppercase tracking-wider">Resultado</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] text-[#8888aa]">Valor Final</p>
                <p className="text-lg font-bold text-[#ff7a00]">{formatBRL(result.fv)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#8888aa]">Total Aportado</p>
                <p className="text-lg font-bold text-[#e8e8f0]">{formatBRL(result.total)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#8888aa]">Juros Gerados</p>
                <p className="text-lg font-bold text-[#00ff88]">{formatBRL(result.juros)}</p>
              </div>
            </div>
          </div>

          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={result.chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gradValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ff7a00" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ff7a00" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="gradContrib" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00d4ff" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#00d4ff" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  tickFormatter={v => `${v}m`}
                  tick={{ fill: '#55556a', fontSize: 10 }}
                  axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: '#55556a', fontSize: 10 }}
                  axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  formatter={(v: any, name: string) => [
                    formatBRL(v),
                    name === 'value' ? 'Patrimônio' : 'Aportado',
                  ]}
                  labelFormatter={(l: any) => `Mês ${l}`}
                  contentStyle={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="contributions" stroke="#00d4ff" fill="url(#gradContrib)" strokeWidth={1.5} dot={false} name="contributions" />
                <Area type="monotone" dataKey="value"         stroke="#ff7a00" fill="url(#gradValue)"   strokeWidth={2}   dot={false} name="value" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function FinancialTools() {
  const [activeTab, setActiveTab] = useState('tvm')

  return (
    <div className="min-h-screen animate-fade-in">
      <PageHeader
        title="Ferramentas Financeiras"
        subtitle="Calculadoras de juros, amortização e simulações"
      />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Tab bar */}
        <div className="flex gap-1 bg-[#16161f] rounded-xl p-1 border border-[#1e1e2e] flex-wrap">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex-1 min-w-[120px] px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-[#ff7a00] text-white shadow-sm'
                  : 'text-[#55556a] hover:text-[#e8e8f0]',
              )}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Calculator panels */}
        <Card>
          <CardHeader>
            <CardTitle>
              {TABS.find(t => t.id === activeTab)?.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeTab === 'tvm'     && <TVMCalc />}
            {activeTab === 'npv'     && <NPVCalc />}
            {activeTab === 'loan'    && <LoanCalc />}
            {activeTab === 'savings' && <SavingsCalc />}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
