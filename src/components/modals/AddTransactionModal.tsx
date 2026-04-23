import React, { useState, useEffect, useMemo } from 'react'
import { Modal, ModalFooter } from '../ui/Modal'
import { useStore } from '../../store/useStore'
import { PAYMENT_METHODS, SUGGESTED_CATEGORIES } from '../../lib/types'
import { Plus, X, Scissors, TrendingUp, TrendingDown } from 'lucide-react'
import { AccountSelect } from '../ui/AccountSelect'
import type { Transaction } from '../../lib/types'
import { useCategoriesForType, useAllCategories } from '../../lib/useCategories'
import { todayISO, formatBRL } from '../../lib/formatters'
import { FormulaInput } from '../ui/FormulaInput'

interface Props {
  open: boolean
  onClose: () => void
  prefill?: { description?: string; amount?: string; date?: string }
  initial?: Transaction
}

interface SplitLine { id: string; description: string; category: string; amount: string }

const emptyForm = (prefill?: Props['prefill'], defaultAccount = '') => ({
  type:          'expense' as 'income' | 'expense',
  description:   prefill?.description ?? '',
  amount:        prefill?.amount      ?? '',
  date:          prefill?.date        ?? todayISO(),
  category:      'outros',
  account:       defaultAccount,
  notes:         '',
  paymentMethod: '',
  currency:      'BRL' as 'BRL' | 'USD' | 'EUR',
  expenseRegime: 'caixa' as 'caixa' | 'competencia',
  paymentDate:   '',
  isWanted:      false,
  expenseNature: '' as '' | 'fixed' | 'variable' | 'investment',
})

const emptyRecForm = (defaultAccount = '') => ({
  type:           'expense' as 'income' | 'expense',
  description:    '',
  amount:         '',
  category:       'saude',
  account:        defaultAccount,
  paymentMethod:  '',
  billingDay:     '5',
  frequency:      'monthly' as 'monthly' | 'weekly',
  weeklyInterval: '1',
  currency:       'BRL' as 'BRL' | 'USD' | 'EUR',
})

const PRESET_MONTHS = [3, 6, 12, 24, 36]

const emptyInvForm = () => ({
  investmentId: '',
  operation:    'aporte' as 'aporte' | 'resgate',
  amount:       '',
  date:         todayISO(),
  account:      '',
})

export function AddTransactionModal({ open, onClose, prefill, initial }: Props) {
  const {
    addTransaction, updateTransaction, addSubscription, updateInvestment,
    settings, addCustomCategory, transactions, investments, saveCustomPaymentMethod,
  } = useStore()
  const isEdit = !!initial

  const defaultAccount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of transactions) {
      if (!t.account) continue
      counts.set(t.account, (counts.get(t.account) ?? 0) + 1)
    }
    let best = ''; let max = 0
    for (const [acc, n] of counts) if (n > max) { max = n; best = acc }
    return best || settings.defaultInstitutionBRL || ''
  }, [transactions, settings.defaultInstitutionBRL])

  const [mode, setMode] = useState<'one-time' | 'recurring' | 'investment'>('one-time')
  const [form, setForm] = useState(() =>
    initial
      ? { type: initial.type, description: initial.description,
          amount: String(initial.amount), date: initial.date,
          category: initial.category, account: initial.account,
          notes: initial.notes ?? '', paymentMethod: initial.paymentMethod ?? '',
          currency: initial.currency ?? 'BRL' as 'BRL' | 'USD' | 'EUR',
          expenseRegime: (initial.expenseRegime ?? 'caixa') as 'caixa' | 'competencia',
          paymentDate: initial.paymentDate ?? '',
          isWanted: initial.isWanted ?? false,
          expenseNature: (initial.expenseNature ?? '') as '' | 'fixed' | 'variable' | 'investment' }
      : emptyForm(prefill, defaultAccount)
  )
  const [saving, setSaving] = useState(false)

  // Recurring form state
  const [recForm, setRecForm] = useState(() => emptyRecForm(defaultAccount))
  const [generateMonths, setGenerateMonths] = useState<number | 'permanent' | 'this-year'>(0)
  const [customMonths, setCustomMonths] = useState('')

  // Investment form state
  const [invForm, setInvForm] = useState(emptyInvForm)
  const updInv = (k: string, v: string) => setInvForm(f => ({ ...f, [k]: v }))

  // Smart categorization suggestion
  const [smartCatSuggestion, setSmartCatSuggestion] = useState<string | null>(null)

  // Installment mode
  const [installMode, setInstallMode] = useState(false)
  const [installCount, setInstallCount] = useState('2')

  // Split mode
  const [splitMode, setSplitMode] = useState(false)
  const [splits, setSplits] = useState<SplitLine[]>([
    { id: '1', description: '', category: 'outros', amount: '' },
    { id: '2', description: '', category: 'outros', amount: '' },
  ])

  // Re-initialise whenever the modal opens
  useEffect(() => {
    if (!open) return
    setMode('one-time')
    setGenerateMonths(0)
    setCustomMonths('')
    setInvForm(emptyInvForm())
    setInstallMode(false)
    setInstallCount('2')
    setSplitMode(false)
    setSplits([
      { id: '1', description: '', category: 'outros', amount: '' },
      { id: '2', description: '', category: 'outros', amount: '' },
    ])
    setSmartCatSuggestion(null)
    if (initial) {
      setForm({
        type:          initial.type,
        description:   initial.description,
        amount:        String(initial.amount),
        date:          initial.date,
        category:      initial.category,
        account:       initial.account,
        notes:         initial.notes ?? '',
        paymentMethod: initial.paymentMethod ?? '',
        currency:      initial.currency ?? 'BRL',
        expenseRegime: initial.expenseRegime ?? 'caixa',
        paymentDate:   initial.paymentDate ?? '',
        isWanted:      initial.isWanted ?? false,
        expenseNature: initial.expenseNature ?? '',
      })
    } else {
      setForm(emptyForm(prefill, defaultAccount))
      setRecForm(emptyRecForm(defaultAccount))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id])

  // Smart categorization: suggest category based on description history
  useEffect(() => {
    setSmartCatSuggestion(null)
    if (!form.description || form.description.length < 3 || isEdit) return
    const desc = form.description.toLowerCase()
    const hist = transactions.filter(t =>
      t.type === form.type &&
      t.description.toLowerCase().includes(desc.slice(0, Math.min(desc.length, 15)))
    )
    if (hist.length >= 2) {
      const counts = new Map<string, number>()
      hist.forEach(t => counts.set(t.category, (counts.get(t.category) ?? 0) + 1))
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
      if (best[0] !== form.category) setSmartCatSuggestion(best[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.description, form.type])

  useEffect(() => {
    setRecForm(f => ({ ...f, account: defaultAccount }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recForm.type])

  const upd = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))
  const updRec = (k: string, v: string) => setRecForm(f => ({ ...f, [k]: v }))

  const filteredCats = useCategoriesForType(form.type)
  const recCats = useCategoriesForType(recForm.type)
  const allCats = useAllCategories()

  const [newCatOpen, setNewCatOpen] = useState(false)
  const [newCat, setNewCat] = useState({ name: '', icon: '📦', color: '#ff7a00' })
  const [newPmOpen, setNewPmOpen] = useState(false)
  const [newPm, setNewPm] = useState('')

  const allPaymentMethods = useMemo(() => {
    const builtin = PAYMENT_METHODS.filter(m => m !== 'Outro')
    const custom = settings.customPaymentMethods ?? []
    return [...builtin, ...custom.filter(c => !builtin.includes(c))]
  }, [settings.customPaymentMethods])

  const handleSaveNewPm = async (target: 'one-time' | 'recurring') => {
    const name = newPm.trim()
    if (!name) { setNewPmOpen(false); return }
    await saveCustomPaymentMethod(name)
    if (target === 'one-time') upd('paymentMethod', name)
    else updRec('paymentMethod', name)
    setNewPm('')
    setNewPmOpen(false)
  }

  const existingNames = new Set(allCats.map(c => c.name.toLowerCase()))
  const suggestions = SUGGESTED_CATEGORIES
    .filter(s => (s.type === form.type || s.type === 'both') && !existingNames.has(s.name.toLowerCase()))
    .slice(0, 8)

  const handleQuickAdd = async (s: typeof SUGGESTED_CATEGORIES[number]) => {
    const id = await addCustomCategory({ ...s })
    if (id) upd('category', id)
  }

  const handleSaveNewCat = async () => {
    const name = newCat.name.trim()
    if (!name) return
    const id = await addCustomCategory({ name, icon: newCat.icon || '📦', color: newCat.color, type: form.type })
    if (id) upd('category', id)
    setNewCat({ name: '', icon: '📦', color: '#ff7a00' })
    setNewCatOpen(false)
  }

  const conversionRate = form.currency === 'USD' ? settings.usdToBrl
    : form.currency === 'EUR' ? (settings.eurToBrl ?? 5.90)
    : 1

  const splitTotal = splits.reduce((s, x) => s + (parseFloat(x.amount.replace(',', '.')) || 0), 0)
  const installAmt = (() => {
    const total = parseFloat(form.amount.replace(',', '.')) || 0
    const count = Math.max(2, parseInt(installCount) || 2)
    return total / count
  })()

  // ── Save ──
  const handleSave = async () => {
    setSaving(true)
    try {
      if (splitMode && !isEdit) {
        for (const s of splits) {
          const amt = parseFloat(s.amount.replace(',', '.'))
          if (isNaN(amt) || amt <= 0) continue
          await addTransaction({
            type:          form.type,
            description:   s.description.trim() || form.description,
            category:      s.category,
            amount:        amt,
            date:          form.date,
            account:       form.account,
            notes:         form.notes || undefined,
            paymentMethod: form.paymentMethod || undefined,
            attachmentIds: [],
            currency:      form.currency,
            expenseRegime: form.type === 'expense' ? form.expenseRegime : undefined,
            paymentDate:   (form.type === 'expense' && form.expenseRegime === 'competencia') ? form.paymentDate || undefined : undefined,
            isWanted:      form.type === 'expense' ? form.isWanted : undefined,
            expenseNature: (form.type === 'expense' && form.expenseNature) ? form.expenseNature : undefined,
          })
        }
      } else if (installMode && !isEdit) {
        const totalAmt = parseFloat(form.amount.replace(',', '.'))
        if (!form.description || isNaN(totalAmt) || totalAmt <= 0) return
        const count = Math.max(2, parseInt(installCount) || 2)
        const perInstall = totalAmt / count
        const base = new Date(form.date + 'T12:00:00')
        const groupId = Date.now().toString(36) + Math.random().toString(36).slice(2)
        for (let i = 0; i < count; i++) {
          const d = new Date(base.getFullYear(), base.getMonth() + i, base.getDate())
          const txDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          await addTransaction({
            type:               form.type,
            description:        `${form.description} (${i + 1}/${count})`,
            category:           form.category,
            amount:             perInstall,
            date:               txDate,
            account:            form.account,
            notes:              form.notes || undefined,
            paymentMethod:      form.paymentMethod || undefined,
            attachmentIds:      [],
            currency:           form.currency,
            installmentNumber:  i + 1,
            installmentCount:   count,
            installmentGroupId: groupId,
            isWanted:           form.type === 'expense' ? form.isWanted : undefined,
            expenseNature:      (form.type === 'expense' && form.expenseNature) ? form.expenseNature : undefined,
          })
        }
      } else {
        const amount = parseFloat(form.amount.replace(',', '.'))
        if (!form.description || isNaN(amount) || amount <= 0) return
        if (isEdit && initial) {
          await updateTransaction({
            ...initial,
            type:          form.type,
            description:   form.description,
            amount,
            date:          form.date,
            category:      form.category,
            account:       form.account,
            notes:         form.notes || undefined,
            paymentMethod: form.paymentMethod || undefined,
            currency:      form.currency,
            expenseRegime: form.type === 'expense' ? form.expenseRegime : undefined,
            paymentDate:   (form.type === 'expense' && form.expenseRegime === 'competencia') ? form.paymentDate || undefined : undefined,
            isWanted:      form.type === 'expense' ? form.isWanted : undefined,
            expenseNature: (form.type === 'expense' && form.expenseNature) ? form.expenseNature : undefined,
          })
        } else {
          await addTransaction({
            type:          form.type,
            description:   form.description,
            amount,
            date:          form.date,
            category:      form.category,
            account:       form.account,
            notes:         form.notes || undefined,
            paymentMethod: form.paymentMethod || undefined,
            attachmentIds: [],
            currency:      form.currency,
            expenseRegime: form.type === 'expense' ? form.expenseRegime : undefined,
            paymentDate:   (form.type === 'expense' && form.expenseRegime === 'competencia') ? form.paymentDate || undefined : undefined,
            isWanted:      form.type === 'expense' ? form.isWanted : undefined,
            expenseNature: (form.type === 'expense' && form.expenseNature) ? form.expenseNature : undefined,
          })
        }
      }
    } finally {
      setSaving(false)
    }
    onClose()
    if (!isEdit) setForm(emptyForm(prefill))
  }

  // ── Recurring save ──
  const handleSaveRecurring = async () => {
    const amount = parseFloat(recForm.amount.replace(',', '.'))
    if (!recForm.description || isNaN(amount) || amount <= 0) return
    setSaving(true)
    const day = parseInt(recForm.billingDay) || 1
    await addSubscription({
      type:           recForm.type,
      name:           recForm.description.trim(),
      amount,
      currency:       recForm.currency,
      billingDay:     day,
      category:       recForm.category,
      account:        recForm.account,
      isActive:       true,
      startDate:      todayISO(),
      frequency:      recForm.frequency,
      weeklyInterval: parseInt(recForm.weeklyInterval) || 1,
    })

    if (generateMonths === 'this-year') {
      // Generate one transaction per month for every month of the current year (Jan–Dec)
      const year  = new Date().getFullYear()
      for (let m = 0; m < 12; m++) {
        const maxDay = new Date(year, m + 1, 0).getDate()
        const txDay  = Math.min(day, maxDay)
        const txDate = `${year}-${String(m + 1).padStart(2, '0')}-${String(txDay).padStart(2, '0')}`
        await addTransaction({ date: txDate, description: recForm.description.trim(), category: recForm.category, amount, type: recForm.type, account: recForm.account, attachmentIds: [], currency: recForm.currency })
      }
    } else {
      const months = generateMonths === 'permanent' ? 36 : (generateMonths as number)
      if (months > 0) {
        const base = new Date(todayISO() + 'T12:00:00')
        const isWeekly = recForm.frequency === 'weekly'
        const weekInterval = parseInt(recForm.weeklyInterval) || 1
        if (isWeekly) {
          const endDate = new Date(base.getFullYear(), base.getMonth() + months, base.getDate())
          let cur = new Date(base)
          while (cur <= endDate) {
            const txDate = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
            await addTransaction({ date: txDate, description: recForm.description.trim(), category: recForm.category, amount, type: recForm.type, account: recForm.account, attachmentIds: [], currency: recForm.currency })
            cur = new Date(cur.getTime() + weekInterval * 7 * 24 * 3600 * 1000)
          }
        } else {
          for (let m = 0; m < months; m++) {
            const d = new Date(base.getFullYear(), base.getMonth() + m, 1)
            const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
            const txDay  = Math.min(day, maxDay)
            const txDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(txDay).padStart(2, '0')}`
            await addTransaction({ date: txDate, description: recForm.description.trim(), category: recForm.category, amount, type: recForm.type, account: recForm.account, attachmentIds: [], currency: recForm.currency })
          }
        }
      }
    }
    setSaving(false)
    onClose()
  }

  // ── Investment save ──
  const handleSaveInvestment = async () => {
    const amount = parseFloat(invForm.amount.replace(',', '.'))
    if (!invForm.investmentId || isNaN(amount) || amount <= 0) return
    const inv = investments.find(i => i.id === invForm.investmentId)
    if (!inv) return
    setSaving(true)

    const isAporte = invForm.operation === 'aporte'
    const price    = inv.currentPrice > 0 ? inv.currentPrice : 1
    const units    = amount / price

    if (isAporte) {
      const newQty     = inv.quantity + units
      const newAvgCost = ((inv.quantity * inv.avgCost) + amount) / newQty
      await updateInvestment({ ...inv, quantity: newQty, avgCost: newAvgCost })
    } else {
      const newQty = Math.max(0, inv.quantity - units)
      await updateInvestment({ ...inv, quantity: newQty })
    }

    await addTransaction({
      date:         invForm.date || todayISO(),
      description:  `${isAporte ? 'Aporte' : 'Resgate'} — ${inv.name}`,
      category:     'investimentos',
      amount,
      type:         isAporte ? 'expense' : 'income',
      account:      invForm.account || inv.institution,
      attachmentIds: [],
      currency:     inv.currency,
      expenseNature: 'investment',
    })

    setSaving(false)
    onClose()
  }

  const effectiveMonths = generateMonths === 'permanent' ? 36 : generateMonths === 'this-year' ? 12 : (generateMonths as number)

  const saveLabel = (() => {
    if (saving) return 'Salvando…'
    if (isEdit) return 'Salvar Alterações'
    if (splitMode) {
      const valid = splits.filter(s => parseFloat(s.amount.replace(',', '.')) > 0)
      return `Criar ${valid.length} transaç${valid.length !== 1 ? 'ões' : 'ão'}`
    }
    if (installMode) {
      const count = Math.max(2, parseInt(installCount) || 2)
      return `Criar ${count} parcelas`
    }
    return 'Salvar Transação'
  })()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar Transação' : 'Adicionar Transação'}
      description={isEdit ? 'Altere os campos e salve' : 'Registre uma nova receita ou despesa'}
    >
      <div className="px-6 py-5 space-y-4">

        {/* Mode toggle — only for new transactions */}
        {!isEdit && (
          <div className="flex gap-2">
            {(['one-time', 'recurring', 'investment'] as const).map(m => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                  mode === m
                    ? 'bg-[#ff7a00]/15 text-[#ff7a00] border-[#ff7a00]/30'
                    : 'bg-[#16161f] text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]'
                }`}>
                {m === 'one-time' ? 'Pontual' : m === 'recurring' ? 'Recorrente' : '📈 Investimento'}
              </button>
            ))}
          </div>
        )}

        {/* ── ONE-TIME FORM ── */}
        {(isEdit || mode === 'one-time') && (
          <>
            {/* Type toggle */}
            <div className="flex gap-2">
              {(['expense', 'income'] as const).map(t => (
                <button key={t} onClick={() => upd('type', t)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    form.type === t
                      ? t === 'income'
                        ? 'bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/30'
                        : 'bg-[#ff4466]/15 text-[#ff4466] border border-[#ff4466]/30'
                      : 'bg-[#16161f] text-[#55556a] border border-[#1e1e2e] hover:text-[#e8e8f0]'
                  }`}>
                  {t === 'income' ? '↑ Receita' : '↓ Despesa'}
                </button>
              ))}
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Descrição</label>
              <input className="input-dark" placeholder="Ex: iFood, Salário, Uber…"
                value={form.description} onChange={e => upd('description', e.target.value)} />
            </div>

            {/* Smart categorization suggestion */}
            {smartCatSuggestion && (() => {
              const sugCat = allCats.find(c => c.id === smartCatSuggestion)
              if (!sugCat) return null
              return (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#00d4ff]/5 border border-[#00d4ff]/20">
                  <span className="text-sm">🤖</span>
                  <span className="text-xs text-[#8888aa]">Sugestão automática:</span>
                  <button type="button"
                    onClick={() => { upd('category', smartCatSuggestion); setSmartCatSuggestion(null) }}
                    className="text-xs text-[#00d4ff] font-semibold hover:underline">
                    {sugCat.icon} {sugCat.name}
                  </button>
                  <button type="button" onClick={() => setSmartCatSuggestion(null)}
                    className="ml-auto text-[#55556a] hover:text-[#e8e8f0]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })()}

            {/* Currency + Amount + Date */}
            <div className="grid grid-cols-[auto_1fr_1fr] gap-3">
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">Moeda</label>
                <div className="flex flex-col gap-1">
                  {(['BRL', 'USD', 'EUR'] as const).map(c => (
                    <button key={c} type="button" onClick={() => upd('currency', c)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                        form.currency === c
                          ? 'bg-[#ff7a00]/10 text-[#ff7a00] border-[#ff7a00]/30'
                          : 'bg-[#16161f] text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]'
                      }`}>{c}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">
                  Valor {form.currency !== 'BRL' && <span className="text-[#ff7a00]">({form.currency})</span>}
                </label>
                <FormulaInput value={form.amount} onChange={v => upd('amount', v)} placeholder="0,00" />
                {form.currency !== 'BRL' && form.amount && (
                  <p className="text-[10px] text-[#55556a] mt-1">
                    ≈ {formatBRL((parseFloat(form.amount.replace(',', '.')) || 0) * conversionRate)}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">Data</label>
                <input type="date" className="input-dark" value={form.date} onChange={e => upd('date', e.target.value)} />
              </div>
            </div>

            {/* Category */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-[#8888aa]">Categoria</label>
                <button type="button" onClick={() => setNewCatOpen(o => !o)}
                  className="flex items-center gap-1 text-[10px] text-[#ff7a00] hover:text-[#ff9a3f] transition-colors">
                  {newCatOpen ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  {newCatOpen ? 'Cancelar' : 'Nova categoria'}
                </button>
              </div>

              {newCatOpen && (
                <div className="mb-2 p-2.5 rounded-xl border border-[#ff7a00]/30 bg-[#ff7a00]/5 space-y-2">
                  <div className="flex gap-2">
                    <input className="input-dark w-14 text-center text-lg" value={newCat.icon} maxLength={2}
                      onChange={e => setNewCat(c => ({ ...c, icon: e.target.value }))} />
                    <input className="input-dark flex-1" placeholder="Nome (ex: Pet, Vestuário)"
                      value={newCat.name} onChange={e => setNewCat(c => ({ ...c, name: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSaveNewCat())} autoFocus />
                    <input type="color" className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border border-[#1e1e2e]"
                      value={newCat.color} onChange={e => setNewCat(c => ({ ...c, color: e.target.value }))} />
                  </div>
                  <button type="button" onClick={handleSaveNewCat} disabled={!newCat.name.trim()}
                    className="w-full py-1.5 rounded-lg text-xs font-semibold bg-[#ff7a00]/20 text-[#ff7a00] border border-[#ff7a00]/30 hover:bg-[#ff7a00]/30 disabled:opacity-40 disabled:cursor-not-allowed">
                    Adicionar categoria
                  </button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                {filteredCats.map(cat => (
                  <button key={cat.id} onClick={() => upd('category', cat.id)}
                    className={`flex items-center gap-1.5 px-2 py-2 rounded-xl text-xs font-medium border transition-all ${
                      form.category === cat.id
                        ? 'border-[#00d4ff]/40 bg-[#00d4ff]/10 text-[#e8e8f0]'
                        : 'border-[#1e1e2e] bg-[#16161f] text-[#8888aa] hover:text-[#e8e8f0]'
                    }`}>
                    <span>{cat.icon}</span><span className="truncate">{cat.name}</span>
                  </button>
                ))}
              </div>

              {suggestions.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] text-[#55556a] mb-1.5">Adicionar rapidamente</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map(s => (
                      <button key={s.name} type="button" onClick={() => handleQuickAdd(s)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-[#2a2a3e] text-[10px] text-[#8888aa] hover:border-[#ff7a00]/40 hover:text-[#ff7a00] hover:bg-[#ff7a00]/5 transition-all">
                        <span>{s.icon}</span><span>{s.name}</span><Plus className="w-2.5 h-2.5" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Account */}
            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Conta</label>
              <AccountSelect value={form.account} onChange={v => upd('account', v)} placeholder="Selecionar…" />
            </div>

            {/* Payment Method */}
            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Forma de Pagamento</label>
              <div className="flex flex-wrap gap-1.5 items-center">
                {allPaymentMethods.map(pm => (
                  <button key={pm} type="button" onClick={() => upd('paymentMethod', form.paymentMethod === pm ? '' : pm)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      form.paymentMethod === pm
                        ? 'bg-[#ff7a00]/10 text-[#ff7a00] border-[#ff7a00]/30'
                        : 'bg-[#16161f] text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]'
                    }`}>{pm}</button>
                ))}
                {newPmOpen ? (
                  <input autoFocus className="input-dark text-xs px-2.5 py-1.5 w-40" placeholder="Nova forma…"
                    value={newPm} onChange={e => setNewPm(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); handleSaveNewPm('one-time') }
                      if (e.key === 'Escape') { e.preventDefault(); setNewPmOpen(false); setNewPm('') }
                    }}
                    onBlur={() => handleSaveNewPm('one-time')} />
                ) : (
                  <button type="button" onClick={() => { setNewPm(''); setNewPmOpen(true) }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-dashed border-[#2a2a3e] text-[#8888aa] hover:border-[#ff7a00]/40 hover:text-[#ff7a00] hover:bg-[#ff7a00]/5 transition-all">
                    <Plus className="w-3 h-3" /> Outro
                  </button>
                )}
              </div>
            </div>

            {/* ── Advanced options (expenses only) ── */}
            {form.type === 'expense' && (
              <>
                {/* Expense Regime */}
                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">Regime Contábil</label>
                  <div className="flex gap-2">
                    {(['caixa', 'competencia'] as const).map(r => (
                      <button key={r} type="button" onClick={() => upd('expenseRegime', r)}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                          form.expenseRegime === r
                            ? 'bg-[#ff7a00]/10 text-[#ff7a00] border-[#ff7a00]/30'
                            : 'bg-[#16161f] text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]'
                        }`}>
                        {r === 'caixa' ? '💵 Caixa' : '📅 Competência'}
                      </button>
                    ))}
                  </div>
                  {form.expenseRegime === 'competencia' && (
                    <div className="mt-2">
                      <label className="text-xs text-[#8888aa] mb-1.5 block">Data de pagamento da fatura</label>
                      <input type="date" className="input-dark" value={form.paymentDate} onChange={e => upd('paymentDate', e.target.value)} />
                      <p className="text-[10px] text-[#55556a] mt-1">
                        A data acima é quando o dinheiro sai da conta (ex: vencimento do cartão). A data da transação é a data da compra.
                      </p>
                    </div>
                  )}
                </div>

                {/* Expense Nature */}
                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">Natureza (regra 50/30/20)</label>
                  <div className="flex gap-2">
                    {([
                      { v: 'fixed',      l: '🔒 Fixa',         cls: '#3b82f6' },
                      { v: 'variable',   l: '🌊 Variável',      cls: '#f59e0b' },
                      { v: 'investment', l: '📊 Investimento',  cls: '#00ff88' },
                    ] as const).map(({ v, l, cls }) => (
                      <button key={v} type="button"
                        onClick={() => upd('expenseNature', form.expenseNature === v ? '' : v)}
                        style={{ borderColor: form.expenseNature === v ? cls + '55' : undefined, color: form.expenseNature === v ? cls : undefined, background: form.expenseNature === v ? cls + '18' : undefined }}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                          form.expenseNature !== v ? 'bg-[#16161f] text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]' : ''
                        }`}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* Installment mode */}
                {!splitMode && !isEdit && (
                  <div className="p-3 rounded-xl bg-[#16161f] border border-[#1e1e2e]">
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setInstallMode(m => !m)}
                        className="flex items-center gap-2 text-sm font-medium text-[#e8e8f0]">
                        <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${installMode ? 'bg-[#ff7a00]' : 'bg-[#2a2a3e]'}`}>
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${installMode ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                        Parcelado
                      </button>
                      {installMode && (
                        <div className="flex items-center gap-2 ml-auto flex-wrap">
                          <span className="text-xs text-[#8888aa]">Parcelas:</span>
                          <input type="number" min="2" max="60" className="input-dark w-14 text-center text-sm"
                            value={installCount} onChange={e => setInstallCount(e.target.value)} />
                          {form.amount && (
                            <span className="text-xs text-[#55556a]">
                              = {formatBRL(installAmt)}/parcela
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {installMode && (
                      <p className="text-[10px] text-[#55556a] mt-2">
                        Criará {Math.max(2, parseInt(installCount) || 2)} transações mensais a partir de {form.date}, cada uma com (N/total) no nome.
                      </p>
                    )}
                  </div>
                )}

                {/* Want expense toggle */}
                <div className="flex items-center justify-between p-3 bg-[#16161f] rounded-xl border border-[#1e1e2e]">
                  <div>
                    <p className="text-sm text-[#e8e8f0]">Despesa Desejada</p>
                    <p className="text-[10px] text-[#55556a] mt-0.5">Planejada mas ainda não realizada</p>
                  </div>
                  <button type="button" onClick={() => setForm(f => ({ ...f, isWanted: !f.isWanted }))}
                    className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${form.isWanted ? 'bg-[#8b5cf6]' : 'bg-[#2a2a3e]'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${form.isWanted ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              </>
            )}

            {/* Split transactions */}
            {!installMode && !isEdit && (
              <div>
                <button type="button" onClick={() => setSplitMode(m => !m)}
                  className="flex items-center gap-1.5 text-[10px] text-[#ff7a00] hover:text-[#ff9a3f] transition-colors">
                  {splitMode ? <X className="w-3 h-3" /> : <Scissors className="w-3 h-3" />}
                  {splitMode ? 'Cancelar divisão' : 'Dividir por categorias'}
                </button>
                {splitMode && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] text-[#55556a]">
                      Cada linha gera uma transação separada. Use para dividir uma nota fiscal em várias categorias.
                    </p>
                    {splits.map((s) => (
                      <div key={s.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                        <input className="input-dark text-xs" placeholder="Descrição (opcional)…"
                          value={s.description}
                          onChange={e => setSplits(p => p.map(x => x.id === s.id ? { ...x, description: e.target.value } : x))} />
                        <select className="input-dark text-xs" value={s.category}
                          onChange={e => setSplits(p => p.map(x => x.id === s.id ? { ...x, category: e.target.value } : x))}>
                          {filteredCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                        </select>
                        <div className="flex items-center gap-1">
                          <FormulaInput value={s.amount}
                            onChange={v => setSplits(p => p.map(x => x.id === s.id ? { ...x, amount: v } : x))}
                            placeholder="0,00" />
                          {splits.length > 2 && (
                            <button type="button" onClick={() => setSplits(p => p.filter(x => x.id !== s.id))}
                              className="w-6 h-6 rounded-lg hover:bg-[#ff4466]/15 text-[#55556a] hover:text-[#ff4466] flex items-center justify-center flex-shrink-0">
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <button type="button"
                        onClick={() => setSplits(p => [...p, { id: Date.now().toString(), description: '', category: filteredCats[0]?.id ?? 'outros', amount: '' }])}
                        className="flex items-center gap-1 text-[10px] text-[#ff7a00] hover:text-[#ff9a3f]">
                        <Plus className="w-3 h-3" /> Adicionar linha
                      </button>
                      <span className="text-xs text-[#55556a]">
                        Total: <span className="text-[#e8e8f0] font-semibold">{formatBRL(splitTotal)}</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Observações (opcional)</label>
              <input className="input-dark" placeholder="Informações adicionais…"
                value={form.notes} onChange={e => upd('notes', e.target.value)} />
            </div>
          </>
        )}

        {/* ── RECURRING FORM ── */}
        {!isEdit && mode === 'recurring' && (
          <>
            <div className="flex gap-2">
              {(['expense', 'income'] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => { updRec('type', t); updRec('category', t === 'income' ? 'salary' : 'saude') }}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    recForm.type === t
                      ? t === 'income'
                        ? 'bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/30'
                        : 'bg-[#ff4466]/15 text-[#ff4466] border border-[#ff4466]/30'
                      : 'bg-[#16161f] text-[#55556a] border border-[#1e1e2e] hover:text-[#e8e8f0]'
                  }`}>
                  {t === 'income' ? '↑ Receita' : '↓ Despesa'}
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Descrição</label>
              <input className="input-dark"
                placeholder={recForm.type === 'income' ? 'Ex: Salário, Aluguel Recebido…' : 'Ex: Plano de Saúde, INSS…'}
                value={recForm.description} onChange={e => updRec('description', e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">Valor</label>
                <FormulaInput value={recForm.amount} onChange={v => updRec('amount', v)} placeholder="0,00" />
              </div>
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">Moeda</label>
                <select className="input-dark" value={recForm.currency} onChange={e => updRec('currency', e.target.value)}>
                  <option value="BRL">BRL (R$)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Categoria</label>
              <select className="input-dark" value={recForm.category} onChange={e => updRec('category', e.target.value)}>
                {recCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Conta / Instituição</label>
              <input className="input-dark" placeholder="Ex: Nubank, Itaú…"
                value={recForm.account} onChange={e => updRec('account', e.target.value)} />
            </div>

            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Frequência</label>
              <div className="flex gap-2">
                {(['monthly', 'weekly'] as const).map(f => (
                  <button key={f} type="button" onClick={() => updRec('frequency', f)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      recForm.frequency === f
                        ? 'bg-[#ff7a00]/10 text-[#ff7a00] border-[#ff7a00]/30'
                        : 'bg-[#16161f] text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]'
                    }`}>
                    {f === 'monthly' ? '📅 Mensal' : '🗓 Semanal'}
                  </button>
                ))}
              </div>
            </div>

            {recForm.frequency === 'monthly' ? (
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">Dia do mês (1–28)</label>
                <input type="number" min="1" max="28" className="input-dark"
                  value={recForm.billingDay} onChange={e => updRec('billingDay', e.target.value)} />
              </div>
            ) : (
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">Repetir a cada (semanas)</label>
                <input type="number" min="1" max="52" className="input-dark"
                  value={recForm.weeklyInterval} onChange={e => updRec('weeklyInterval', e.target.value)} />
              </div>
            )}

            <div>
              <label className="text-xs text-[#8888aa] mb-2 block">Gerar lançamentos no Fluxo de Caixa</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {PRESET_MONTHS.map(n => (
                  <button key={n} type="button" onClick={() => { setGenerateMonths(n); setCustomMonths('') }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      generateMonths === n
                        ? 'bg-[#ff7a00]/10 text-[#ff7a00] border-[#ff7a00]/30'
                        : 'bg-[#16161f] text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]'
                    }`}>{n}m</button>
                ))}
                <button type="button" onClick={() => { setGenerateMonths('this-year'); setCustomMonths('') }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    generateMonths === 'this-year'
                      ? 'bg-[#ff7a00]/10 text-[#ff7a00] border-[#ff7a00]/30'
                      : 'bg-[#16161f] text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]'
                  }`}>Este ano</button>
                <button type="button" onClick={() => { setGenerateMonths('permanent'); setCustomMonths('') }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    generateMonths === 'permanent'
                      ? 'bg-[#ff7a00]/10 text-[#ff7a00] border-[#ff7a00]/30'
                      : 'bg-[#16161f] text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]'
                  }`}>Permanente</button>
                <div className="flex items-center gap-1.5">
                  <input type="number" min="1" max="120" placeholder="Outro…"
                    className="input-dark text-xs py-1.5 px-2 w-20" value={customMonths}
                    onChange={e => { const v = e.target.value; setCustomMonths(v); const n = parseInt(v); if (!isNaN(n) && n > 0) setGenerateMonths(n) }} />
                  <span className="text-xs text-[#55556a]">meses</span>
                </div>
              </div>
              {effectiveMonths > 0 && (
                <p className="text-[10px] text-[#55556a]">
                  Criará {effectiveMonths} lançamento{effectiveMonths !== 1 ? 's' : ''} no Fluxo de Caixa
                  {generateMonths === 'permanent' ? ' (Permanente = 36 meses)' : ''}
                  {generateMonths === 'this-year' ? ` (Jan–Dez de ${new Date().getFullYear()})` : ''}
                </p>
              )}
            </div>
          </>
        )}

        {/* ── INVESTMENT FORM ── */}
        {!isEdit && mode === 'investment' && (
          <>
            {/* Aporte / Resgate toggle */}
            <div className="flex gap-2">
              {(['aporte', 'resgate'] as const).map(op => (
                <button key={op} type="button"
                  onClick={() => updInv('operation', op)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-2 ${
                    invForm.operation === op
                      ? op === 'aporte'
                        ? 'bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/30'
                        : 'bg-[#ff4466]/10 text-[#ff4466] border-[#ff4466]/30'
                      : 'bg-[#16161f] text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]'
                  }`}>
                  {op === 'aporte'
                    ? <><TrendingUp className="w-4 h-4" /> Aporte</>
                    : <><TrendingDown className="w-4 h-4" /> Resgate</>}
                </button>
              ))}
            </div>

            {/* Investment selector */}
            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Investimento</label>
              {investments.length === 0 ? (
                <p className="text-xs text-[#55556a] py-2">Nenhum investimento cadastrado ainda.</p>
              ) : (
                <select
                  className="input-dark"
                  value={invForm.investmentId}
                  onChange={e => updInv('investmentId', e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {investments.map(inv => {
                    const total = (inv.quantity * inv.currentPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
                    return (
                      <option key={inv.id} value={inv.id}>
                        {inv.name}{inv.institution ? ` — ${inv.institution}` : ''} ({total})
                      </option>
                    )
                  })}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">
                  Valor ({invForm.operation === 'aporte' ? 'aportado' : 'resgatado'})
                </label>
                <FormulaInput value={invForm.amount} onChange={v => updInv('amount', v)} placeholder="0,00" />
              </div>
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">Data</label>
                <input type="date" className="input-dark" value={invForm.date} onChange={e => updInv('date', e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Conta / Instituição</label>
              <input className="input-dark" placeholder="Ex: XP, Clear, NuInvest…"
                value={invForm.account} onChange={e => updInv('account', e.target.value)} />
            </div>

            {invForm.investmentId && invForm.amount && (
              <div className="p-3 rounded-xl text-xs text-[#55556a] space-y-0.5"
                style={{ background: 'rgba(255,122,0,0.04)', border: '1px solid rgba(255,122,0,0.1)' }}>
                {(() => {
                  const inv = investments.find(i => i.id === invForm.investmentId)
                  const amt = parseFloat(invForm.amount.replace(',', '.'))
                  if (!inv || isNaN(amt)) return null
                  const price = inv.currentPrice > 0 ? inv.currentPrice : 1
                  const units = amt / price
                  const newQty = invForm.operation === 'aporte'
                    ? inv.quantity + units
                    : Math.max(0, inv.quantity - units)
                  const newVal = newQty * inv.currentPrice
                  return <>
                    <p>Novo saldo: <span className="text-[#e8e8f0] font-semibold">{newVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></p>
                    <p>Uma transação de <span className="text-[#e8e8f0] font-semibold">{invForm.operation === 'aporte' ? 'despesa' : 'receita'}</span> será registrada no fluxo de caixa.</p>
                  </>
                })()}
              </div>
            )}
          </>
        )}
      </div>

      <ModalFooter>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        {(isEdit || mode === 'one-time') ? (
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saveLabel}
          </button>
        ) : mode === 'investment' ? (
          <button className="btn-primary" onClick={handleSaveInvestment}
            disabled={saving || !invForm.investmentId || !invForm.amount}>
            {saving ? 'Salvando…' : invForm.operation === 'aporte' ? '↑ Registrar Aporte' : '↓ Registrar Resgate'}
          </button>
        ) : (
          <button className="btn-primary" onClick={handleSaveRecurring}
            disabled={saving || !recForm.description || !recForm.amount}>
            {saving ? 'Salvando…'
              : effectiveMonths > 0 ? `Adicionar + ${effectiveMonths} lançamentos`
              : 'Adicionar Recorrência'}
          </button>
        )}
      </ModalFooter>
    </Modal>
  )
}
