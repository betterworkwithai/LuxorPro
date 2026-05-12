// ─────────────────────────────────────────────
//  Recurring transaction modal — add or edit a
//  RecurringTransaction (mensal / semanal cadence).
//  Optionally backfills the cashflow with N past
//  occurrences on creation.
//
//  Extracted from legacy Cashflow.tsx so both the
//  legacy and V2 surfaces can render the same UI.
// ─────────────────────────────────────────────
import React, { useState, useEffect } from 'react'
import { ToggleLeft, ToggleRight } from 'lucide-react'
import { Modal, ModalFooter } from '../ui/Modal'
import { useStore } from '../../store/useStore'
import { useAllCategories } from '../../lib/useCategories'
import { FormulaInput } from '../ui/FormulaInput'
import { AccountSelect } from '../ui/AccountSelect'
import type { RecurringTransaction } from '../../lib/types'

const emptyRec = (type: 'income' | 'expense' = 'expense') => ({
  type,
  name: '', amount: '', currency: 'BRL' as 'BRL' | 'USD' | 'EUR',
  billingDay: '5', category: type === 'income' ? 'salary' : 'saude',
  account: 'Nubank', isActive: true, startDate: '', notes: '',
  frequency: 'monthly' as 'monthly' | 'weekly',
  weeklyInterval: '1',
})

export function RecurringModal({
  open, onClose, initial,
}: {
  open: boolean
  onClose: () => void
  initial?: RecurringTransaction
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
      : emptyRec(),
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
