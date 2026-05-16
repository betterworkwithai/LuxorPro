import React, { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload, FileText, Image, Trash2, Eye, Zap, CheckCircle2,
  AlertCircle, Loader2, X, Paperclip, FileSearch,
  Download, SquareCheck, Square, ShieldCheck, AlertTriangle,
  FileSpreadsheet, ClipboardPaste, Sparkles,
  Tag, Lock, Unlock, Repeat, Activity, TrendingUp, Wallet, CalendarClock, Users,
  ChevronUp as ChevUp, ChevronDown as ChevDown, ChevronsUpDown,
} from 'lucide-react'
import { parseLocalCSV } from '../lib/invoice/csvLocalParser'
import { NewCategoryModal } from '../components/modals/NewCategoryModal'
import { findDuplicates } from '../lib/duplicateCheck'
import { nanoid } from 'nanoid'
import { clsx } from 'clsx'
import { useStore } from '../store/useStore'
import { V2PageHeader, useReveal } from '../components/v2/V2Primitives'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Modal, ModalFooter } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { formatDate, formatBRL } from '../lib/formatters'
import { useAllCategories } from '../lib/useCategories'
import { AccountSelect } from '../components/ui/AccountSelect'
import type { Attachment } from '../lib/types'
import { processInvoiceAI } from '../lib/invoice/aiPipeline'
import type { ParsedTransaction, PipelineResult, InvoiceMetadata } from '../lib/invoice/types'

// ── Types ────────────────────────────────────────────────────────────────────

type ProcessStatus = 'pending' | 'processing' | 'done' | 'error'

interface FileEntry {
  id: string
  file: File
  status: ProcessStatus
  attachment?: Attachment
  errorMsg?: string
  result?: PipelineResult
  progressStep?: string
  progressPct?: number
}

// ── Invoice Metadata Card ─────────────────────────────────────────────────────
function MetadataCard({ meta, issuer, usedOCR }: { meta: InvoiceMetadata; issuer?: string; usedOCR: boolean }) {
  const hasData = meta.issuer || meta.dueDate || meta.totalAmount || meta.creditLimit || meta.period
  if (!hasData) return null

  return (
    <div className="flex flex-wrap gap-3 px-5 py-3 bg-[#16161f] border-b border-[#1e1e2e] text-xs">
      {(issuer ?? meta.issuer) && (
        <div className="flex items-center gap-1.5">
          <span className="text-[#55556a]">Emissor:</span>
          <span className="font-semibold text-[#e8e8f0]">{issuer ?? meta.issuer}</span>
        </div>
      )}
      {meta.cardLastFour && (
        <div className="flex items-center gap-1.5">
          <span className="text-[#55556a]">Cartão:</span>
          <span className="font-mono text-[#e8e8f0]">•••• {meta.cardLastFour}</span>
        </div>
      )}
      {meta.dueDate && (
        <div className="flex items-center gap-1.5">
          <span className="text-[#55556a]">Vencimento:</span>
          <span className="text-[#f59e0b]">{formatDate(meta.dueDate)}</span>
        </div>
      )}
      {meta.totalAmount != null && (
        <div className="flex items-center gap-1.5">
          <span className="text-[#55556a]">Total fatura:</span>
          <span className="font-bold text-[#ff4466]">{formatBRL(meta.totalAmount)}</span>
        </div>
      )}
      {meta.minPayment != null && (
        <div className="flex items-center gap-1.5">
          <span className="text-[#55556a]">Mín. pagamento:</span>
          <span className="text-[#f59e0b]">{formatBRL(meta.minPayment)}</span>
        </div>
      )}
      {meta.period && (
        <div className="flex items-center gap-1.5">
          <span className="text-[#55556a]">Período:</span>
          <span className="text-[#8888aa]">{meta.period}</span>
        </div>
      )}
      {usedOCR && (
        <div className="flex items-center gap-1 text-[#f59e0b]">
          <AlertTriangle className="w-3 h-3" />
          <span>Processado via OCR — revise com atenção</span>
        </div>
      )}
    </div>
  )
}

// ── Sortable column header ───────────────────────────────────────────────────
function SortHeader({
  label, active, dir, onClick, align = 'left',
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
  align?: 'left' | 'right'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1 select-none transition-colors hover:text-[#e8e8f0]',
        active ? 'text-[#00d4ff]' : 'text-[#55556a]',
        align === 'right' ? 'justify-end' : 'justify-start',
      )}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span>{label}</span>
      {active
        ? (dir === 'asc' ? <ChevUp className="w-3 h-3" /> : <ChevDown className="w-3 h-3" />)
        : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
    </button>
  )
}

// ── Bulk Actions Bar ─────────────────────────────────────────────────────────
function SegButton({
  active, onClick, children, color = '#00d4ff', title,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  color?: string
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
        'border whitespace-nowrap',
        active
          ? 'text-[#0d0d14] border-transparent shadow-sm'
          : 'text-[#8888aa] border-[#1e1e2e] bg-[#0d0d14] hover:text-[#e8e8f0] hover:border-[#2a2a3e]',
      )}
      style={active ? { background: color } : undefined}
    >
      {children}
    </button>
  )
}

function BulkActionsBar({
  selectedCount, totalCount, targetType, expenseCats, incomeCats,
  sharedNature, sharedRegime, sharedVisibility, hasPartnership, onApply, onCreateCategory,
}: {
  selectedCount: number
  totalCount: number
  targetType: 'expense' | 'income' | 'mixed'
  expenseCats: { id: string; name: string; icon?: string }[]
  incomeCats: { id: string; name: string; icon?: string }[]
  sharedNature: 'fixed' | 'variable' | 'investment' | null
  sharedRegime: 'caixa' | 'competencia' | null
  sharedVisibility: 'private' | 'shared' | null
  hasPartnership: boolean
  onApply: (patch: Partial<ParsedTransaction>) => void
  onCreateCategory: (type: 'expense' | 'income' | 'both') => void
}) {
  const targetLabel = selectedCount > 0
    ? `${selectedCount} selecionado${selectedCount !== 1 ? 's' : ''}`
    : `todos os ${totalCount}`

  return (
    <div className="bg-[#0d0d15] border-b border-[#1e1e2e] px-5 py-3 space-y-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#8888aa] font-semibold">
        <Tag className="w-3 h-3 text-[#ff7a00]" />
        <span>Aplicar em massa · {targetLabel}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {/* ── Bulk category ─────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[#55556a] uppercase tracking-wider">Categoria:</span>
          <select
            value=""
            onChange={e => {
              const v = e.target.value
              if (!v) return
              if (v === '__new__') {
                onCreateCategory(targetType === 'mixed' ? 'both' : targetType)
              } else {
                onApply({ category: v })
              }
              e.target.value = ''
            }}
            className="input-dark text-[11px] py-1 px-2 h-7"
          >
            <option value="" disabled>Escolher…</option>
            {targetType === 'expense' && expenseCats.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
            {targetType === 'income' && incomeCats.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
            {targetType === 'mixed' && (
              <>
                <optgroup label="— Despesas —">
                  {expenseCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </optgroup>
                <optgroup label="— Receitas —">
                  {incomeCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </optgroup>
              </>
            )}
            <option value="__new__">＋ Nova categoria…</option>
          </select>
        </div>

        {/* ── Expense nature ─────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-[#55556a] uppercase tracking-wider">Natureza:</span>
          <SegButton
            active={sharedNature === 'fixed'}
            onClick={() => onApply({ expenseNature: 'fixed' })}
            color="#8b5cf6"
            title="Despesa fixa (recorrente, mês a mês)"
          >
            <Repeat className="w-3 h-3" /> Fixa
          </SegButton>
          <SegButton
            active={sharedNature === 'variable'}
            onClick={() => onApply({ expenseNature: 'variable' })}
            color="#00d4ff"
            title="Despesa variável (consumo do dia a dia)"
          >
            <Activity className="w-3 h-3" /> Variável
          </SegButton>
          <SegButton
            active={sharedNature === 'investment'}
            onClick={() => onApply({ expenseNature: 'investment' })}
            color="#00ff88"
            title="Investimento (aporte, aplicação)"
          >
            <TrendingUp className="w-3 h-3" /> Investimento
          </SegButton>
        </div>

        {/* ── Accounting regime ─────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-[#55556a] uppercase tracking-wider">Regime:</span>
          <SegButton
            active={sharedRegime === 'caixa'}
            onClick={() => onApply({ expenseRegime: 'caixa' })}
            color="#ff7a00"
            title="Regime de caixa: registra na data do pagamento"
          >
            <Wallet className="w-3 h-3" /> Caixa
          </SegButton>
          <SegButton
            active={sharedRegime === 'competencia'}
            onClick={() => onApply({ expenseRegime: 'competencia' })}
            color="#f59e0b"
            title="Regime de competência: registra na data do consumo"
          >
            <CalendarClock className="w-3 h-3" /> Competência
          </SegButton>
        </div>

        {/* ── Sharing (only when in a partnership) ──────────────────── */}
        {hasPartnership && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-[#55556a] uppercase tracking-wider">Compartilhar:</span>
            <SegButton
              active={sharedVisibility === 'private'}
              onClick={() => onApply({ visibility: 'private' })}
              color="#55556a"
            >
              <Lock className="w-3 h-3" /> Privado
            </SegButton>
            <SegButton
              active={sharedVisibility === 'shared'}
              onClick={() => onApply({ visibility: 'shared' })}
              color="#00ff88"
              title="Dividir esta despesa com seu parceiro(a)"
            >
              <Users className="w-3 h-3" /> Compartilhado
            </SegButton>
          </div>
        )}
      </div>

      {!hasPartnership && (
        <p className="text-[10px] text-[#55556a] flex items-center gap-1.5">
          <Unlock className="w-3 h-3" />
          Para marcar despesas compartilhadas, configure um parceiro(a) em Configurações
        </p>
      )}
    </div>
  )
}

// ── Review Table ─────────────────────────────────────────────────────────────
const TYPE_OPTIONS = [
  { value: 'expense', label: '↓ Despesa',   color: 'text-[#ff4466]' },
  { value: 'income',  label: '↑ Receita',   color: 'text-[#00ff88]' },
] as const

function ReviewTable({
  items, meta, issuer, usedOCR, onChange, onImport, onClear,
}: {
  items: ParsedTransaction[]
  meta: InvoiceMetadata
  issuer?: string
  usedOCR: boolean
  onChange: (items: ParsedTransaction[]) => void
  onImport: (selected: ParsedTransaction[]) => void
  onClear: () => void
}) {
  const [globalAccount, setGlobalAccount] = useState('Itaú')
  const partnership = useStore(s => s.partnership)
  type SortKey = 'date' | 'merchant' | 'category' | 'type' | 'amount'
  const [sortKey, setSortKey] = useState<SortKey | null>('merchant')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  // ── Inline category creation ──────────────────────────────────────────────
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [catModalType, setCatModalType] = useState<'expense' | 'income' | 'both'>('expense')
  const catTargetRef = useRef<{ kind: 'row'; idx: number } | { kind: 'bulk' } | null>(null)

  const openCategoryModal = (
    type: 'expense' | 'income' | 'both',
    target: { kind: 'row'; idx: number } | { kind: 'bulk' },
  ) => {
    setCatModalType(type)
    catTargetRef.current = target
    setCatModalOpen(true)
  }

  const handleCatCreated = (newId: string) => {
    const target = catTargetRef.current
    if (!target) return
    if (target.kind === 'row') update(target.idx, { category: newId })
    else applyToSelected({ category: newId })
    catTargetRef.current = null
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); return }
    if (sortDir === 'asc') { setSortDir('desc'); return }
    setSortKey(null) // 3rd click clears
  }
  const allCats = useAllCategories()
  const expenseCats = allCats.filter(c => c.type === 'expense' || c.type === 'both')
  const incomeCats  = allCats.filter(c => c.type === 'income'  || c.type === 'both')

  const selected  = items.filter(t => t.selected)
  const totalExp  = selected.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const totalInc  = selected.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const allSel    = items.length > 0 && items.every(t => t.selected)

  const update = (idx: number, patch: Partial<ParsedTransaction>) =>
    onChange(items.map((t, i) => i === idx ? { ...t, ...patch } : t))
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx))
  const toggleAll = () => onChange(items.map(t => ({ ...t, selected: !allSel })))

  // Display-only sort: keeps source order in `items` intact, only renders sorted
  const sortedView = (() => {
    if (!sortKey) return items.map((tx, idx) => ({ tx, idx }))
    const dir = sortDir === 'asc' ? 1 : -1
    return items
      .map((tx, idx) => ({ tx, idx }))
      .slice()
      .sort((a, b) => {
        let av: string | number = ''
        let bv: string | number = ''
        switch (sortKey) {
          case 'date':     av = a.tx.date;     bv = b.tx.date; break
          case 'merchant': av = a.tx.merchant.toLowerCase(); bv = b.tx.merchant.toLowerCase(); break
          case 'category': av = a.tx.category; bv = b.tx.category; break
          case 'type':     av = a.tx.type;     bv = b.tx.type; break
          case 'amount':   av = a.tx.amount;   bv = b.tx.amount; break
        }
        if (av < bv) return -1 * dir
        if (av > bv) return  1 * dir
        return 0
      })
  })()

  // Apply a patch to all selected rows (or all rows if none selected)
  const applyToSelected = (patch: Partial<ParsedTransaction>) => {
    const target = selected.length > 0 ? selected : items
    if (target.length === 0) return
    const targetIds = new Set(target.map(t => t.id))
    onChange(items.map(t => targetIds.has(t.id) ? { ...t, ...patch } : t))
  }

  // ── Read current shared bulk-state — only "all selected match" counts as set
  const sharedNature = (() => {
    const target = selected.length > 0 ? selected : items
    if (target.length === 0) return null
    const first = target[0].expenseNature
    return target.every(t => t.expenseNature === first) ? first ?? null : null
  })()
  const sharedRegime = (() => {
    const target = selected.length > 0 ? selected : items
    if (target.length === 0) return null
    const first = target[0].expenseRegime
    return target.every(t => t.expenseRegime === first) ? first ?? null : null
  })()
  const sharedVisibility = (() => {
    const target = selected.length > 0 ? selected : items
    if (target.length === 0) return null
    const first = target[0].visibility
    return target.every(t => t.visibility === first) ? first ?? 'private' : null
  })()

  return (
    <Card className="overflow-hidden border-[#00d4ff]/20">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-[#00d4ff]/5 border-b border-[#1e1e2e]">
        <div className="flex items-center gap-3">
          <Zap className="w-4 h-4 text-[#00d4ff]" />
          <div>
            <p className="text-sm font-semibold text-[#e8e8f0]">
              {items.length} lançamento{items.length !== 1 ? 's' : ''} encontrado{items.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-[#55556a]">
              {selected.length} selecionado{selected.length !== 1 ? 's' : ''}
              {totalExp > 0 && <> · <span className="text-[#ff4466]">−{formatBRL(totalExp, true)}</span></>}
              {totalInc > 0 && <> · <span className="text-[#00ff88]">+{formatBRL(totalInc, true)}</span></>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[#55556a]">Conta:</span>
            <AccountSelect
              className="input-dark text-xs py-1 px-2 h-7"
              value={globalAccount}
              onChange={acc => { setGlobalAccount(acc); onChange(items.map(t => ({ ...t, account: acc }))) }}
              placeholder="Selecionar…"
            />
          </div>
          <button onClick={onClear} className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5">
            <X className="w-3 h-3" /> Descartar
          </button>
          <button
            onClick={() => onImport(selected.map(t => ({ ...t, account: globalAccount })))}
            disabled={selected.length === 0}
            className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Importar {selected.length > 0 ? selected.length : ''} lançamento{selected.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>

      {/* Bulk actions toolbar */}
      <BulkActionsBar
        selectedCount={selected.length}
        totalCount={items.length}
        targetType={(() => {
          const target = selected.length > 0 ? selected : items
          if (target.length === 0) return 'mixed'
          const first = target[0].type
          return target.every(t => t.type === first) ? first : 'mixed'
        })()}
        expenseCats={expenseCats}
        incomeCats={incomeCats}
        sharedNature={sharedNature}
        sharedRegime={sharedRegime}
        sharedVisibility={sharedVisibility}
        hasPartnership={!!partnership}
        onApply={applyToSelected}
        onCreateCategory={(type) => openCategoryModal(type, { kind: 'bulk' })}
      />

      <NewCategoryModal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        defaultType={catModalType}
        onCreated={handleCatCreated}
      />

      {/* Metadata bar */}
      <MetadataCard meta={meta} issuer={issuer} usedOCR={usedOCR} />

      {/* Column labels */}
      <div className="grid items-center bg-[#0d0d15] border-b border-[#1e1e2e] px-3 py-2 text-[10px] uppercase tracking-wider text-[#55556a]"
           style={{ gridTemplateColumns: '28px 90px 1fr 150px 80px 95px 24px' }}>
        <button onClick={toggleAll} className="flex items-center justify-center">
          {allSel ? <SquareCheck className="w-3.5 h-3.5 text-[#00d4ff]" /> : <Square className="w-3.5 h-3.5 text-[#55556a]" />}
        </button>
        <SortHeader label="Data"      active={sortKey === 'date'}     dir={sortDir} onClick={() => toggleSort('date')} />
        <SortHeader label="Descrição" active={sortKey === 'merchant'} dir={sortDir} onClick={() => toggleSort('merchant')} />
        <SortHeader label="Categoria" active={sortKey === 'category'} dir={sortDir} onClick={() => toggleSort('category')} />
        <SortHeader label="Tipo"      active={sortKey === 'type'}     dir={sortDir} onClick={() => toggleSort('type')} />
        <SortHeader label="Valor (R$)" active={sortKey === 'amount'} dir={sortDir} onClick={() => toggleSort('amount')} align="right" />
        <span />
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#1e1e2e] max-h-[480px] overflow-y-auto">
        {sortedView.map(({ tx, idx }) => (
          <div
            key={tx.id}
            className={clsx(
              'grid items-center px-3 py-2 gap-2 group transition-colors',
              tx.selected ? 'hover:bg-[#16161f]/60' : 'opacity-40 hover:opacity-60',
            )}
            style={{ gridTemplateColumns: '28px 90px 1fr 150px 80px 95px 24px' }}
          >
            <button onClick={() => update(idx, { selected: !tx.selected })} className="flex items-center justify-center">
              {tx.selected
                ? <SquareCheck className="w-4 h-4 text-[#00d4ff]" />
                : <Square className="w-4 h-4 text-[#55556a]" />}
            </button>

            <input
              type="date"
              className="input-dark text-xs py-1 px-2"
              value={tx.date}
              onChange={e => update(idx, { date: e.target.value })}
            />

            <input
              className="input-dark text-xs py-1 px-2"
              value={tx.merchant}
              onChange={e => update(idx, { merchant: e.target.value })}
            />

            <select
              className="input-dark text-xs py-1 px-2"
              value={tx.category}
              onChange={e => {
                if (e.target.value === '__new__') {
                  openCategoryModal(tx.type, { kind: 'row', idx })
                  return
                }
                update(idx, { category: e.target.value })
              }}
            >
              {(tx.type === 'expense' ? expenseCats : incomeCats).map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
              <option value="__new__">＋ Nova categoria…</option>
            </select>

            <select
              className={clsx('input-dark text-xs py-1 px-1.5 font-semibold',
                TYPE_OPTIONS.find(o => o.value === tx.type)?.color ?? 'text-[#e8e8f0]')}
              value={tx.type}
              onChange={e => update(idx, { type: e.target.value as ParsedTransaction['type'] })}
            >
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <input
              type="number" step="0.01"
              className="input-dark text-xs py-1 px-2 text-right"
              value={tx.amount}
              onChange={e => update(idx, { amount: parseFloat(e.target.value) || 0 })}
            />

            <button
              onClick={() => remove(idx)}
              className="w-5 h-5 flex items-center justify-center rounded text-[#55556a] hover:text-[#ff4466] hover:bg-[#ff4466]/10 opacity-0 group-hover:opacity-100 transition-all"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[#1e1e2e] flex items-center justify-between bg-[#0d0d15]">
        <div className="flex items-center gap-4 text-xs text-[#55556a]">
          <span>
            <span className="text-[#ff4466] font-semibold">{selected.filter(t => t.type === 'expense').length} despesas</span>
            {' '}· {selected.filter(t => t.type === 'income').length} receitas
          </span>
          {totalExp > 0 && <span>Total despesas: <span className="text-[#ff4466] font-semibold">{formatBRL(totalExp)}</span></span>}
          {meta.totalAmount != null && (
            <span>Fatura: <span className="text-[#e8e8f0] font-semibold">{formatBRL(meta.totalAmount)}</span></span>
          )}
        </div>
      </div>
    </Card>
  )
}

// ── Preview modal ─────────────────────────────────────────────────────────────
function PreviewModal({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const isSheet = isSpreadsheetMeta(attachment.mimeType, attachment.filename)
  return (
    <Modal open={true} onClose={onClose} title={attachment.filename} size="xl">
      <div className="p-4">
        {attachment.mimeType.startsWith('image/') && (
          <img src={attachment.dataUrl} alt={attachment.filename} className="max-w-full rounded-xl mx-auto" />
        )}
        {attachment.mimeType === 'application/pdf' && (
          <iframe src={attachment.dataUrl} className="w-full h-[70vh] rounded-xl" title={attachment.filename} />
        )}
        {isSheet && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <FileSpreadsheet className="w-10 h-10 text-[#00ff88]" />
            <div>
              <p className="text-sm font-semibold text-[#e8e8f0]">Planilha processada</p>
              <p className="text-xs text-[#55556a] mt-1">
                Veja o texto extraído abaixo · faça download para abrir no Excel
              </p>
            </div>
            <a
              href={attachment.dataUrl}
              download={attachment.filename}
              className="btn-ghost text-xs px-4 py-2 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Baixar arquivo
            </a>
          </div>
        )}
        {attachment.extractedText && (
          <details className="mt-4">
            <summary className="text-xs font-semibold text-[#8888aa] cursor-pointer hover:text-[#e8e8f0] transition-colors">
              Texto extraído ({attachment.extractedText.length} caracteres)
            </summary>
            <pre className="mt-2 p-4 bg-[#16161f] rounded-xl border border-[#1e1e2e] text-[10px] text-[#e8e8f0] whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
              {attachment.extractedText.slice(0, 3000)}{attachment.extractedText.length > 3000 ? '\n…' : ''}
            </pre>
          </details>
        )}
      </div>
    </Modal>
  )
}

// ── File icon ─────────────────────────────────────────────────────────────────
const SHEET_EXT_RE = /\.(xlsx|xls|csv|tsv|ods)$/i
const SHEET_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
])

function isSpreadsheetMeta(mimeType: string, filename: string): boolean {
  return SHEET_MIMES.has(mimeType) || SHEET_EXT_RE.test(filename)
}

function FileIcon({ type, name = '' }: { type: string; name?: string }) {
  if (isSpreadsheetMeta(type, name)) return <FileSpreadsheet className="w-5 h-5 text-[#00ff88]" />
  if (type.startsWith('image/'))     return <Image className="w-5 h-5 text-[#8b5cf6]" />
  if (type === 'application/pdf')    return <FileText className="w-5 h-5 text-[#ff4466]" />
  return <FileSearch className="w-5 h-5 text-[#55556a]" />
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ step, pct }: { step: string; pct: number }) {
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[10px] text-[#55556a] mb-1">
        <span>{step}</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full h-1 bg-[#1e1e2e] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#00d4ff] rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DocumentAI() {
  const { attachments, addAttachment, deleteAttachment, addTransaction, addTaxItem } = useStore()
  const allTransactions = useStore(s => s.transactions)
  const containerRef = useRef<HTMLDivElement>(null)
  useReveal(containerRef, [])
  const [queue,         setQueue]         = useState<FileEntry[]>([])
  const [previewing,    setPreviewing]    = useState<Attachment | null>(null)
  const [pendingTxs,    setPendingTxs]    = useState<ParsedTransaction[]>([])
  const [pendingMeta,   setPendingMeta]   = useState<InvoiceMetadata>({})
  const [pendingIssuer, setPendingIssuer] = useState<string | undefined>()
  const [pendingOCR,    setPendingOCR]    = useState(false)
  const [importedCount, setImportedCount] = useState<number | null>(null)
  const [rejectMsg,     setRejectMsg]     = useState<string | null>(null)
  const [pasteOpen,     setPasteOpen]     = useState(false)
  const [pasteText,     setPasteText]     = useState('')
  const [pasteMsg,      setPasteMsg]      = useState<string | null>(null)
  const [dupConfirm,    setDupConfirm]    = useState<{
    duplicates: ParsedTransaction[]
    nonDuplicates: ParsedTransaction[]
    selected: ParsedTransaction[]
  } | null>(null)

  const updateEntry = (id: string, patch: Partial<FileEntry>) =>
    setQueue(q => q.map(e => e.id === id ? { ...e, ...patch } : e))

  const onDrop = useCallback(async (accepted: File[]) => {
    const newEntries: FileEntry[] = accepted.map(f => ({
      id: nanoid(), file: f, status: 'pending', result: undefined,
    }))
    setQueue(q => [...q, ...newEntries])

    for (const entry of newEntries) {
      updateEntry(entry.id, { status: 'processing', progressStep: 'Iniciando…', progressPct: 0 })

      try {
        // Read as data URL for storage
        const dataUrl: string = await new Promise((res, rej) => {
          const reader = new FileReader()
          reader.onload  = () => res(reader.result as string)
          reader.onerror = rej
          reader.readAsDataURL(entry.file)
        })

        // Run AI pipeline
        const result = await processInvoiceAI(entry.file, {
          onProgress: (step, pct) => updateEntry(entry.id, { progressStep: step, progressPct: pct }),
        })

        // Save attachment (store raw text for preview)
        const rawTextForStorage = result.logs
          .map(l => `[${l.step}] ${l.message}`)
          .join('\n')

        const att = await addAttachment({
          filename:      entry.file.name,
          mimeType:      entry.file.type,
          size:          entry.file.size,
          dataUrl,
          extractedText: rawTextForStorage || undefined,
          createdAt:     new Date().toISOString(),
        })

        updateEntry(entry.id, { status: 'done', attachment: att, result })

        // Push to review queue (merge, deduplicate by id)
        if (result.transactions.length > 0) {
          setPendingTxs(prev => {
            const existingIds = new Set(prev.map(t => t.id))
            return [...prev, ...result.transactions.filter(t => !existingIds.has(t.id))]
          })
          setPendingMeta(result.metadata)
          setPendingIssuer(result.issuerDetected)
          setPendingOCR(result.usedOCR)
        }
      } catch (err) {
        console.error('[DocumentAI] pipeline error:', err)
        updateEntry(entry.id, { status: 'error', errorMsg: 'Processamento falhou' })
      }
    }
  }, [addAttachment])

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    onDropRejected: (rejections) => {
      const first = rejections[0]
      const code = first?.errors?.[0]?.code
      if (code === 'file-too-large') {
        setRejectMsg(`Arquivo muito grande — limite 20 MB`)
      } else if (code === 'file-invalid-type') {
        setRejectMsg(`Formato não suportado — use PDF, imagem, Excel (xlsx/xls) ou CSV`)
      } else {
        setRejectMsg(`Não foi possível adicionar ${rejections.length} arquivo(s)`)
      }
      setTimeout(() => setRejectMsg(null), 5000)
    },
    validator: (file) => {
      const ok = /\.(pdf|png|jpe?g|webp|xlsx|xls|csv|tsv|ods)$/i.test(file.name)
      if (!ok) return { code: 'file-invalid-type', message: 'Formato não suportado' }
      return null
    },
    maxSize: 20 * 1024 * 1024,
  })

  const handlePasteParse = () => {
    setPasteMsg(null)
    if (!pasteText.trim()) {
      setPasteMsg('Cole o texto CSV antes de processar')
      return
    }
    const { transactions, warnings } = parseLocalCSV(pasteText)
    if (transactions.length === 0) {
      setPasteMsg(`Nenhuma transação reconhecida${warnings.length ? ` — ${warnings[0]}` : ''}`)
      return
    }
    setPendingTxs(prev => {
      const existingIds = new Set(prev.map(t => t.id))
      return [...prev, ...transactions.filter(t => !existingIds.has(t.id))]
    })
    setPendingMeta({})
    setPendingIssuer(undefined)
    setPendingOCR(false)
    setPasteText('')
    setPasteOpen(false)
    setPasteMsg(null)
  }

  const handleImport = (selected: ParsedTransaction[]) => {
    const duplicates: ParsedTransaction[] = []
    const nonDuplicates: ParsedTransaction[] = []
    for (const tx of selected) {
      const matches = findDuplicates(
        { date: tx.date, description: tx.merchant, amount: tx.amount, type: tx.type },
        allTransactions,
      )
      if (matches.length > 0) duplicates.push(tx)
      else nonDuplicates.push(tx)
    }
    if (duplicates.length > 0) {
      setDupConfirm({ duplicates, nonDuplicates, selected })
      return
    }
    performImport(selected)
  }

  const performImport = async (toImport: ParsedTransaction[]) => {
    const partnership = useStore.getState().partnership
    let count = 0
    for (const tx of toImport) {
      await addTransaction({
        date:        tx.date,
        description: tx.merchant,
        category:    tx.category,
        type:        tx.type,
        amount:      tx.amount,
        account:     tx.account,
        ...(tx.expenseNature ? { expenseNature: tx.expenseNature } : {}),
        ...(tx.expenseRegime ? { expenseRegime: tx.expenseRegime } : {}),
        ...(tx.visibility    ? { visibility:    tx.visibility }    : {}),
        ...(tx.visibility === 'shared' && partnership
              ? { sharedWithPartnershipId: partnership.id }
              : {}),
      })
      count++
    }
    setPendingTxs([])
    setPendingMeta({})
    setPendingIssuer(undefined)
    setPendingOCR(false)
    setImportedCount(count)
    setTimeout(() => setImportedCount(null), 4000)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024)       return `${bytes} B`
    if (bytes < 1024*1024)  return `${(bytes/1024).toFixed(0)} KB`
    return `${(bytes/1024/1024).toFixed(1)} MB`
  }

  return (
    <div className="min-h-screen animate-fade-in" ref={containerRef}>
      <V2PageHeader
        title="IA de Documentos"
        subtitle="Envie faturas, extratos ou planilhas — o Claude AI extrai os lançamentos automaticamente com alta precisão"
      />

      <div className="p-4 sm:p-6 space-y-5">

        {/* Reject banner — surfaces invalid file feedback */}
        {rejectMsg && (
          <div
            role="alert"
            aria-live="polite"
            className="flex items-center gap-3 p-4 bg-[#ff4466]/5 border border-[#ff4466]/20 rounded-2xl animate-fade-in"
          >
            <AlertCircle className="w-5 h-5 text-[#ff4466] flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#ff4466]">{rejectMsg}</p>
              <p className="text-xs text-[#55556a]">Aceitamos PDF, PNG/JPG/WebP, Excel (.xlsx, .xls) e CSV</p>
            </div>
            <button
              onClick={() => setRejectMsg(null)}
              className="w-7 h-7 rounded-lg text-[#55556a] hover:text-[#e8e8f0] hover:bg-[#1e1e2e] flex items-center justify-center"
              aria-label="Fechar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Success banner */}
        {importedCount !== null && (
          <div className="flex items-center gap-3 p-4 bg-[#00ff88]/5 border border-[#00ff88]/20 rounded-2xl animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-[#00ff88] flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[#00ff88]">
                {importedCount} lançamento{importedCount !== 1 ? 's' : ''} importado{importedCount !== 1 ? 's' : ''} com sucesso!
              </p>
              <p className="text-xs text-[#55556a]">Acesse Fluxo de Caixa para conferir</p>
            </div>
          </div>
        )}

        {/* Review table */}
        {pendingTxs.length > 0 && (
          <ReviewTable
            items={pendingTxs}
            meta={pendingMeta}
            issuer={pendingIssuer}
            usedOCR={pendingOCR}
            onChange={setPendingTxs}
            onImport={handleImport}
            onClear={() => { setPendingTxs([]); setPendingMeta({}); setPendingIssuer(undefined); setPendingOCR(false) }}
          />
        )}

        {/* Paste CSV — local parsing, no AI tokens */}
        <div className="v2-card overflow-hidden v2-reveal">
          <button
            onClick={() => setPasteOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#16161f]/40 transition-colors text-left"
            aria-expanded={pasteOpen}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/20 flex items-center justify-center flex-shrink-0">
                <ClipboardPaste className="w-4 h-4 text-[#00ff88]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#e8e8f0]">Colar CSV manualmente</p>
                <p className="text-[11px] text-[#55556a]">
                  Processamento local instantâneo · sem IA, sem custo · ideal para extratos copiados
                </p>
              </div>
            </div>
            <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center text-[#55556a] transition-transform',
              pasteOpen && 'rotate-45')}>
              <X className="w-4 h-4" />
            </div>
          </button>

          {pasteOpen && (
            <div className="px-5 pb-5 space-y-3 border-t border-[#1e1e2e] pt-4 animate-fade-in">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-[#8888aa] font-semibold">
                  Cole o CSV abaixo
                </label>
                <p className="text-[11px] text-[#55556a] mt-1 mb-2">
                  Formato esperado: cabeçalho com <span className="font-mono text-[#00d4ff]">data, lançamento, valor</span> (ou similar) seguido das linhas. Valores positivos = despesa · negativos = receita.
                </p>
                <textarea
                  value={pasteText}
                  onChange={e => { setPasteText(e.target.value); setPasteMsg(null) }}
                  placeholder={'data,lançamento,valor\n2026-03-20,IOF COMPRA INTERNACIONAL,7.47\n2026-03-19,HARD ROCK ST-CT M REST,213.67\n2026-03-02,PAGAMENTO EFETUADO,-2482.12'}
                  className="w-full input-dark font-mono text-xs leading-relaxed min-h-[180px] py-3 px-3 resize-y"
                  spellCheck={false}
                />
              </div>

              {pasteMsg && (
                <div role="alert" className="flex items-center gap-2 text-xs text-[#ff4466]">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{pasteMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[11px] text-[#55556a] flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-[#00ff88]" />
                  Categorização automática por palavras-chave
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setPasteText(''); setPasteMsg(null) }}
                    disabled={!pasteText}
                    className="btn-ghost text-xs px-3 py-1.5"
                  >
                    Limpar
                  </button>
                  <button
                    onClick={handlePasteParse}
                    className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" /> Processar localmente
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          role="button"
          tabIndex={0}
          aria-label="Adicionar documentos"
          className={clsx(
            'relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-4',
            'cursor-pointer transition-all duration-200 text-center',
            'focus:outline-none focus:ring-2 focus:ring-[#00d4ff]/40',
            isDragReject
              ? 'border-[#ff4466] bg-[#ff4466]/5'
              : isDragActive
                ? 'border-[#00d4ff] bg-[#00d4ff]/5'
                : 'border-[#1e1e2e] hover:border-[#2a2a3e] hover:bg-[#16161f]/30',
          )}
        >
          <input {...getInputProps()} />
          <div className={clsx('w-14 h-14 rounded-2xl flex items-center justify-center transition-all',
            isDragReject ? 'bg-[#ff4466]/15' : isDragActive ? 'bg-[#00d4ff]/15' : 'bg-[#16161f]')}>
            <Upload className={clsx('w-6 h-6',
              isDragReject ? 'text-[#ff4466]' : isDragActive ? 'text-[#00d4ff]' : 'text-[#55556a]')} />
          </div>
          <div>
            <p className="text-base font-semibold text-[#e8e8f0]">
              {isDragReject
                ? 'Formato não suportado'
                : isDragActive
                  ? 'Solte aqui…'
                  : 'Arraste faturas, extratos ou planilhas'}
            </p>
            <p className="text-xs text-[#55556a] mt-1">
              Fatura, extrato, comprovante ou planilha de transações — até 20 MB por arquivo
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <Badge variant="neutral">PDF</Badge>
            <Badge variant="neutral">PNG / JPG</Badge>
            <Badge variant="neutral">WebP</Badge>
            <Badge variant="neutral">Excel (.xlsx / .xls)</Badge>
            <Badge variant="neutral">CSV</Badge>
          </div>
          <p className="text-xs text-[#55556a] flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-[#00d4ff]" />
            Texto enviado ao Claude AI via servidor seguro · planilhas e imagens processadas localmente
          </p>
        </div>

        {/* Processing queue */}
        {queue.length > 0 && (
          <div className="v2-card v2-reveal">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e30]">
              <p className="v2-caption">Processamento</p>
              <button onClick={() => setQueue([])} className="text-xs text-[#55556a] hover:text-[#e8e8f0] flex items-center gap-1">
                <X className="w-3 h-3" /> Limpar
              </button>
            </div>
            <div className="divide-y divide-[#1e1e2e]">
              {queue.map(entry => (
                <div key={entry.id} className="px-5 py-3">
                  <div className="flex items-center gap-4">
                    <FileIcon type={entry.file.type} name={entry.file.name} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#e8e8f0] font-medium truncate">{entry.file.name}</p>
                      <p className="text-xs text-[#55556a]">{formatSize(entry.file.size)}</p>
                      {entry.status === 'processing' && entry.progressStep && (
                        <ProgressBar step={entry.progressStep} pct={entry.progressPct ?? 0} />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs flex-shrink-0">
                      {entry.status === 'processing' && (
                        <span className="flex items-center gap-1.5 text-[#00d4ff]">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analisando…
                        </span>
                      )}
                      {entry.status === 'done' && (
                        <span className="flex items-center gap-1.5 text-[#00ff88]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {entry.result && entry.result.transactions.length > 0
                            ? `${entry.result.transactions.length} lançamentos`
                            : 'Sem lançamentos detectados'}
                          {entry.result?.usedOCR && (
                            <span className="text-[#f59e0b] text-[10px]">(OCR)</span>
                          )}
                        </span>
                      )}
                      {entry.status === 'error' && (
                        <span className="flex items-center gap-1.5 text-[#ff4466]">
                          <AlertCircle className="w-3.5 h-3.5" /> Erro
                        </span>
                      )}
                      {entry.status === 'pending' && <span className="text-[#55556a]">Na fila</span>}
                      {entry.attachment && (
                        <button onClick={() => setPreviewing(entry.attachment!)}
                          className="w-7 h-7 rounded-lg hover:bg-[#00d4ff]/15 text-[#55556a] hover:text-[#00d4ff] flex items-center justify-center">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pipeline overview card */}
        <div className="v2-card p-5 border border-dashed border-[#1e1e30] v2-reveal">
          <p className="v2-caption mb-4">Como funciona</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { step: '1', icon: '📄', title: 'Extrai texto', desc: 'PDFs digitais via pdf.js, planilhas (xlsx/csv) lidas direto, imagens via OCR.' },
              { step: '2', icon: '🤖', title: 'Claude AI analisa', desc: 'O texto é enviado ao Claude, que interpreta os lançamentos como um humano.' },
              { step: '3', icon: '🏷', title: 'Categorização automática', desc: 'Cada lançamento recebe uma categoria sugerida pela IA.' },
              { step: '4', icon: '✅', title: 'Revisão e importação', desc: 'Confira, ajuste se necessário e importe com um clique.' },
            ].map(s => (
              <div key={s.step} className="flex gap-3">
                <span className="text-xl leading-tight">{s.icon}</span>
                <div>
                  <p className="text-xs font-semibold text-[#e8e8f0]">{s.title}</p>
                  <p className="text-[11px] text-[#55556a] mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Document library */}
        <div className="v2-card v2-reveal">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e30]">
            <p className="v2-caption">Biblioteca de Documentos</p>
            <span className="text-xs text-[#55556a]">{attachments.length} arquivo{attachments.length !== 1 ? 's' : ''}</span>
          </div>
          {attachments.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <Paperclip className="w-8 h-8 text-[#2a2a3e] mx-auto mb-3" />
              <p className="text-sm text-[#55556a]">Nenhum documento ainda</p>
            </div>
          ) : (
            <div className="divide-y divide-[#1e1e2e]">
              {attachments.map(att => (
                <div key={att.id} className="flex items-center gap-4 px-5 py-3 group hover:bg-[#16161f]/40 transition-colors">
                  <FileIcon type={att.mimeType} name={att.filename} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#e8e8f0] font-medium truncate">{att.filename}</p>
                    <p className="text-xs text-[#55556a]">
                      {formatSize(att.size)} · {formatDate(att.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setPreviewing(att)}
                      className="w-7 h-7 rounded-lg hover:bg-[#00d4ff]/15 text-[#55556a] hover:text-[#00d4ff] flex items-center justify-center">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteAttachment(att.id)}
                      className="w-7 h-7 rounded-lg hover:bg-[#ff4466]/15 text-[#55556a] hover:text-[#ff4466] flex items-center justify-center">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {previewing && <PreviewModal attachment={previewing} onClose={() => setPreviewing(null)} />}

      {dupConfirm && (
        <Modal open={true} onClose={() => setDupConfirm(null)} title="Possíveis duplicatas detectadas" size="md">
          <div className="px-6 py-5 space-y-3 text-sm">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/30">
              <AlertTriangle className="w-5 h-5 text-[#f59e0b] flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="text-[#f59e0b] font-semibold">
                  {dupConfirm.duplicates.length} de {dupConfirm.selected.length} lançamento{dupConfirm.selected.length !== 1 ? 's' : ''} já existe{dupConfirm.duplicates.length === 1 ? '' : 'm'} no mesmo mês
                </p>
                <p className="text-[#8888aa]">
                  Tem certeza que deseja adicioná-los? Para evitar duplicação, você pode importar apenas os {dupConfirm.nonDuplicates.length} lançamentos novos.
                </p>
              </div>
            </div>
            <div className="max-h-[260px] overflow-y-auto border border-[#1e1e2e] rounded-xl divide-y divide-[#1e1e2e]">
              {dupConfirm.duplicates.map(tx => (
                <div key={tx.id} className="px-3 py-2 text-xs flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-[#e8e8f0] truncate">{tx.merchant}</p>
                    <p className="text-[10px] text-[#55556a]">{tx.date}</p>
                  </div>
                  <span className={tx.type === 'expense' ? 'text-[#ff4466] font-semibold' : 'text-[#00ff88] font-semibold'}>
                    {tx.type === 'expense' ? '−' : '+'}{formatBRL(tx.amount, true)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <ModalFooter>
            <button className="btn-ghost" onClick={() => setDupConfirm(null)}>
              Cancelar
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                const list = dupConfirm.nonDuplicates
                setDupConfirm(null)
                if (list.length > 0) performImport(list)
              }}
              disabled={dupConfirm.nonDuplicates.length === 0}
            >
              Importar só os {dupConfirm.nonDuplicates.length} novos
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                const list = dupConfirm.selected
                setDupConfirm(null)
                performImport(list)
              }}
              style={{ background: '#f59e0b' }}
            >
              Importar todos mesmo assim
            </button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
