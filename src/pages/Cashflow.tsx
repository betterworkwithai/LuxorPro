import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Search, Plus, Download, Trash2, Paperclip,
  ChevronUp, ChevronDown, ArrowUpDown, Repeat, Pencil, ToggleLeft, ToggleRight,
  TrendingUp, TrendingDown, AlertTriangle,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useStore } from '../store/useStore'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Modal, ModalFooter } from '../components/ui/Modal'
import { AddTransactionModal } from '../components/modals/AddTransactionModal'
import { FormulaInput } from '../components/ui/FormulaInput'
import { formatBRL, formatDate, currentMonthYear, monthName } from '../lib/formatters'
import { AccountSelect } from '../components/ui/AccountSelect'
import { useAllCategories } from '../lib/useCategories'
import type { RecurringTransaction, Transaction } from '../lib/types'
import { clsx } from 'clsx'

type SortField = 'date' | 'amount' | 'description' | 'category'
type SortDir   = 'asc' | 'desc'

const MONTHS_BACK = 12

// Default budget nature per category (for 50/30/20 rule)
const CATEGORY_NATURE: Record<string, 'fixed' | 'variable' | 'investment'> = {
  moradia: 'fixed', saude: 'fixed', educacao: 'fixed',
  streaming: 'fixed', boleto: 'fixed', imposto: 'fixed', software: 'fixed',
  alimentacao: 'variable', transporte: 'variable', lazer: 'variable',
  viagem: 'variable', pix_out: 'variable', outros: 'variable',
  investimento: 'investment',
}

const getNature = (t: Transaction): 'fixed' | 'variable' | 'investment' =>
  t.expenseNature ?? CATEGORY_NATURE[t.category] ?? 'variable'

// ─── Recurring Transaction Modal ─────────────
const emptyRec = (type: 'income' | 'expense' = 'expense') => ({
  type,
  name: '', amount: '', currency: 'BRL' as 'BRL' | 'USD' | 'EUR',
  billingDay: '5', category: type === 'income' ? 'salary' : 'saude',
  account: 'Nubank', isActive: true, startDate: '', notes: '',
  frequency: 'monthly' as 'monthly' | 'weekly',
  weeklyInterval: '1',
})

function RecurringModal({ open, onClose, initial }: {
  open: boolean; onClose: () => void; initial?: RecurringTransaction
}) {
  const { addSubscription, updateSubscription, addTransaction } = useStore()
  const allCats = useAllCategories()

  const [form, setForm] = useState(() =>
    initial
      ? { type: initial.type ?? 'expense', name: initial.name,
          amount: String(initial.amount), currency: (initial.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR',
          billingDay: String(initial.billingDay), category: initial.category,
          account: initial.account ?? 'Nubank', isActive: initial.isActive,
          startDate: initial.startDate, notes: initial.notes ?? '',
          frequency: (initial.frequency ?? 'monthly') as 'monthly' | 'weekly',
          weeklyInterval: String(initial.weeklyInterval ?? '1') }
      : emptyRec()
  )
  const [generateMonths, setGenerateMonths] = useState<number>(0)

  useEffect(() => {
    if (!open) return
    setGenerateMonths(0)
    setForm(initial
      ? { type: initial.type ?? 'expense', name: initial.name,
          amount: String(initial.amount), currency: (initial.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR',
          billingDay: String(initial.billingDay), category: initial.category,
          account: initial.account ?? 'Nubank', isActive: initial.isActive,
          startDate: initial.startDate, notes: initial.notes ?? '',
          frequency: (initial.frequency ?? 'monthly') as 'monthly' | 'weekly',
          weeklyInterval: String(initial.weeklyInterval ?? '1') }
      : emptyRec())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id])

  const upd = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  const switchType = (t: 'income' | 'expense') => setForm(f => ({
    ...f, type: t, category: t === 'income' ? 'salary' : 'saude',
  }))

  const filteredCats = allCats.filter(c => c.type === form.type || c.type === 'both')

  const handleSave = async () => {
    const amount = parseFloat(form.amount) || 0
    const day    = parseInt(form.billingDay) || 1
    const payload: Omit<RecurringTransaction, 'id'> = {
      type:           form.type as 'income' | 'expense',
      name:           form.name.trim(),
      amount,
      currency:       form.currency,
      billingDay:     day,
      category:       form.category,
      account:        form.account,
      isActive:       form.isActive,
      startDate:      form.startDate || new Date().toISOString().split('T')[0],
      frequency:      form.frequency,
      weeklyInterval: parseInt(form.weeklyInterval) || 1,
      notes:          form.notes || undefined,
    }

    if (initial) {
      await updateSubscription({ ...payload, id: initial.id })
    } else {
      await addSubscription(payload)

      if (generateMonths > 0) {
        const startRaw = payload.startDate
        const base = startRaw ? new Date(startRaw + 'T12:00:00') : new Date()
        const isWeekly = form.frequency === 'weekly'
        const weekInterval = parseInt(form.weeklyInterval) || 1

        if (isWeekly) {
          const endDate = new Date(base.getFullYear(), base.getMonth() + generateMonths, base.getDate())
          let cur = new Date(base)
          while (cur <= endDate) {
            const txDate = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
            await addTransaction({ date: txDate, description: form.name.trim(), category: form.category, amount, type: form.type as 'income' | 'expense', account: form.account, notes: form.notes || undefined })
            cur = new Date(cur.getTime() + weekInterval * 7 * 24 * 3600 * 1000)
          }
        } else {
          for (let m = 0; m < generateMonths; m++) {
            const d = new Date(base.getFullYear(), base.getMonth() + m, 1)
            const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
            const txDay  = Math.min(day, maxDay)
            const txDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(txDay).padStart(2, '0')}`
            await addTransaction({ date: txDate, description: form.name.trim(), category: form.category, amount, type: form.type as 'income' | 'expense', account: form.account, notes: form.notes || undefined })
          }
        }
      }
    }
    onClose()
  }

  const isIncome = form.type === 'income'

  return (
    <Modal open={open} onClose={onClose}
      title={initial ? 'Editar Recorrência' : 'Nova Transação Recorrente'} size="md">
      <div className="px-6 py-4 space-y-4">
        <div className="flex gap-2">
          {(['income', 'expense'] as const).map(t => (
            <button key={t} onClick={() => switchType(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                form.type === t
                  ? t === 'income'
                    ? 'bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/30'
                    : 'bg-[#ff4466]/10 text-[#ff4466] border-[#ff4466]/30'
                  : 'bg-[#16161f] text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]'
              }`}>
              {t === 'income' ? '↑ Receita' : '↓ Despesa'}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs text-[#8888aa] mb-1.5 block">Descrição</label>
          <input className="input-dark"
            placeholder={isIncome ? 'Ex: Salário, Aluguel Recebido…' : 'Ex: Plano de Saúde, INSS…'}
            value={form.name} onChange={e => upd('name', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[#8888aa] mb-1.5 block">Valor</label>
            <FormulaInput value={form.amount} onChange={v => upd('amount', v)} placeholder="0,00" />
          </div>
          <div>
            <label className="text-xs text-[#8888aa] mb-1.5 block">Moeda</label>
            <select className="input-dark" value={form.currency} onChange={e => upd('currency', e.target.value)}>
              <option value="BRL">BRL (R$)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[#8888aa] mb-1.5 block">Categoria</label>
            <select className="input-dark" value={form.category} onChange={e => upd('category', e.target.value)}>
              {filteredCats.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#8888aa] mb-1.5 block">Conta</label>
            <AccountSelect value={form.account} onChange={v => upd('account', v)} placeholder="Selecionar…" />
          </div>
        </div>

        <div>
          <label className="text-xs text-[#8888aa] mb-1.5 block">Frequência</label>
          <div className="flex gap-2">
            {(['monthly', 'weekly'] as const).map(f => (
              <button key={f} type="button" onClick={() => upd('frequency', f)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  form.frequency === f
                    ? 'bg-[#ff7a00]/10 text-[#ff7a00] border-[#ff7a00]/30'
                    : 'bg-[#16161f] text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]'
                }`}>
                {f === 'monthly' ? '📅 Mensal' : '🗓 Semanal'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            {form.frequency === 'weekly' ? (
              <>
                <label className="text-xs text-[#8888aa] mb-1.5 block">Repetir a cada (semanas)</label>
                <input className="input-dark" type="number" min="1" max="52"
                  value={form.weeklyInterval} onChange={e => upd('weeklyInterval', e.target.value)} />
              </>
            ) : (
              <>
                <label className="text-xs text-[#8888aa] mb-1.5 block">
                  {isIncome ? 'Dia de Recebimento (1–31)' : 'Dia de Vencimento (1–31)'}
                </label>
                <input className="input-dark" type="number" min="1" max="31"
                  value={form.billingDay} onChange={e => upd('billingDay', e.target.value)} />
              </>
            )}
          </div>
          <div>
            <label className="text-xs text-[#8888aa] mb-1.5 block">Data de Início</label>
            <input type="date" className="input-dark"
              value={form.startDate} onChange={e => upd('startDate', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="text-xs text-[#8888aa] mb-1.5 block">Observações (opcional)</label>
          <input className="input-dark" placeholder="Notas…"
            value={form.notes} onChange={e => upd('notes', e.target.value)} />
        </div>

        <div className="flex items-center justify-between p-3 bg-[#16161f] rounded-xl border border-[#1e1e2e]">
          <span className="text-sm text-[#e8e8f0]">Recorrência ativa</span>
          <button onClick={() => upd('isActive', !form.isActive)} className="transition-colors">
            {form.isActive
              ? <ToggleRight className="w-7 h-7 text-[#ff7a00]" />
              : <ToggleLeft  className="w-7 h-7 text-[#55556a]" />}
          </button>
        </div>

        {!initial && (
          <div>
            <label className="text-xs text-[#8888aa] mb-2 block">Gerar lançamentos no Fluxo de Caixa</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {[0, 3, 6, 12, 24, 36].map(n => (
                <button key={n} type="button" onClick={() => setGenerateMonths(n)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    generateMonths === n
                      ? 'bg-[#ff7a00]/10 text-[#ff7a00] border-[#ff7a00]/30'
                      : 'bg-[#16161f] text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]'
                  }`}>
                  {n === 0 ? 'Só template' : `${n}m`}
                </button>
              ))}
              <div className="flex items-center gap-1.5">
                <input type="number" min="1" max="120" placeholder="Outro…"
                  className="input-dark text-xs py-1.5 px-2 w-20"
                  value={generateMonths > 0 && ![3,6,12,24,36].includes(generateMonths) ? generateMonths : ''}
                  onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) setGenerateMonths(v) }} />
                <span className="text-xs text-[#55556a]">meses</span>
              </div>
            </div>
            {generateMonths > 0 && (
              <p className="text-[10px] text-[#55556a]">
                Criará {generateMonths} lançamento{generateMonths !== 1 ? 's' : ''} no Fluxo de Caixa a partir de {form.startDate || 'hoje'}
              </p>
            )}
          </div>
        )}
      </div>
      <ModalFooter>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={!form.name || !form.amount}>
          {initial ? 'Salvar' : generateMonths > 0 ? `Adicionar + ${generateMonths} lançamentos` : 'Adicionar'}
        </button>
      </ModalFooter>
    </Modal>
  )
}

// ─── Main Page ───────────────────────────────
export default function Cashflow() {
  const {
    transactions, deleteTransaction, updateTransaction,
    subscriptions, deleteSubscription, updateSubscription,
    setModal, activeModal, settings,
  } = useStore()
  const allCategories = useAllCategories()

  const [search,    setSearch]    = useState('')
  const [typeF,     setTypeF]     = useState<'all' | 'income' | 'expense' | 'wanted'>('all')
  const [catF,      setCatF]      = useState('')
  const [accountF,  setAccountF]  = useState('')
  const [monthF,    setMonthF]    = useState('')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir,   setSortDir]   = useState<SortDir>('desc')
  const [budgetNatureFilter, setBudgetNatureFilter] = useState<'all' | 'fixed' | 'variable' | 'investment'>('all')

  const [showSubModal, setShowSubModal] = useState(false)
  const [editSub,      setEditSub]      = useState<RecurringTransaction | undefined>()
  const [recFilter,    setRecFilter]    = useState<'all' | 'income' | 'expense'>('all')
  const [recSort,      setRecSort]      = useState<'name' | 'value' | 'category' | 'day'>('day')
  const [editTx,       setEditTx]       = useState<Transaction | undefined>()

  // Bulk edit
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCat,     setBulkCat]     = useState('')
  const [bulkAccount, setBulkAccount] = useState('')
  const [bulkDate,    setBulkDate]    = useState('')
  const [bulkDesc,    setBulkDesc]    = useState('')
  const [bulkType,    setBulkType]    = useState<'income' | 'expense' | ''>('')

  const { month: curMonth, year: curYear } = currentMonthYear()

  // ── toBRL conversion ──────────────────────────
  const toBRL = useCallback((t: Transaction) => {
    if (!t.currency || t.currency === 'BRL') return t.amount
    if (t.currency === 'USD') return t.amount * settings.usdToBrl
    if (t.currency === 'EUR') return t.amount * (settings.eurToBrl ?? 5.90)
    return t.amount
  }, [settings.usdToBrl, settings.eurToBrl])

  const monthOptions = useMemo(() => {
    const opts = []
    for (let i = 0; i < MONTHS_BACK; i++) {
      const d = new Date(curYear, curMonth - 1 - i, 1)
      const m = d.getMonth() + 1
      const y = d.getFullYear()
      opts.push({ value: `${y}-${String(m).padStart(2, '0')}`, label: `${monthName(m)} ${y}` })
    }
    return opts
  }, [curMonth, curYear])

  const filtered = useMemo(() => {
    let list = [...transactions]
    if (search)              list = list.filter(t => t.description.toLowerCase().includes(search.toLowerCase()))
    if (typeF === 'wanted')  list = list.filter(t => t.isWanted === true)
    else if (typeF !== 'all') list = list.filter(t => t.type === typeF)
    if (catF)      list = list.filter(t => t.category === catF)
    if (accountF)  list = list.filter(t => t.account === accountF)
    if (monthF)    list = list.filter(t => t.date.startsWith(monthF))
    list.sort((a, b) => {
      let cmp = 0
      if (sortField === 'date')             cmp = a.date.localeCompare(b.date)
      else if (sortField === 'amount')      cmp = a.amount - b.amount
      else if (sortField === 'description') cmp = a.description.localeCompare(b.description)
      else if (sortField === 'category')    cmp = a.category.localeCompare(b.category)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [transactions, search, typeF, catF, accountF, monthF, sortField, sortDir])

  // ── Donut chart data — always uses the selected month (or current) ──
  const chartMonthKey = monthF || `${curYear}-${String(curMonth).padStart(2, '0')}`
  const chartTx = useMemo(() =>
    transactions.filter(t => t.date.startsWith(chartMonthKey)),
    [transactions, chartMonthKey]
  )

  const expByCategory = useMemo(() => {
    const map = new Map<string, { id: string; name: string; icon: string; color: string; amount: number }>()
    chartTx.filter(t => t.type === 'expense' && !t.isWanted).forEach(t => {
      const cat = allCategories.find(c => c.id === t.category)
      const cur = map.get(t.category) ?? { id: t.category, name: cat?.name ?? t.category, icon: cat?.icon ?? '📦', color: cat?.color ?? '#55556a', amount: 0 }
      map.set(t.category, { ...cur, amount: cur.amount + toBRL(t) })
    })
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 8)
  }, [chartTx, allCategories, toBRL])

  const incByCategory = useMemo(() => {
    const map = new Map<string, { id: string; name: string; icon: string; color: string; amount: number }>()
    chartTx.filter(t => t.type === 'income').forEach(t => {
      const cat = allCategories.find(c => c.id === t.category)
      const cur = map.get(t.category) ?? { id: t.category, name: cat?.name ?? t.category, icon: cat?.icon ?? '💰', color: cat?.color ?? '#00ff88', amount: 0 }
      map.set(t.category, { ...cur, amount: cur.amount + toBRL(t) })
    })
    return [...map.values()].sort((a, b) => b.amount - a.amount)
  }, [chartTx, allCategories, toBRL])

  // ── Budget 50/30/20 ─────────────────────────
  const budgetData = useMemo(() => {
    const mExp = chartTx.filter(t => t.type === 'expense' && !t.isWanted)
    const mInc = chartTx.filter(t => t.type === 'income').reduce((s, t) => s + toBRL(t), 0)
    const fixed      = mExp.filter(t => getNature(t) === 'fixed').reduce((s, t) => s + toBRL(t), 0)
    const variable   = mExp.filter(t => getNature(t) === 'variable').reduce((s, t) => s + toBRL(t), 0)
    const investment = mExp.filter(t => getNature(t) === 'investment').reduce((s, t) => s + toBRL(t), 0)
    const base = mInc > 0 ? mInc : (fixed + variable + investment) || 1
    return {
      income: mInc,
      fixed, fixedPct: fixed / base * 100,
      variable, variablePct: variable / base * 100,
      investment, investmentPct: investment / base * 100,
      pieData: [
        { name: 'Fixas',        value: fixed,      color: '#3b82f6', ideal: 50 },
        { name: 'Variáveis',    value: variable,   color: '#f59e0b', ideal: 30 },
        { name: 'Investimento', value: investment, color: '#00ff88', ideal: 20 },
      ],
    }
  }, [chartTx, toBRL])

  // ── Anomaly alerts (vs prior month) ─────────
  const anomalyAlerts = useMemo(() => {
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1
    const prevYear  = curMonth === 1 ? curYear - 1 : curYear
    const prevKey   = `${prevYear}-${String(prevMonth).padStart(2, '0')}`
    const curKey    = `${curYear}-${String(curMonth).padStart(2, '0')}`

    const curExp  = transactions.filter(t => t.type === 'expense' && t.date.startsWith(curKey))
    const prevExp = transactions.filter(t => t.type === 'expense' && t.date.startsWith(prevKey))

    const curMap  = new Map<string, number>()
    curExp.forEach(t => curMap.set(t.category, (curMap.get(t.category) ?? 0) + toBRL(t)))
    const prevMap = new Map<string, number>()
    prevExp.forEach(t => prevMap.set(t.category, (prevMap.get(t.category) ?? 0) + toBRL(t)))

    const alerts: { catName: string; catIcon: string; cur: number; prev: number; pct: number }[] = []
    curMap.forEach((cur, catId) => {
      const prev = prevMap.get(catId) ?? 0
      if (prev > 0 && cur > prev * 1.20) {
        const cat = allCategories.find(c => c.id === catId)
        alerts.push({ catName: cat?.name ?? catId, catIcon: cat?.icon ?? '📦', cur, prev, pct: (cur - prev) / prev * 100 })
      }
    })
    return alerts.sort((a, b) => b.pct - a.pct).slice(0, 3)
  }, [transactions, curMonth, curYear, allCategories, toBRL])

  // ── Want expenses ────────────────────────────
  const wantedExpenses = useMemo(() =>
    transactions.filter(t => t.isWanted === true),
    [transactions]
  )
  const wantedMonthlyBudget = useMemo(() => {
    // Compare wanted total vs current month income
    const mInc = chartTx.filter(t => t.type === 'income').reduce((s, t) => s + toBRL(t), 0)
    const wantedTotal = wantedExpenses.reduce((s, t) => s + toBRL(t), 0)
    return { wantedTotal, mInc, fits: mInc > 0 && wantedTotal <= mInc * 0.10 }
  }, [wantedExpenses, chartTx, toBRL])

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectAll = () => setSelectedIds(new Set(filtered.map(t => t.id)))
  const clearSel  = () => setSelectedIds(new Set())

  const totalIncome   = filtered.filter(t => t.type === 'income' && !t.isWanted).reduce((s, t) => s + toBRL(t), 0)
  const totalExpenses = filtered.filter(t => t.type === 'expense' && !t.isWanted).reduce((s, t) => s + toBRL(t), 0)
  const netFlow       = totalIncome - totalExpenses

  const activeRec = subscriptions.filter(s => s.isActive)
  const monthlyRecIncome  = activeRec.filter(s => s.type === 'income')
    .reduce((sum, s) => {
      if (s.currency === 'USD') return sum + s.amount * settings.usdToBrl
      if (s.currency === 'EUR') return sum + s.amount * (settings.eurToBrl ?? 5.90)
      return sum + s.amount
    }, 0)
  const monthlyRecExpense = activeRec.filter(s => s.type !== 'income')
    .reduce((sum, s) => {
      if (s.currency === 'USD') return sum + s.amount * settings.usdToBrl
      if (s.currency === 'EUR') return sum + s.amount * (settings.eurToBrl ?? 5.90)
      return sum + s.amount
    }, 0)

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
  }

  const exportCSV = () => {
    const header = 'Data,Descrição,Categoria,Valor,Moeda,Tipo,Conta,Natureza\n'
    const rows = filtered.map(t =>
      `${formatDate(t.date)},"${t.description}",${t.category},${t.amount},${t.currency ?? 'BRL'},${t.type},${t.account},${t.expenseNature ?? ''}`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'gaara-fluxo-de-caixa.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const pieTooltipStyle = {
    contentStyle: { background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 12, fontSize: 12, color: '#ffffff' },
    itemStyle: { color: '#ffffff' },
    labelStyle: { color: '#ffffff', fontWeight: 600 },
  }

  return (
    <div className="min-h-screen animate-fade-in">
      <PageHeader
        title="Fluxo de Caixa"
        subtitle="Todas as suas receitas e despesas em um só lugar"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="btn-ghost flex items-center gap-1.5 text-xs px-2 sm:px-3">
              <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Exportar</span>
            </button>
            <button onClick={() => setModal('add-transaction')} className="btn-primary flex items-center gap-1.5 px-3">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Adicionar</span>
            </button>
          </div>
        }
      />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <p className="text-[10px] text-[#8888aa] uppercase tracking-wider mb-1">Receitas</p>
            <p className="text-lg font-bold text-[#00ff88]">{formatBRL(totalIncome, true)}</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-[10px] text-[#8888aa] uppercase tracking-wider mb-1">Despesas</p>
            <p className="text-lg font-bold text-[#ff4466]">{formatBRL(totalExpenses, true)}</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-[10px] text-[#8888aa] uppercase tracking-wider mb-1">Saldo</p>
            <p className={clsx('text-lg font-bold', netFlow >= 0 ? 'text-[#00ff88]' : 'text-[#ff4466]')}>
              {formatBRL(netFlow, true)}
            </p>
          </div>
        </div>

        {/* ── Donut Charts ── */}
        {(expByCategory.length > 0 || incByCategory.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Expense donut */}
            <Card>
              <CardHeader>
                <CardTitle>Despesas por Categoria</CardTitle>
                <span className="text-[10px] text-[#55556a] ml-auto">
                  {monthF ? monthOptions.find(o => o.value === monthF)?.label : `${monthName(curMonth)} ${curYear}`}
                </span>
              </CardHeader>
              <CardContent>
                {expByCategory.length === 0 ? (
                  <p className="text-xs text-[#55556a] py-6 text-center">Sem despesas no período</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={expByCategory} dataKey="amount" nameKey="name"
                          cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                          {expByCategory.map(entry => (
                            <Cell key={entry.id} fill={entry.color} stroke="#0a0a0f" strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip {...pieTooltipStyle}
                          formatter={(v: any, name: any) => {
                            const total = expByCategory.reduce((s, c) => s + c.amount, 0)
                            const pct = total > 0 ? (Number(v) / total * 100).toFixed(1) : '0'
                            return [`${formatBRL(v)} (${pct}%)`, name]
                          }} />
                        <Legend wrapperStyle={{ fontSize: 11, color: '#8888aa' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1 mt-1">
                      {expByCategory.map(cat => {
                        const total = expByCategory.reduce((s, c) => s + c.amount, 0)
                        const pct = total > 0 ? (cat.amount / total * 100).toFixed(0) : '0'
                        return (
                          <div key={cat.id} className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-[#8888aa]">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                              {cat.icon} {cat.name}
                            </span>
                            <span className="text-[#e8e8f0] font-medium">{formatBRL(cat.amount)} <span className="text-[#55556a]">{pct}%</span></span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Income donut */}
            <Card>
              <CardHeader>
                <CardTitle>Receitas por Categoria</CardTitle>
                <span className="text-[10px] text-[#55556a] ml-auto">
                  {monthF ? monthOptions.find(o => o.value === monthF)?.label : `${monthName(curMonth)} ${curYear}`}
                </span>
              </CardHeader>
              <CardContent>
                {incByCategory.length === 0 ? (
                  <p className="text-xs text-[#55556a] py-6 text-center">Sem receitas no período</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={incByCategory} dataKey="amount" nameKey="name"
                          cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                          {incByCategory.map(entry => (
                            <Cell key={entry.id} fill={entry.color} stroke="#0a0a0f" strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip {...pieTooltipStyle}
                          formatter={(v: any, name: any) => {
                            const total = incByCategory.reduce((s, c) => s + c.amount, 0)
                            const pct = total > 0 ? (Number(v) / total * 100).toFixed(1) : '0'
                            return [`${formatBRL(v)} (${pct}%)`, name]
                          }} />
                        <Legend wrapperStyle={{ fontSize: 11, color: '#8888aa' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1 mt-1">
                      {incByCategory.map(cat => {
                        const total = incByCategory.reduce((s, c) => s + c.amount, 0)
                        const pct = total > 0 ? (cat.amount / total * 100).toFixed(0) : '0'
                        return (
                          <div key={cat.id} className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-[#8888aa]">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                              {cat.icon} {cat.name}
                            </span>
                            <span className="text-[#e8e8f0] font-medium">{formatBRL(cat.amount)} <span className="text-[#55556a]">{pct}%</span></span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Transações Recorrentes ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-[#55556a]" />
                <CardTitle>Transações Recorrentes</CardTitle>
              </div>
              <div className="flex items-center gap-3">
                {monthlyRecIncome > 0 && (
                  <span className="text-xs text-[#00ff88] font-semibold">+{formatBRL(monthlyRecIncome, true)}/mês</span>
                )}
                {monthlyRecExpense > 0 && (
                  <span className="text-xs text-[#ff4466] font-semibold">-{formatBRL(monthlyRecExpense, true)}/mês</span>
                )}
                <button onClick={() => { setEditSub(undefined); setShowSubModal(true) }}
                  className="btn-ghost text-xs flex items-center gap-1 px-2 py-1">
                  <Plus className="w-3.5 h-3.5" /> Nova
                </button>
              </div>
            </div>
          </CardHeader>
          {subscriptions.length > 0 && (
            <div className="flex items-center gap-2 px-5 pb-3 flex-wrap">
              <div className="flex gap-1 bg-[#16161f] rounded-lg p-0.5 border border-[#1e1e2e]">
                {(['all', 'income', 'expense'] as const).map(f => (
                  <button key={f} onClick={() => setRecFilter(f)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                      recFilter === f ? 'bg-[#ff7a00]/15 text-[#ff7a00]' : 'text-[#55556a] hover:text-[#e8e8f0]'
                    }`}>
                    {f === 'all' ? 'Todas' : f === 'income' ? 'Receitas' : 'Despesas'}
                  </button>
                ))}
              </div>
              <select value={recSort} onChange={e => setRecSort(e.target.value as any)}
                className="text-[10px] bg-[#16161f] border border-[#1e1e2e] text-[#55556a] rounded-lg px-2 py-1 focus:outline-none focus:border-[#ff7a00]/40 cursor-pointer">
                <option value="day">Ordenar: Dia</option>
                <option value="name">Ordenar: Nome</option>
                <option value="value">Ordenar: Valor</option>
                <option value="category">Ordenar: Categoria</option>
              </select>
            </div>
          )}
          {subscriptions.length === 0 ? (
            <CardContent>
              <p className="text-xs text-[#55556a] py-4 text-center">
                Nenhuma recorrência cadastrada. Adicione salário, plano de saúde, INSS e outras transações mensais fixas.
              </p>
            </CardContent>
          ) : (
            <div className="divide-y divide-[#1e1e2e]">
              {[...subscriptions]
                .filter(s => recFilter === 'all' || s.type === recFilter)
                .sort((a, b) => {
                  if (recSort === 'name')     return a.name.localeCompare(b.name)
                  if (recSort === 'value')    return b.amount - a.amount
                  if (recSort === 'category') return a.category.localeCompare(b.category)
                  return a.billingDay - b.billingDay
                })
                .map(sub => {
                const isIncome  = sub.type === 'income'
                const amountBRL = sub.currency === 'USD' ? sub.amount * settings.usdToBrl
                  : sub.currency === 'EUR' ? sub.amount * (settings.eurToBrl ?? 5.90)
                  : sub.amount
                const today = new Date().getDate()
                let daysUntil = sub.billingDay - today
                if (daysUntil < 0) daysUntil += 30
                const cat = allCategories.find(c => c.id === sub.category)
                return (
                  <div key={sub.id} className="flex items-center gap-4 px-5 py-3 transition-colors group"
                    onMouseEnter={e => (e.currentTarget.style.background = '#16161f')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <div className={clsx('w-2 h-2 rounded-full flex-shrink-0',
                      !sub.isActive ? 'bg-[#55556a]'
                        : isIncome  ? 'bg-[#00ff88]'
                        : daysUntil <= 3 ? 'bg-[#ff4466]'
                        : daysUntil <= 7 ? 'bg-[#f59e0b]'
                        : 'bg-[#00d4ff]')} />
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                      style={{ background: (cat?.color ?? '#55556a') + '18' }}>
                      {cat?.icon ?? (isIncome ? '💰' : '📄')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={clsx('text-sm font-medium', sub.isActive ? 'text-[#e8e8f0]' : 'text-[#55556a] line-through')}>
                          {sub.name}
                        </p>
                        <Badge variant={isIncome ? 'income' : 'expense'}>{isIncome ? 'receita' : 'despesa'}</Badge>
                        {!sub.isActive && <Badge variant="neutral">Inativa</Badge>}
                      </div>
                      <p className="text-[10px] text-[#55556a] mt-0.5">
                        {cat?.name ?? sub.category} · {sub.account} · Dia {sub.billingDay}
                        {sub.isActive && <> · {daysUntil === 0 ? (isIncome ? 'Recebe hoje!' : 'Vence hoje!') : `${daysUntil}d`}</>}
                        {sub.notes && <> · {sub.notes}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className={clsx('text-sm font-semibold',
                          !sub.isActive ? 'text-[#55556a]' : isIncome ? 'text-[#00ff88]' : 'text-[#ff4466]')}>
                          {isIncome ? '+' : '-'}{sub.currency === 'USD' ? `$${sub.amount.toFixed(2)}` : sub.currency === 'EUR' ? `€${sub.amount.toFixed(2)}` : formatBRL(sub.amount)}
                        </p>
                        {sub.currency !== 'BRL' && (
                          <p className="text-[10px] text-[#55556a]">≈ {formatBRL(amountBRL)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => updateSubscription({ ...sub, isActive: !sub.isActive })}
                          title={sub.isActive ? 'Desativar' : 'Ativar'}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#55556a] hover:bg-[#00d4ff]/15 hover:text-[#00d4ff] transition-colors">
                          {sub.isActive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => { setEditSub(sub); setShowSubModal(true) }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#55556a] hover:bg-[#00d4ff]/15 hover:text-[#00d4ff] transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteSubscription(sub.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#55556a] hover:bg-[#ff4466]/15 hover:text-[#ff4466] transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* ── Regra 50/30/20 ── */}
        {(budgetData.fixed + budgetData.variable + budgetData.investment) > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="text-base">🎯</span>
                <CardTitle>Regra 50/30/20</CardTitle>
              </div>
              <div className="flex gap-1 ml-auto">
                {([
                  { v: 'all',        l: 'Todas'   },
                  { v: 'fixed',      l: '🔒 Fixas' },
                  { v: 'variable',   l: '🌊 Var.'  },
                  { v: 'investment', l: '📊 Invest.' },
                ] as const).map(({ v, l }) => (
                  <button key={v} onClick={() => setBudgetNatureFilter(v)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                      budgetNatureFilter === v
                        ? 'bg-[#ff7a00]/15 text-[#ff7a00] border-[#ff7a00]/30'
                        : 'text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]'
                    }`}>{l}</button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={budgetData.pieData.filter(d => d.value > 0)} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                      {budgetData.pieData.filter(d => d.value > 0).map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="#0a0a0f" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip {...pieTooltipStyle}
                      formatter={(v: any, name: any) => {
                        const total = budgetData.fixed + budgetData.variable + budgetData.investment
                        const pct = total > 0 ? (Number(v) / total * 100).toFixed(1) : '0'
                        return [`${formatBRL(v)} (${pct}%)`, name]
                      }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#8888aa' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {[
                    { label: 'Fixas',        color: '#3b82f6', cur: budgetData.fixedPct,      amt: budgetData.fixed,      ideal: 50 },
                    { label: 'Variáveis',    color: '#f59e0b', cur: budgetData.variablePct,   amt: budgetData.variable,   ideal: 30 },
                    { label: 'Investimento', color: '#00ff88', cur: budgetData.investmentPct, amt: budgetData.investment, ideal: 20 },
                  ].map(row => {
                    const over = row.cur > row.ideal + 5
                    const under = row.cur < row.ideal - 5
                    return (
                      <div key={row.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-[#8888aa] flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                            {row.label}
                          </span>
                          <span className="text-xs font-semibold flex items-center gap-1.5">
                            <span style={{ color: over ? '#ff4466' : under && row.label === 'Investimento' ? '#ff4466' : row.color }}>
                              {row.cur.toFixed(0)}%
                            </span>
                            <span className="text-[#55556a]">/ ideal {row.ideal}%</span>
                            {over && <TrendingUp className="w-3 h-3 text-[#ff4466]" />}
                            {!over && !under && <span className="text-[#00ff88] text-[10px]">✓</span>}
                          </span>
                        </div>
                        <div className="h-2 bg-[#1e1e2e] rounded-full overflow-hidden relative">
                          {/* ideal marker */}
                          <div className="absolute top-0 bottom-0 w-px bg-[#55556a]" style={{ left: `${row.ideal}%` }} />
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${Math.min(100, row.cur)}%`, background: over ? '#ff4466' : row.color }} />
                        </div>
                        <p className="text-[10px] text-[#55556a] mt-0.5">{formatBRL(row.amt)}</p>
                      </div>
                    )
                  })}
                  {budgetData.income > 0 && (
                    <p className="text-[10px] text-[#55556a] pt-1 border-t border-[#1e1e2e]">
                      Base: receita do período {formatBRL(budgetData.income, true)}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Want Expenses ── */}
        {wantedExpenses.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="text-base">🛒</span>
                <CardTitle>Despesas Desejadas</CardTitle>
                <span className="text-[10px] text-[#55556a] ml-auto">{wantedExpenses.length} item{wantedExpenses.length !== 1 ? 's' : ''}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mb-3">
                {wantedExpenses.slice(0, 5).map(t => {
                  const cat = allCategories.find(c => c.id === t.category)
                  return (
                    <div key={t.id} className="flex items-center justify-between text-xs py-1.5 border-b border-[#1e1e2e] last:border-0">
                      <span className="flex items-center gap-1.5 text-[#8888aa]">
                        <span>{cat?.icon ?? '🛒'}</span>
                        <span className="truncate max-w-[160px]">{t.description}</span>
                      </span>
                      <span className="text-[#e8e8f0] font-medium flex-shrink-0">
                        {t.currency && t.currency !== 'BRL' ? `${t.currency === 'USD' ? '$' : '€'}${t.amount.toFixed(2)} ≈ ` : ''}{formatBRL(toBRL(t))}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#16161f]">
                <span className="text-xs text-[#8888aa]">Total desejado:</span>
                <div className="text-right">
                  <span className="text-sm font-bold text-[#8b5cf6]">{formatBRL(wantedMonthlyBudget.wantedTotal)}</span>
                  {wantedMonthlyBudget.mInc > 0 && (
                    <p className="text-[10px] text-[#55556a] mt-0.5">
                      = {(wantedMonthlyBudget.wantedTotal / wantedMonthlyBudget.mInc * 100).toFixed(0)}% da receita do período
                      {wantedMonthlyBudget.fits ? ' ✓ Cabe no orçamento' : ' ⚠ Acima de 10% da receita'}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filtros */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#55556a]" />
              <input className="input-dark pl-8" placeholder="Buscar transações…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            <div className="flex gap-1 bg-[#16161f] rounded-xl p-1 border border-[#1e1e2e]">
              {([
                { v: 'all',     l: 'Todas' },
                { v: 'income',  l: 'Receitas' },
                { v: 'expense', l: 'Despesas' },
                { v: 'wanted',  l: '🛒 Desejadas' },
              ] as const).map(({ v, l }) => (
                <button key={v} onClick={() => setTypeF(v)}
                  className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    typeF === v ? 'bg-[#1e1e2e] text-[#e8e8f0]' : 'text-[#55556a] hover:text-[#e8e8f0]')}>
                  {l}
                </button>
              ))}
            </div>

            <select className="input-dark w-auto text-xs" value={monthF} onChange={e => setMonthF(e.target.value)}>
              <option value="">Todos os meses</option>
              {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <select className="input-dark w-auto text-xs" value={catF} onChange={e => setCatF(e.target.value)}>
              <option value="">Todas as categorias</option>
              {allCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>

            <AccountSelect className="input-dark w-auto text-xs" value={accountF} onChange={setAccountF} allLabel="Todas as contas" />
          </div>
        </Card>

        {/* Insights + Anomaly Alerts */}
        {(() => {
          const expTx = filtered.filter(t => t.type === 'expense' && !t.isWanted)
          const hasAnomalies = anomalyAlerts.length > 0 && (!monthF || monthF === `${curYear}-${String(curMonth).padStart(2, '0')}`)
          if (expTx.length < 2 && !hasAnomalies) return null

          const totalExp = expTx.reduce((s, t) => s + toBRL(t), 0)
          const insights: { icon: string; text: string; badge?: string; isAlert?: boolean }[] = []

          // Anomaly alerts first
          if (hasAnomalies) {
            anomalyAlerts.forEach(a => {
              insights.push({
                icon: '⚠️',
                text: `${a.catIcon} ${a.catName} subiu ${a.pct.toFixed(0)}% vs mês anterior — ${formatBRL(a.cur, true)} vs ${formatBRL(a.prev, true)}.`,
                badge: `+${a.pct.toFixed(0)}%`,
                isAlert: true,
              })
            })
          }

          if (expTx.length >= 2) {
            const catMap = new Map<string, number>()
            expTx.forEach(t => catMap.set(t.category, (catMap.get(t.category) ?? 0) + toBRL(t)))
            const sortedCats = [...catMap.entries()].sort((a, b) => b[1] - a[1])
            const [topCatId, topCatAmt] = sortedCats[0]
            const topCatName = allCategories.find(c => c.id === topCatId)?.name ?? topCatId
            const topCatPct = totalExp > 0 ? (topCatAmt / totalExp * 100).toFixed(0) : '0'
            const biggestTx = [...expTx].sort((a, b) => toBRL(b) - toBRL(a))[0]

            const descCount = new Map<string, { count: number; total: number }>()
            expTx.forEach(t => {
              const key = t.description.toLowerCase().slice(0, 20)
              const cur = descCount.get(key) ?? { count: 0, total: 0 }
              descCount.set(key, { count: cur.count + 1, total: cur.total + toBRL(t) })
            })
            const recurring = [...descCount.entries()].filter(([, v]) => v.count >= 2).sort((a, b) => b[1].total - a[1].total)

            const streamTx    = expTx.filter(t => t.category === 'streaming')
            const streamTotal = streamTx.reduce((s, t) => s + toBRL(t), 0)

            insights.push({ icon: '📊', text: `Maior categoria: ${topCatName} = ${formatBRL(topCatAmt, true)} (${topCatPct}% das despesas)`, badge: parseFloat(topCatPct) > 40 ? 'Concentrada' : undefined })
            insights.push({ icon: '💸', text: `Maior gasto único: "${biggestTx.description}" — ${formatBRL(toBRL(biggestTx), true)} em ${formatDate(biggestTx.date)}` })

            if (streamTx.length >= 2)
              insights.push({ icon: '📺', text: `${streamTx.length} serviços de streaming — ${formatBRL(streamTotal, true)}/mês. Avalie quais realmente usa.`, badge: 'Otimizar' })

            if (recurring.length > 0) {
              const [, { count, total }] = recurring[0]
              insights.push({ icon: '🔁', text: `Descrição recorrente aparece ${count}× no período — total ${formatBRL(total, true)}. Considere tornar recorrente.` })
            }

            if (sortedCats.length >= 3) {
              const top3Total = sortedCats.slice(0, 3).reduce((s, [, v]) => s + v, 0)
              const top3Pct   = totalExp > 0 ? (top3Total / totalExp * 100).toFixed(0) : '0'
              insights.push({ icon: '📈', text: `Top 3 categorias representam ${top3Pct}% das despesas. Concentração pode limitar flexibilidade.` })
            }
          }

          if (insights.length === 0) return null

          return (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="text-base">💡</span>
                  <CardTitle>Insights de Otimização</CardTitle>
                  <span className="text-[10px] text-[#55556a] ml-auto">{expTx.length} despesas analisadas</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-0">
                {insights.map((ins, i) => (
                  <div key={i} className={clsx(
                    'flex items-start gap-2.5 text-xs py-2.5 border-b border-[#1e1e2e] last:border-0',
                    ins.isAlert ? 'text-[#f59e0b]' : 'text-[#8888aa]'
                  )}>
                    <span className="flex-shrink-0 text-sm">{ins.icon}</span>
                    <span className="flex-1">{ins.text}</span>
                    {ins.badge && (
                      <span className={clsx('flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border',
                        ins.isAlert
                          ? 'bg-[#ff4466]/15 text-[#ff4466] border-[#ff4466]/25'
                          : 'bg-[#ff7a00]/15 text-[#ff7a00] border-[#ff7a00]/25'
                      )}>
                        {ins.badge}
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )
        })()}

        {/* Tabela */}
        <Card className="overflow-hidden">
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-[#ff7a00]/10 border-b border-[#ff7a00]/20">
              <span className="text-xs text-[#ff7a00] font-semibold whitespace-nowrap">{selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}</span>
              <select value={bulkCat} onChange={e => setBulkCat(e.target.value)}
                className="text-xs bg-[#16161f] border border-[#1e1e2e] text-[#8888aa] rounded-lg px-2 py-1 focus:outline-none">
                <option value="">Mudar categoria…</option>
                {allCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
              <AccountSelect className="text-xs bg-[#16161f] border border-[#1e1e2e] text-[#8888aa] rounded-lg px-2 py-1 focus:outline-none"
                value={bulkAccount} onChange={setBulkAccount} allLabel="Mudar conta…" />
              <input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)}
                className="text-xs bg-[#16161f] border border-[#1e1e2e] text-[#8888aa] rounded-lg px-2 py-1 focus:outline-none" title="Mudar data" />
              <input type="text" value={bulkDesc} onChange={e => setBulkDesc(e.target.value)}
                placeholder="Mudar descrição…"
                className="text-xs bg-[#16161f] border border-[#1e1e2e] text-[#8888aa] rounded-lg px-2 py-1 focus:outline-none min-w-[140px]" />
              <select value={bulkType} onChange={e => setBulkType(e.target.value as any)}
                className="text-xs bg-[#16161f] border border-[#1e1e2e] text-[#8888aa] rounded-lg px-2 py-1 focus:outline-none">
                <option value="">Manter tipo</option>
                <option value="income">Receita</option>
                <option value="expense">Despesa</option>
              </select>
              <button
                onClick={async () => {
                  const toUpdate = transactions.filter(t => selectedIds.has(t.id))
                  for (const t of toUpdate) {
                    await updateTransaction({
                      ...t,
                      ...(bulkCat     ? { category:    bulkCat } : {}),
                      ...(bulkAccount ? { account:     bulkAccount } : {}),
                      ...(bulkDate    ? { date:        bulkDate } : {}),
                      ...(bulkDesc    ? { description: bulkDesc } : {}),
                      ...(bulkType    ? { type:        bulkType as 'income' | 'expense' } : {}),
                    })
                  }
                  clearSel()
                  setBulkCat(''); setBulkAccount(''); setBulkDate(''); setBulkDesc(''); setBulkType('')
                }}
                disabled={!bulkCat && !bulkAccount && !bulkDate && !bulkDesc && !bulkType}
                className="btn-primary text-xs py-1 px-3 disabled:opacity-40">
                Aplicar
              </button>
              <button
                onClick={async () => {
                  if (!window.confirm(`Excluir ${selectedIds.size} transação(ões)? Esta ação não pode ser desfeita.`)) return
                  for (const id of Array.from(selectedIds)) await deleteTransaction(id)
                  clearSel()
                }}
                className="flex items-center gap-1 text-xs py-1 px-3 rounded-lg bg-[#ff4466]/15 text-[#ff4466] border border-[#ff4466]/30 hover:bg-[#ff4466]/25 transition-colors">
                <Trash2 className="w-3 h-3" /> Excluir
              </button>
              <button onClick={clearSel} className="text-xs text-[#55556a] hover:text-[#e8e8f0]">Cancelar</button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  <th className="px-3 py-3 w-8">
                    <input type="checkbox" className="w-3.5 h-3.5 accent-[#ff7a00] cursor-pointer"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={() => selectedIds.size === filtered.length ? clearSel() : selectAll()} />
                  </th>
                  {([
                    { label: 'Data',      field: 'date'        as SortField },
                    { label: 'Descrição', field: 'description' as SortField },
                    { label: 'Categoria', field: 'category'    as SortField },
                    { label: 'Conta',     field: null },
                    { label: 'Valor',     field: 'amount'      as SortField },
                    { label: 'Tipo',      field: null },
                    { label: '',          field: null },
                  ]).map(({ label, field }) => (
                    <th key={label}
                      className={clsx('px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-[#55556a]',
                        field && 'cursor-pointer hover:text-[#e8e8f0] select-none')}
                      onClick={() => field && toggleSort(field)}>
                      <span className="flex items-center gap-1">
                        {label}
                        {field && <SortIcon field={field} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-[#55556a] text-sm">Nenhuma transação encontrada</td></tr>
                )}
                {filtered.map(t => {
                  const cat = allCategories.find(c => c.id === t.category)
                  const amtBRL = toBRL(t)
                  return (
                    <tr key={t.id} className={clsx('hover:bg-[#16161f]/50 transition-colors group', t.isWanted && 'opacity-70 italic')}>
                      <td className="px-3 py-3">
                        <input type="checkbox" className="w-3.5 h-3.5 accent-[#ff7a00] cursor-pointer"
                          checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} />
                      </td>
                      <td className="px-4 py-3 text-xs text-[#8888aa] font-mono whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[#e8e8f0] font-medium truncate max-w-xs">{t.description}</p>
                          {t.isWanted && <span className="text-[10px] bg-[#8b5cf6]/20 text-[#8b5cf6] px-1.5 py-0.5 rounded flex-shrink-0">Desejada</span>}
                          {t.installmentCount && <span className="text-[10px] bg-[#ff7a00]/15 text-[#ff7a00] px-1.5 py-0.5 rounded flex-shrink-0">{t.installmentNumber}/{t.installmentCount}×</span>}
                        </div>
                        {t.notes && <p className="text-[10px] text-[#55556a] truncate">{t.notes}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {t.category === 'imposto' || (cat?.name ?? '').toLowerCase() === 'impostos' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-medium">
                            <span>{cat?.icon ?? '🧾'}</span>{cat?.name ?? t.category}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs text-[#8888aa]">
                            <span>{cat?.icon ?? '📦'}</span>{cat?.name ?? t.category}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#55556a]">{t.account}</td>
                      <td className="px-4 py-3">
                        <div>
                          <span className={clsx('font-semibold text-sm', t.type === 'income' ? 'text-[#00ff88]' : 'text-[#ff4466]')}>
                            {t.type === 'income' ? '+' : '-'}{formatBRL(amtBRL)}
                          </span>
                          {t.currency && t.currency !== 'BRL' && (
                            <p className="text-[10px] text-[#55556a]">
                              {t.currency === 'USD' ? '$' : '€'}{t.amount.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={t.type === 'income' ? 'income' : 'expense'}>
                          {t.type === 'income' ? 'receita' : 'despesa'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {(t.attachmentIds?.length ?? 0) > 0 && <Paperclip className="w-3.5 h-3.5 text-[#00d4ff]" />}
                          <button onClick={() => setEditTx(t)}
                            className="w-6 h-6 rounded-lg hover:bg-[#00d4ff]/15 text-[#55556a] hover:text-[#00d4ff] flex items-center justify-center transition-colors" title="Editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteTransaction(t.id)}
                            className="w-6 h-6 rounded-lg hover:bg-[#ff4466]/15 text-[#55556a] hover:text-[#ff4466] flex items-center justify-center transition-colors" title="Apagar">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-[#1e1e2e] flex items-center justify-between">
            <p className="text-xs text-[#55556a]">
              {filtered.length} transaç{filtered.length !== 1 ? 'ões' : 'ão'} · {transactions.length} no total
            </p>
          </div>
        </Card>
      </div>

      {/* Modals */}
      <AddTransactionModal open={activeModal === 'add-transaction'} onClose={() => setModal(null)} />
      <AddTransactionModal open={!!editTx} onClose={() => setEditTx(undefined)} initial={editTx} />
      <RecurringModal
        open={showSubModal}
        onClose={() => { setShowSubModal(false); setEditSub(undefined) }}
        initial={editSub}
      />
    </div>
  )
}
