import React, { useMemo, useState } from 'react'
import { Trash2, AlertTriangle, CheckCircle2, Copy } from 'lucide-react'
import { clsx } from 'clsx'
import { Modal, ModalFooter } from '../ui/Modal'
import { useStore } from '../../store/useStore'
import { findAllDuplicateInvestmentGroups } from '../../lib/duplicateCheck'
import { formatBRL } from '../../lib/formatters'
import type { Investment } from '../../lib/types'

interface Props {
  open: boolean
  onClose: () => void
}

export function InvestmentDeduplicateModal({ open, onClose }: Props) {
  const investments      = useStore(s => s.investments)
  const deleteInvestment = useStore(s => s.deleteInvestment)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [busy, setBusy]             = useState(false)
  const [doneCount, setDoneCount]   = useState<number | null>(null)

  const groups = useMemo(
    () => (open ? findAllDuplicateInvestmentGroups(investments) : []),
    [open, investments],
  )

  // Default selection: every duplicate EXCEPT the oldest in each group.
  const defaultSelected = useMemo(() => {
    const s = new Set<string>()
    for (const g of groups) for (let i = 1; i < g.length; i++) s.add(g[i].id)
    return s
  }, [groups])

  React.useEffect(() => {
    if (open) {
      setPendingIds(new Set(defaultSelected))
      setDoneCount(null)
    }
  }, [open, defaultSelected])

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
        await deleteInvestment(id)
        deleted++
      }
      setDoneCount(deleted)
      setPendingIds(new Set())
    } finally {
      setBusy(false)
    }
  }

  const totalDuplicates = useMemo(
    () => groups.reduce((sum, g) => sum + (g.length - 1), 0),
    [groups],
  )

  return (
    <Modal open={open} onClose={onClose} title="Encontrar ativos duplicados" size="lg">
      <div className="px-6 py-5 space-y-4">

        {doneCount !== null && doneCount > 0 && (
          <div role="status" aria-live="polite"
               className="flex items-center gap-3 p-3 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/25">
            <CheckCircle2 className="w-5 h-5 text-[#00ff88] flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[#00ff88]">
                {doneCount} ativo{doneCount === 1 ? '' : 's'} duplicado{doneCount === 1 ? '' : 's'} removido{doneCount === 1 ? '' : 's'}
              </p>
              <p className="text-xs text-[#55556a]">A lista foi atualizada.</p>
            </div>
          </div>
        )}

        {groups.length === 0 ? (
          <div className="flex flex-col items-center text-center py-10 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#00ff88]/10 border border-[#00ff88]/25 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-[#00ff88]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#e8e8f0]">
                {doneCount !== null ? 'Tudo limpo!' : 'Nenhum ativo duplicado encontrado'}
              </p>
              <p className="text-xs text-[#55556a] mt-1 max-w-sm">
                Ativos com mesmo nome (ou ticker), instituição e classe são considerados a mesma posição.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/25">
              <AlertTriangle className="w-5 h-5 text-[#f59e0b] flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <p className="text-[#f59e0b] font-semibold">
                  {groups.length} grupo{groups.length === 1 ? '' : 's'} com duplicatas · {totalDuplicates} ativo{totalDuplicates === 1 ? '' : 's'} extra{totalDuplicates === 1 ? '' : 's'}
                </p>
                <p className="text-[#8888aa] mt-0.5">
                  Por padrão mantemos a posição <strong className="text-[#e8e8f0]">mais antiga</strong> (data de compra). Desmarque qualquer ativo que queira preservar.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-widest text-[#55556a] font-semibold">
                {pendingIds.size} de {totalDuplicates} marcados para remoção
              </p>
              <div className="flex gap-2">
                <button onClick={selectAll}
                        className="text-xs text-[#8888aa] hover:text-[#e8e8f0] px-2 py-1" type="button">
                  Marcar padrão
                </button>
                <button onClick={clearAll}
                        className="text-xs text-[#8888aa] hover:text-[#e8e8f0] px-2 py-1" type="button">
                  Desmarcar tudo
                </button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto space-y-3 pr-1">
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
      </div>

      <ModalFooter>
        <button className="btn-ghost" onClick={onClose} disabled={busy}>Fechar</button>
        {groups.length > 0 && (
          <button
            onClick={handleDelete}
            disabled={busy || pendingIds.size === 0}
            className={clsx(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold',
              'bg-[#ff4466] text-white hover:bg-[#e0395a] transition-colors',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            <Trash2 className="w-4 h-4" />
            {busy
              ? 'Removendo…'
              : `Remover ${pendingIds.size} ativo${pendingIds.size === 1 ? '' : 's'}`}
          </button>
        )}
      </ModalFooter>
    </Modal>
  )
}

function DuplicateGroup({
  group, pendingIds, onToggle,
}: {
  group: Investment[]
  pendingIds: Set<string>
  onToggle: (id: string) => void
}) {
  const sample = group[0]
  return (
    <div className="rounded-xl border border-[#1e1e2e] bg-[#0d0d14] overflow-hidden">
      <div className="px-3 py-2 bg-[#16161f]/60 border-b border-[#1e1e2e] flex items-center gap-2">
        <Copy className="w-3.5 h-3.5 text-[#f59e0b] flex-shrink-0" />
        <p className="text-xs font-semibold text-[#e8e8f0] truncate flex-1">
          {sample.name}
          {sample.ticker && (
            <span className="ml-2 text-[10px] text-[#55556a] font-mono">{sample.ticker}</span>
          )}
        </p>
        <span className="text-[10px] text-[#8888aa] font-mono whitespace-nowrap">
          {sample.assetClass} · {sample.institution}
        </span>
        <span className="text-[10px] text-[#55556a] font-mono whitespace-nowrap">
          ×{group.length}
        </span>
      </div>

      <div className="divide-y divide-[#1e1e2e]">
        {group.map((inv, idx) => {
          const isOldest = idx === 0
          const isMarked = pendingIds.has(inv.id)
          const marketValue = (inv.quantity ?? 0) * (inv.currentPrice ?? 0)
          return (
            <label
              key={inv.id}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 cursor-pointer text-xs transition-colors',
                isMarked ? 'bg-[#ff4466]/8 hover:bg-[#ff4466]/12' : 'hover:bg-[#16161f]/40',
              )}
            >
              <input
                type="checkbox"
                checked={isMarked}
                onChange={() => onToggle(inv.id)}
                className="w-4 h-4 accent-[#ff4466] flex-shrink-0"
              />
              <span className="font-mono text-[#8888aa] w-24 flex-shrink-0">{inv.purchaseDate}</span>
              <span className="text-[#8888aa] w-20 flex-shrink-0 font-mono">
                qty {inv.quantity}
              </span>
              <span className="text-[#e8e8f0] flex-1 font-mono">
                {inv.currency === 'USD'
                  ? `$ ${marketValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : formatBRL(marketValue)}
              </span>
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
