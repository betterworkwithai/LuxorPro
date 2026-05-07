import React, { useMemo, useState } from 'react'
import { Trash2, AlertTriangle, CheckCircle2, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { clsx } from 'clsx'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card'
import { useStore } from '../../store/useStore'
import { findAllDuplicateGroups } from '../../lib/duplicateCheck'
import { formatBRL } from '../../lib/formatters'
import type { Transaction } from '../../lib/types'

/**
 * Inline duplicates section for the Fluxo de Caixa page.
 * Shows every group of transactions sharing exact date + description + amount.
 * Hidden when there are no duplicates.
 */
export function DuplicatesSection() {
  const transactions      = useStore(s => s.transactions)
  const deleteTransaction = useStore(s => s.deleteTransaction)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [busy, setBusy]             = useState(false)
  const [doneCount, setDoneCount]   = useState<number | null>(null)
  const [open, setOpen]             = useState(false)

  const groups = useMemo(
    () => findAllDuplicateGroups(transactions),
    [transactions],
  )

  const defaultSelected = useMemo(() => {
    const s = new Set<string>()
    for (const g of groups) for (let i = 1; i < g.length; i++) s.add(g[i].id)
    return s
  }, [groups])

  // Whenever the underlying group set changes, reset selection to "all extras".
  React.useEffect(() => {
    setPendingIds(new Set(defaultSelected))
  }, [defaultSelected])

  // Hide entirely when there are no duplicates and nothing to celebrate.
  if (groups.length === 0 && doneCount === null) return null

  const totalDuplicates = groups.reduce((sum, g) => sum + (g.length - 1), 0)

  const toggleId = (id: string) =>
    setPendingIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const selectAll = () => setPendingIds(new Set(defaultSelected))
  const clearAll  = () => setPendingIds(new Set())

  const handleDelete = async () => {
    if (pendingIds.size === 0) return
    setBusy(true)
    try {
      let deleted = 0
      for (const id of pendingIds) {
        await deleteTransaction(id)
        deleted++
      }
      setDoneCount(deleted)
      setPendingIds(new Set())
      // Auto-clear the success message after a few seconds
      setTimeout(() => setDoneCount(null), 5000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-[#f59e0b]/25">
      <CardHeader>
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between gap-3 text-left"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2">
            <Copy className="w-4 h-4 text-[#f59e0b]" />
            <CardTitle>
              {groups.length > 0
                ? <>Duplicatas detectadas <span className="text-[#f59e0b]">({groups.length})</span></>
                : <>Duplicatas</>}
            </CardTitle>
          </div>
          <div className="flex items-center gap-3">
            {groups.length > 0 && (
              <span className="text-[10px] uppercase tracking-widest text-[#55556a] font-semibold hidden sm:inline">
                {totalDuplicates} extra{totalDuplicates === 1 ? '' : 's'}
              </span>
            )}
            {open
              ? <ChevronUp className="w-4 h-4 text-[#55556a]" />
              : <ChevronDown className="w-4 h-4 text-[#55556a]" />}
          </div>
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">

          {doneCount !== null && doneCount > 0 && (
            <div role="status" aria-live="polite"
                 className="flex items-center gap-3 p-3 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/25">
              <CheckCircle2 className="w-5 h-5 text-[#00ff88] flex-shrink-0" />
              <p className="text-sm font-semibold text-[#00ff88]">
                {doneCount} lançamento{doneCount === 1 ? '' : 's'} duplicado{doneCount === 1 ? '' : 's'} removido{doneCount === 1 ? '' : 's'}
              </p>
            </div>
          )}

          {groups.length === 0 ? (
            <p className="text-xs text-[#55556a]">
              Nenhuma duplicata encontrada. Lançamentos com a mesma data, descrição e valor aparecerão aqui automaticamente.
            </p>
          ) : (
            <>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-[#f59e0b]/8 border border-[#f59e0b]/20">
                <AlertTriangle className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" />
                <p className="text-xs text-[#8888aa] flex-1">
                  Lançamentos abaixo têm <strong className="text-[#e8e8f0]">mesma data, descrição e valor</strong>.
                  Por padrão mantemos o mais antigo de cada grupo. Desmarque qualquer item que queira preservar.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[10px] uppercase tracking-widest text-[#55556a] font-semibold">
                  {pendingIds.size} de {totalDuplicates} marcados para remoção
                </p>
                <div className="flex gap-2 items-center">
                  <button onClick={selectAll}
                          className="text-xs text-[#8888aa] hover:text-[#e8e8f0] px-2 py-1" type="button">
                    Marcar padrão
                  </button>
                  <button onClick={clearAll}
                          className="text-xs text-[#8888aa] hover:text-[#e8e8f0] px-2 py-1" type="button">
                    Desmarcar tudo
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={busy || pendingIds.size === 0}
                    className={clsx(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold',
                      'bg-[#ff4466] text-white hover:bg-[#e0395a] transition-colors',
                      'disabled:opacity-40 disabled:cursor-not-allowed',
                    )}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {busy
                      ? 'Removendo…'
                      : `Remover ${pendingIds.size}`}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {groups.map((group, gi) => (
                  <DuplicateGroup
                    key={`${group[0].id}-${gi}`}
                    group={group}
                    pendingIds={pendingIds}
                    onToggle={toggleId}
                  />
                ))}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function DuplicateGroup({
  group, pendingIds, onToggle,
}: {
  group: Transaction[]
  pendingIds: Set<string>
  onToggle: (id: string) => void
}) {
  const sample = group[0]
  return (
    <div className="rounded-xl border border-[#1e1e2e] bg-[#0d0d14] overflow-hidden">
      <div className="px-3 py-2 bg-[#16161f]/60 border-b border-[#1e1e2e] flex items-center gap-2">
        <p className="text-xs font-semibold text-[#e8e8f0] truncate flex-1">{sample.description}</p>
        <span className="text-[10px] text-[#8888aa] font-mono whitespace-nowrap">{sample.date}</span>
        <span className={clsx(
          'text-xs font-bold font-mono',
          sample.type === 'expense' ? 'text-[#ff4466]' : 'text-[#00ff88]',
        )}>
          {sample.type === 'expense' ? '−' : '+'}{formatBRL(sample.amount)}
        </span>
        <span className="text-[10px] text-[#55556a] font-mono whitespace-nowrap">×{group.length}</span>
      </div>

      <div className="divide-y divide-[#1e1e2e]">
        {group.map((tx, idx) => {
          const isOldest = idx === 0
          const isMarked = pendingIds.has(tx.id)
          return (
            <label
              key={tx.id}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 cursor-pointer text-xs transition-colors',
                isMarked ? 'bg-[#ff4466]/8 hover:bg-[#ff4466]/12' : 'hover:bg-[#16161f]/40',
              )}
            >
              <input
                type="checkbox"
                checked={isMarked}
                onChange={() => onToggle(tx.id)}
                className="w-4 h-4 accent-[#ff4466] flex-shrink-0"
              />
              <span className="text-[#8888aa] truncate flex-1">{tx.account}</span>
              <span className="text-[10px] text-[#55556a]">{tx.category}</span>
              {isOldest && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20 whitespace-nowrap">
                  mais antigo
                </span>
              )}
              {isMarked && (
                <span className="text-[10px] text-[#ff4466] font-semibold whitespace-nowrap">
                  remover
                </span>
              )}
            </label>
          )
        })}
      </div>
    </div>
  )
}
