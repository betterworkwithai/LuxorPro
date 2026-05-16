import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  AlertCircle, ArrowRight, CalendarClock, CheckCircle2, Clock,
  Eye, EyeOff, Pencil, Plus, Target, TrendingDown, TrendingUp, Trash2,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { Modal, ModalFooter } from '../components/ui/Modal'
import {
  AttentionChip, FabMenu, KpiCard, PeriodTabs, useReveal, V2PageHeader,
} from '../components/v2/V2Primitives'
import { formatBRL, formatDate, todayISO } from '../lib/formatters'
import { GOAL_CATEGORIES } from '../lib/types'
import type { FinancialGoal, GoalCategory, GoalImpact } from '../lib/types'
import { clsx } from 'clsx'

// ─── Wealth pyramid tiers (mirrors DashboardV2) ─────────────────
const PYRAMID_TIERS = [
  { key: 'topo',         name: 'Topo',          min: 10_000_000, color: '#ffc857' },
  { key: 'soberania',    name: 'Soberania',      min: 3_000_000,  color: '#ff9a3f' },
  { key: 'independencia',name: 'Independência',  min: 1_000_000,  color: '#ff7a00' },
  { key: 'conforto',     name: 'Conforto',       min: 300_000,    color: '#f59e0b' },
  { key: 'estabilidade', name: 'Estabilidade',   min: 50_000,     color: '#d97706' },
  { key: 'base',         name: 'Base',           min: 0,          color: '#78716c' },
]

// ─── Helpers ────────────────────────────────
function monthsBetween(from: Date, to: Date) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

function progressPct(current: number, target: number) {
  if (target <= 0) return 0
  return Math.min(100, (current / target) * 100)
}

function statusOf(goal: FinancialGoal): 'completed' | 'ontrack' | 'late' | 'behind' {
  if (goal.isCompleted) return 'completed'
  const today = new Date()
  const target = new Date(goal.targetDate)
  if (target < today) return 'late'
  const pct = progressPct(goal.currentAmount, goal.targetAmount)
  const totalMonths = monthsBetween(new Date(goal.createdAt), target)
  const elapsedMonths = monthsBetween(new Date(goal.createdAt), today)
  const expectedPct = totalMonths > 0 ? Math.min(100, (elapsedMonths / totalMonths) * 100) : 0
  return pct >= expectedPct * 0.85 ? 'ontrack' : 'behind'
}

function StatusBadge({ goal }: { goal: FinancialGoal }) {
  const s = statusOf(goal)
  const map = {
    completed: { label: 'Concluído',  variant: 'success' as const, Icon: CheckCircle2 },
    ontrack:   { label: 'No Prazo',   variant: 'info'    as const, Icon: TrendingUp   },
    behind:    { label: 'Atrasado',   variant: 'warning' as const, Icon: AlertCircle  },
    late:      { label: 'Vencido',    variant: 'danger'  as const, Icon: Clock        },
  }
  const { label, variant, Icon } = map[s]
  return (
    <Badge variant={variant}>
      <Icon className="w-3 h-3 mr-1 inline" />{label}
    </Badge>
  )
}

// ─── Net Worth Projection Chart ──────────────
interface ProjectionPoint {
  label: string
  withGoals: number
  withoutGoals: number
  [key: string]: string | number
}

// Expand a goal into all its occurrence dates within the horizon
function expandOccurrences(goal: FinancialGoal, today: Date, horizonMonths: number): Date[] {
  const base = new Date(goal.targetDate)
  const everyYears = goal.recurringEveryYears ?? 0
  const reps = goal.recurringRepetitions && goal.recurringRepetitions > 0 ? goal.recurringRepetitions : 0
  if (everyYears <= 0) return [base]
  const dates: Date[] = []
  // 0 reps = unlimited within horizon
  const maxIter = reps > 0 ? reps : 200
  for (let i = 0; i < maxIter; i++) {
    const d = new Date(base)
    d.setFullYear(d.getFullYear() + everyYears * i)
    const monthsAhead = monthsBetween(today, d)
    if (monthsAhead > horizonMonths) break
    dates.push(d)
  }
  return dates
}

function buildProjection(
  goals: FinancialGoal[],
  currentNetWorth: number,
  monthlyContributionBase: number,
  annualGrowthPct: number,
  monthlyCashflow = 0,        // net monthly cashflow adjustment (+income / −expense)
  horizonYears = 10,
  hiddenIds: Set<string> = new Set(),
): ProjectionPoint[] {
  const today = new Date()
  const points: ProjectionPoint[] = []
  const activeGoals = goals.filter(g => !g.isCompleted && !hiddenIds.has(g.id))
  const horizonMonths = horizonYears * 12

  const r = annualGrowthPct === 0 ? 0 : Math.pow(1 + annualGrowthPct / 100, 1 / 12) - 1

  const fv = (principal: number, months: number) =>
    r === 0 ? principal : principal * Math.pow(1 + r, months)

  const fvContrib = (monthly: number, months: number) =>
    r === 0 ? monthly * months : monthly * ((Math.pow(1 + r, months) - 1) / r)

  for (let m = 0; m <= horizonMonths; m += 3) {
    const date = new Date(today)
    date.setMonth(date.getMonth() + m)

    const baseMonthly = monthlyContributionBase + monthlyCashflow
    const withoutGoals = fv(currentNetWorth, m) + fvContrib(baseMonthly, m)

    let withGoals = fv(currentNetWorth, m)
    let addedContribs = baseMonthly
    for (const g of activeGoals) {
      if (g.impactType === 'savings') {
        addedContribs += g.monthlyContribution
        continue
      }
      const occurrences = expandOccurrences(g, today, horizonMonths)
      for (const occ of occurrences) {
        const monthsToOcc = monthsBetween(today, occ)
        if (monthsToOcc > 0 && m >= monthsToOcc) {
          if (g.impactType === 'expense') withGoals -= g.targetAmount
          else if (g.impactType === 'income') withGoals += g.targetAmount
        }
      }
    }
    withGoals += fvContrib(addedContribs, m)

    const label = m === 0 ? 'Hoje' : `${date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}`
    points.push({ label, withGoals: Math.max(0, withGoals), withoutGoals: Math.max(0, withoutGoals) })
  }
  return points
}

// ─── Emoji picker data ───────────────────────
const EMOJI_GROUPS = [
  { label: 'Finanças',      emojis: ['💰','💵','💸','💳','🏦','📈','💎','🪙','🤑','💲','🏧','📊'] },
  { label: 'Casa & Imóvel', emojis: ['🏠','🏡','🏢','🏗️','🔑','🛋️','🛏️','🚿','🪟','🌳','🏘️','🏰'] },
  { label: 'Transporte',    emojis: ['🚗','🏎️','🚙','🚕','✈️','🛥️','🏍️','🚲','🛵','🚁','🚢','🛸'] },
  { label: 'Viagem',        emojis: ['🌍','🗺️','🏖️','🗼','🌴','⛵','🏕️','🧳','🌅','🗽','🏔️','🌊'] },
  { label: 'Educação',      emojis: ['📚','🎓','📖','✏️','🔬','🧪','💻','🎒','📝','🖊️','🏫','🔭'] },
  { label: 'Negócio',       emojis: ['🚀','💼','📊','🏆','🎯','🔥','⚡','🌟','💡','⭐','🤝','📱'] },
  { label: 'Saúde & Lazer', emojis: ['🏥','❤️','🏋️','🧘','🏊','⚽','🎾','🏄','🚴','🎮','🎵','🎨'] },
  { label: 'Família',       emojis: ['👨‍👩‍👧','💑','👶','🎂','🎉','🎊','💝','🌹','👫','🤱','🐾','🌸'] },
  { label: 'Símbolos',      emojis: ['✨','💫','🌈','🔮','🍀','🎁','🌙','🌺','🦋','🦄','🎯','🏅'] },
]

// ─── Goal form ──────────────────────────────
const EMPTY_FORM = {
  name: '', description: '',
  targetAmount: '', currentAmount: '', targetDate: '',
  category: 'outro' as GoalCategory, impactType: 'savings' as GoalImpact,
  monthlyContribution: '',
  recurringEveryYears: '0',
  recurringRepetitions: '1',
  emoji: '',
}

function GoalModal({ open, onClose, initial }: {
  open: boolean; onClose: () => void; initial?: FinancialGoal
}) {
  const { addGoal, updateGoal } = useStore()
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [emojiSearch, setEmojiSearch] = useState('')
  const [form, setForm] = useState(() =>
    initial
      ? { name: initial.name, description: initial.description ?? '',
          targetAmount: String(initial.targetAmount), currentAmount: String(initial.currentAmount),
          targetDate: initial.targetDate, category: initial.category,
          impactType: initial.impactType, monthlyContribution: String(initial.monthlyContribution),
          recurringEveryYears: String(initial.recurringEveryYears ?? '0'),
          recurringRepetitions: String(initial.recurringRepetitions ?? '1'),
          emoji: initial.emoji ?? '' }
      : { ...EMPTY_FORM },
  )

  useEffect(() => {
    if (!open) return
    setShowEmojiPicker(false)
    setEmojiSearch('')
    setForm(initial
      ? { name: initial.name, description: initial.description ?? '',
          targetAmount: String(initial.targetAmount), currentAmount: String(initial.currentAmount),
          targetDate: initial.targetDate, category: initial.category,
          impactType: initial.impactType, monthlyContribution: String(initial.monthlyContribution),
          recurringEveryYears: String(initial.recurringEveryYears ?? '0'),
          recurringRepetitions: String(initial.recurringRepetitions ?? '1'),
          emoji: initial.emoji ?? '' }
      : { ...EMPTY_FORM })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id])

  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const catInfo = GOAL_CATEGORIES.find(c => c.value === form.category) ?? GOAL_CATEGORIES[GOAL_CATEGORIES.length - 1]
  // Emoji: manual override wins; otherwise fall back to category default
  const displayEmoji = form.emoji || catInfo.emoji

  const handleSave = async () => {
    const everyYears = parseInt(form.recurringEveryYears) || 0
    const reps = parseInt(form.recurringRepetitions) || 1
    const payload = {
      name:                form.name.trim(),
      emoji:               displayEmoji,
      description:         form.description,
      targetAmount:        parseFloat(form.targetAmount) || 0,
      currentAmount:       parseFloat(form.currentAmount) || 0,
      targetDate:          form.targetDate,
      category:            form.category,
      impactType:          form.impactType,
      monthlyContribution: parseFloat(form.monthlyContribution) || 0,
      color:               catInfo.color,   // auto from category
      isCompleted:         initial?.isCompleted ?? false,
      createdAt:           initial?.createdAt ?? new Date().toISOString(),
      recurringEveryYears: everyYears,
      recurringRepetitions: reps,
    }
    if (initial) {
      await updateGoal({ ...payload, id: initial.id })
    } else {
      await addGoal(payload)
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar Meta' : 'Nova Meta Financeira'} size="lg">
      <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">

        {/* Category — changes the default emoji; manual emoji override is separate */}
        <div>
          <label className="text-xs text-[#8888aa] mb-1.5 block">Categoria</label>
          <div className="grid grid-cols-4 gap-2">
            {GOAL_CATEGORIES.map(c => (
              <button key={c.value}
                onClick={() => { upd('category', c.value); upd('emoji', '') }}
                className={clsx(
                  'flex flex-col items-center gap-1 p-2 rounded-xl border text-xs transition-all',
                  form.category === c.value
                    ? 'border-[#ff7a00] bg-[#ff7a00]/10 text-[#ff7a00]'
                    : 'border-[#1e1e2e] text-[#8888aa] hover:border-[#2a2a3e]',
                )}>
                <span className="text-base">{c.emoji}</span>
                <span className="truncate w-full text-center">{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Name — emoji button opens picker */}
        <div>
          <label className="text-xs text-[#8888aa] mb-1.5 block">Nome da Meta</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-shrink-0">
              <button
                type="button"
                title="Escolher emoji"
                onClick={() => setShowEmojiPicker(p => !p)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-transform hover:scale-110 active:scale-95"
                style={{ background: catInfo.color + '18', border: `1px solid ${catInfo.color}30` }}
              >
                {displayEmoji}
              </button>

              {showEmojiPicker && (
                <div className="absolute left-0 top-12 z-50 w-72 bg-[#0d0d15] border border-[#2a2a3e] rounded-2xl shadow-2xl p-3 space-y-2">
                  {/* Search */}
                  <input
                    autoFocus
                    type="text"
                    placeholder="Buscar emoji…"
                    value={emojiSearch}
                    onChange={e => setEmojiSearch(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-[#16161f] border border-[#1e1e2e] text-[#e8e8f0] placeholder:text-[#55556a] focus:outline-none focus:border-[#ff7a00]/40"
                  />
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-0.5">
                    {emojiSearch.trim()
                      ? (() => {
                          const q = emojiSearch.toLowerCase()
                          const all = EMOJI_GROUPS.flatMap(g =>
                            g.emojis.filter(e => g.label.toLowerCase().includes(q) || e.includes(q))
                          )
                          return all.length === 0
                            ? <p className="text-xs text-[#55556a] text-center py-3">Nenhum resultado</p>
                            : <div className="flex flex-wrap gap-1">{all.map(e => (
                                <button key={e} type="button"
                                  onClick={() => { upd('emoji', e); setShowEmojiPicker(false); setEmojiSearch('') }}
                                  className="w-8 h-8 text-lg rounded-lg hover:bg-[#ff7a00]/15 flex items-center justify-center transition-colors"
                                >{e}</button>
                              ))}</div>
                        })()
                      : EMOJI_GROUPS.map(g => (
                          <div key={g.label}>
                            <p className="text-[9px] uppercase tracking-wider text-[#55556a] mb-1 px-1">{g.label}</p>
                            <div className="flex flex-wrap gap-1">
                              {g.emojis.map(e => (
                                <button key={e} type="button"
                                  onClick={() => { upd('emoji', e); setShowEmojiPicker(false); setEmojiSearch('') }}
                                  className="w-8 h-8 text-lg rounded-lg hover:bg-[#ff7a00]/15 flex items-center justify-center transition-colors"
                                  style={displayEmoji === e ? { background: 'rgba(255,122,0,.2)' } : undefined}
                                >{e}</button>
                              ))}
                            </div>
                          </div>
                        ))
                    }
                  </div>
                  {form.emoji && (
                    <button
                      type="button"
                      onClick={() => { upd('emoji', ''); setShowEmojiPicker(false) }}
                      className="w-full text-[10px] text-[#55556a] hover:text-[#ff4466] py-1 transition-colors"
                    >Restaurar padrão da categoria</button>
                  )}
                </div>
              )}
            </div>
            <input className="input-dark flex-1" placeholder="Ex: Comprar apartamento"
              value={form.name} onChange={e => upd('name', e.target.value)} />
          </div>
        </div>

        {/* Impact type */}
        <div>
          <label className="text-xs text-[#8888aa] mb-1.5 block">Como esta meta afeta seu patrimônio?</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'savings', label: 'Poupança', desc: 'Acumula mensalmente', icon: '💰' },
              { value: 'expense', label: 'Gasto',    desc: 'Reduz na data alvo',  icon: '💸' },
              { value: 'income',  label: 'Receita',  desc: 'Adiciona na data',    icon: '📈' },
            ].map(opt => (
              <button key={opt.value} onClick={() => upd('impactType', opt.value)}
                className={clsx(
                  'flex flex-col items-start p-3 rounded-xl border text-left transition-all',
                  form.impactType === opt.value
                    ? 'border-[#ff7a00] bg-[#ff7a00]/10'
                    : 'border-[#1e1e2e] hover:border-[#2a2a3e]',
                )}>
                <span className="text-lg mb-1">{opt.icon}</span>
                <span className={clsx('text-sm font-medium', form.impactType === opt.value ? 'text-[#ff7a00]' : 'text-[#e8e8f0]')}>{opt.label}</span>
                <span className="text-[10px] text-[#55556a] mt-0.5">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Amounts */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[#8888aa] mb-1.5 block">Valor Alvo (R$)</label>
            <input className="input-dark" type="number" placeholder="0"
              value={form.targetAmount} onChange={e => upd('targetAmount', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-[#8888aa] mb-1.5 block">Valor Atual (R$)</label>
            <input className="input-dark" type="number" placeholder="0"
              value={form.currentAmount} onChange={e => upd('currentAmount', e.target.value)} />
          </div>
        </div>

        {/* Date + monthly contribution */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[#8888aa] mb-1.5 block">Data Alvo</label>
            <input type="date" className="input-dark"
              value={form.targetDate} onChange={e => upd('targetDate', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-[#8888aa] mb-1.5 block">Aporte Mensal (R$)</label>
            <input className="input-dark" type="number" placeholder="0"
              value={form.monthlyContribution} onChange={e => upd('monthlyContribution', e.target.value)} />
          </div>
        </div>

        {/* Recurring goal */}
        <div className="p-3 bg-[#16161f] rounded-xl border border-[#1e1e2e] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#e8e8f0] font-medium">Meta Recorrente</p>
              <p className="text-[10px] text-[#55556a] mt-0.5">Repete a cada N anos (ex: seguro do carro)</p>
            </div>
            <button
              type="button"
              onClick={() => upd('recurringEveryYears', form.recurringEveryYears !== '0' ? '0' : '1')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-all ${
                form.recurringEveryYears !== '0'
                  ? 'bg-[#ff7a00]/10 text-[#ff7a00] border-[#ff7a00]/30'
                  : 'bg-[#1e1e2e] text-[#55556a] border-[#1e1e2e] hover:text-[#e8e8f0]'
              }`}
            >
              {form.recurringEveryYears !== '0' ? 'Ativa' : 'Inativa'}
            </button>
          </div>
          {form.recurringEveryYears !== '0' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[#8888aa] mb-1 block">Repetir a cada (anos)</label>
                <input className="input-dark text-xs" type="number" min="1" max="30"
                  value={form.recurringEveryYears}
                  onChange={e => upd('recurringEveryYears', e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-[#8888aa] mb-1 block">Nº de repetições</label>
                <input className="input-dark text-xs" type="number" min="1" max="50"
                  value={form.recurringRepetitions}
                  onChange={e => upd('recurringRepetitions', e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-[#8888aa] mb-1.5 block">Descrição (opcional)</label>
          <textarea className="input-dark resize-none" rows={2}
            placeholder="Detalhes sobre esta meta…"
            value={form.description} onChange={e => upd('description', e.target.value)} />
        </div>
      </div>

      <ModalFooter>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave}
          disabled={!form.name || !form.targetDate || !form.targetAmount}>
          {initial ? 'Salvar' : 'Criar Meta'}
        </button>
      </ModalFooter>
    </Modal>
  )
}

// ─── Goal Card ──────────────────────────────
function GoalCard({ goal, onEdit, onDelete, onToggle, isHidden, onEyeToggle }: {
  goal: FinancialGoal
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  isHidden: boolean
  onEyeToggle: () => void
}) {
  const pct = progressPct(goal.currentAmount, goal.targetAmount)
  const today = new Date()
  const target = new Date(goal.targetDate)
  const monthsLeft = monthsBetween(today, target)
  const remaining = goal.targetAmount - goal.currentAmount

  const s = statusOf(goal)
  const statusPill: Record<string, { bg: string; fg: string; label: string }> = {
    completed: { bg: 'rgba(0,255,136,.1)',   fg: '#00ff88', label: 'Concluído'  },
    ontrack:   { bg: 'rgba(0,212,255,.1)',   fg: '#00d4ff', label: 'No Prazo'  },
    behind:    { bg: 'rgba(245,158,11,.1)',  fg: '#f59e0b', label: 'Atrasado'  },
    late:      { bg: 'rgba(255,68,102,.1)',  fg: '#ff4466', label: 'Vencido'   },
  }
  const sp = statusPill[s]

  return (
    <div
      className={clsx(
        'v2-card flex flex-col gap-0 overflow-hidden transition-all duration-240',
        'hover:border-[rgba(0,212,255,.25)] hover:translate-y-[-1px]',
        goal.isCompleted && 'opacity-75',
      )}
    >
      {/* Colored top accent bar */}
      <div className="h-[3px] w-full flex-shrink-0" style={{ background: goal.color }} />

      <div className="p-4 flex flex-col gap-3.5 flex-1">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: goal.color + '18', border: `1px solid ${goal.color}30` }}
          >
            {goal.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#e8e8f0] truncate leading-tight">{goal.name}</p>
            {goal.description
              ? <p className="text-[11px] text-[#55556a] mt-0.5 line-clamp-1">{goal.description}</p>
              : <p className="text-[11px] text-[#55556a] mt-0.5">
                  {goal.impactType === 'expense' ? 'Gasto pontual' : goal.impactType === 'income' ? 'Receita pontual' : 'Acumulação mensal'}
                </p>
            }
          </div>
          <span className="v2-pill flex-shrink-0" style={{ background: sp.bg, color: sp.fg }}>{sp.label}</span>
        </div>

        {/* Progress */}
        <div>
          <div className="flex justify-between items-baseline mb-1.5">
            <span className="text-[11px] text-[#8888aa] v2-num">
              {formatBRL(goal.currentAmount, true)} <span className="text-[#55556a]">/ {formatBRL(goal.targetAmount, true)}</span>
            </span>
            <span className="text-sm font-bold v2-num" style={{ color: goal.color }}>{pct.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-[#1e1e30] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: goal.color, transition: 'width 500ms cubic-bezier(.22,.61,.36,1)' }}
            />
          </div>
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Falta',     value: formatBRL(Math.max(0, remaining), true) },
            { label: 'Data alvo', value: formatDate(goal.targetDate).slice(0, 8) },
            {
              label: goal.impactType === 'savings' ? 'Aporte/mês' : monthsLeft > 0 ? 'Meses' : 'Prazo',
              value: goal.impactType === 'savings'
                ? formatBRL(goal.monthlyContribution, true)
                : monthsLeft > 0 ? `${monthsLeft}m` : 'Vencido',
            },
          ].map(stat => (
            <div key={stat.label} className="rounded-lg p-2 text-center" style={{ background: '#0a0a0f', border: '1px solid #1e1e30' }}>
              <p className="v2-caption" style={{ letterSpacing: '0.02em', fontSize: '9px' }}>{stat.label}</p>
              <p className="text-[11px] font-semibold v2-num text-[#e8e8f0] mt-0.5 truncate">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Footer: tags + actions */}
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(goal.recurringEveryYears ?? 0) > 0 && (
              <span className="v2-pill" style={{ background: 'rgba(255,122,0,.1)', color: '#ff7a00', fontSize: '10px', padding: '3px 7px' }}>
                🔁 {goal.recurringEveryYears}a{(goal.recurringRepetitions ?? 0) > 1 ? ` ×${goal.recurringRepetitions}` : ''}
              </span>
            )}
            {isHidden && (
              <span className="v2-pill" style={{ background: 'rgba(85,85,106,.15)', color: '#55556a', fontSize: '10px', padding: '3px 7px' }}>
                oculto
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={onEyeToggle} title={isHidden ? 'Mostrar no gráfico' : 'Ocultar do gráfico'}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#55556a] hover:bg-[#1e1e30] hover:text-[#e8e8f0] transition-colors">
              {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button onClick={onToggle} title={goal.isCompleted ? 'Reabrir' : 'Marcar concluído'}
              className={clsx('w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
                goal.isCompleted ? 'text-[#00ff88] hover:bg-[#00ff88]/10' : 'text-[#55556a] hover:bg-[#00ff88]/10 hover:text-[#00ff88]')}>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onEdit}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#55556a] hover:bg-[#00d4ff]/10 hover:text-[#00d4ff] transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#55556a] hover:bg-[#ff4466]/10 hover:text-[#ff4466] transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Custom Tooltip ─────────────────────────
function ProjectionTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#16161f] border border-[#2a2a3e] rounded-xl p-3 text-xs shadow-2xl">
      <p className="text-[#8888aa] mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="font-semibold" style={{ color: p.color }}>
          {p.name}: {formatBRL(p.value, true)}
        </p>
      ))}
    </div>
  )
}

// ─── Chart layout constants (must match AreaChart margin + YAxis width) ───────
const PLOT_MARGIN_LEFT  = 10  // AreaChart margin.left
const PLOT_MARGIN_RIGHT = 10  // AreaChart margin.right
const PLOT_MARGIN_TOP   = 36  // AreaChart margin.top
const YAXIS_WIDTH       = 70

// ─── Main Page ──────────────────────────────
export default function Goals() {
  const { goals, investments, updateGoal, deleteGoal, settings } = useStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [showModal,   setShowModal]   = useState(false)
  const [editTarget,  setEditTarget]  = useState<FinancialGoal | undefined>()
  const [filter,      setFilter]      = useState<'all' | 'active' | 'completed'>('active')
  const [growthRate,  setGrowthRate]  = useState(6)
  const [monthlyExpenses, setMonthlyExpenses] = useState(0)
  const [horizonYears, setHorizonYears] = useState(10)

  // Eye toggle: goals excluded from projection chart
  const [hiddenGoalIds, setHiddenGoalIds] = useState<Set<string>>(new Set())
  const toggleHidden = (id: string) =>
    setHiddenGoalIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Draft dates: overrides during emoji drag (goal id → ISO date string)
  const [draftDates, setDraftDates] = useState<Record<string, string>>({})

  // Chart container ref for drag position calculations
  const chartWrapRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(700)
  useEffect(() => {
    const el = chartWrapRef.current
    if (!el) return
    const obs = new ResizeObserver(e => setChartWidth(e[0].contentRect.width))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Drag state
  const draggingIdRef = useRef<string | null>(null)

  const idxToDate = useCallback((idx: number): string => {
    const d = new Date()
    d.setMonth(d.getMonth() + idx * 3)
    return d.toISOString().split('T')[0]
  }, [])

  const dateToIdx = useCallback((dateStr: string, totalPoints: number): number => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const d = new Date(dateStr)
    const months = Math.max(0, (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth()))
    return Math.max(0, Math.min(totalPoints - 1, Math.round(months / 3)))
  }, [])

  const xToIdx = useCallback((clientX: number, totalPoints: number): number => {
    const rect = chartWrapRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const plotLeft  = PLOT_MARGIN_LEFT + YAXIS_WIDTH
    const plotRight = chartWidth - PLOT_MARGIN_RIGHT
    const plotW     = plotRight - plotLeft
    const relX      = clientX - rect.left - plotLeft
    const rawIdx    = (relX / plotW) * (totalPoints - 1)
    return Math.max(0, Math.min(totalPoints - 1, Math.round(rawIdx)))
  }, [chartWidth])

  // Global mouse handlers for drag
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const id = draggingIdRef.current
      if (!id) return
      // We need projectionData length — use a data attribute on the container
      const el = chartWrapRef.current
      const n = el ? parseInt(el.dataset.points ?? '0') : 0
      if (n === 0) return
      const idx  = xToIdx(e.clientX, n)
      const date = idxToDate(idx)
      setDraftDates(prev => ({ ...prev, [id]: date }))
    }
    const onUp = async (e: MouseEvent) => {
      const id = draggingIdRef.current
      if (!id) return
      draggingIdRef.current = null
      const el = chartWrapRef.current
      const n = el ? parseInt(el.dataset.points ?? '0') : 0
      if (n > 0) {
        const idx  = xToIdx(e.clientX, n)
        const date = idxToDate(idx)
        // Persist to store
        const goal = goals.find(g => g.id === id)
        if (goal) await updateGoal({ ...goal, targetDate: date })
      }
      setDraftDates(prev => { const n = { ...prev }; delete n[id]; return n })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [goals, updateGoal, xToIdx, idxToDate])

  // Bidirectional exponential cashflow slider: -1M to +1M, center = 0
  const CF_MAX = 1_000_000
  const cfLogMax = Math.log1p(CF_MAX)
  const cashflowToPos = (v: number): number => {
    if (v === 0) return 0.5
    if (v > 0) return 0.5 + Math.log1p(v) / (2 * cfLogMax)
    return 0.5 - Math.log1p(-v) / (2 * cfLogMax)
  }
  const posToCashflow = (pos: number): number => {
    const delta = pos - 0.5
    if (Math.abs(delta) < 0.001) return 0
    const raw = Math.expm1(Math.abs(delta) * 2 * cfLogMax) * Math.sign(delta)
    const abs = Math.abs(raw)
    const step = abs < 1000 ? 10 : abs < 10000 ? 100 : abs < 100000 ? 500 : 1000
    return Math.sign(raw) * Math.min(CF_MAX, Math.round(abs / step) * step)
  }
  const cfSliderPos = cashflowToPos(monthlyExpenses)
  const setCfFromSlider = (pos: number) => setMonthlyExpenses(posToCashflow(pos))

  // Current net worth (simplified — sum of investment portfolio in BRL)
  const currentNetWorth = useMemo(() => {
    return investments.reduce((sum, inv) => {
      const valueBRL = inv.currency === 'USD'
        ? inv.quantity * inv.currentPrice * settings.usdToBrl
        : inv.quantity * inv.currentPrice
      return sum + valueBRL
    }, 0)
  }, [investments, settings.usdToBrl])

  // Total monthly contributions from all active savings goals
  const totalMonthlyContrib = useMemo(() =>
    goals.filter(g => !g.isCompleted && g.impactType === 'savings').reduce((s, g) => s + g.monthlyContribution, 0),
    [goals])

  // Goals with draft date overrides applied (for live drag preview)
  const goalsWithDrafts = useMemo(() =>
    goals.map(g => draftDates[g.id] ? { ...g, targetDate: draftDates[g.id] } : g),
    [goals, draftDates])

  // Projection data — uses draft-overridden goals and excludes hidden
  const projectionData = useMemo(() =>
    buildProjection(goalsWithDrafts, currentNetWorth, totalMonthlyContrib, growthRate, monthlyExpenses, horizonYears, hiddenGoalIds),
    [goalsWithDrafts, currentNetWorth, totalMonthlyContrib, growthRate, monthlyExpenses, horizonYears, hiddenGoalIds])

  // Pyramid tier crossings — ALL unreached tiers, with optional chart visibility flag
  const tierCrossings = useMemo(() => {
    const chartMax = projectionData.reduce((m, p) => Math.max(m, p.withGoals as number), 0)
    return PYRAMID_TIERS
      .filter(t => t.min > 0 && t.min > currentNetWorth)
      .map(tier => {
        const idx = projectionData.findIndex(p => (p.withGoals as number) >= tier.min)
        const withinChart = tier.min <= chartMax
        let timeLabel: string
        if (idx === -1) {
          timeLabel = 'além do horizonte'
        } else {
          const monthsAhead = idx * 3
          const years = Math.floor(monthsAhead / 12)
          const months = monthsAhead % 12
          timeLabel = years > 0 ? (months > 0 ? `${years}a ${months}m` : `${years}a`) : `${months}m`
        }
        return { tier, idx, timeLabel, withinChart, label: idx >= 0 ? projectionData[idx]?.label ?? '' : '' }
      })
  }, [projectionData, currentNetWorth])

  // Filtered goals
  const filteredGoals = useMemo(() => {
    if (filter === 'completed') return goals.filter(g => g.isCompleted)
    if (filter === 'active')    return goals.filter(g => !g.isCompleted)
    return goals
  }, [goals, filter])

  // Reveal animations
  useReveal(containerRef, [goals.length, filter])

  // Summary stats
  const totalTarget      = goals.filter(g => !g.isCompleted).reduce((s, g) => s + g.targetAmount, 0)
  const totalSaved       = goals.filter(g => !g.isCompleted).reduce((s, g) => s + g.currentAmount, 0)
  const completedCount   = goals.filter(g => g.isCompleted).length
  const activeGoals      = goals.filter(g => !g.isCompleted)

  // Attention-strip derived values
  const lateGoals     = activeGoals.filter(g => statusOf(g) === 'late' || statusOf(g) === 'behind')
  const nextDeadline  = activeGoals
    .filter(g => new Date(g.targetDate) >= new Date())
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))[0]
  const overallPct    = totalTarget > 0 ? Math.min(100, (totalSaved / totalTarget) * 100) : 0

  const handleToggle = async (goal: FinancialGoal) => {
    await updateGoal({ ...goal, isCompleted: !goal.isCompleted })
  }

  const handleDelete = async (id: string) => {
    if (confirm('Excluir esta meta?')) await deleteGoal(id)
  }

  // Goal event markers — uses draft overrides, excludes hidden
  const goalEvents = useMemo(() => {
    const today = new Date()
    const horizonMonths = horizonYears * 12
    const events: { idx: number; goal: FinancialGoal; date: Date; occurrenceIndex: number; total: number }[] = []
    for (const g of goalsWithDrafts) {
      if (g.isCompleted || g.impactType === 'savings' || hiddenGoalIds.has(g.id)) continue
      const occs = expandOccurrences(g, today, horizonMonths)
      occs.forEach((d, i) => {
        const monthsAhead = monthsBetween(today, d)
        const idx = Math.round(monthsAhead / 3)
        if (idx >= 0 && idx < projectionData.length) {
          events.push({ idx, goal: g, date: d, occurrenceIndex: i, total: occs.length })
        }
      })
    }
    return events
  }, [goalsWithDrafts, projectionData.length, horizonYears, hiddenGoalIds])

  return (
    <div className="v2-root min-w-0" ref={containerRef}>
      <V2PageHeader
        title="Metas Financeiras"
        subtitle={`${activeGoals.length} ativas · ${completedCount} concluídas · ${formatBRL(totalMonthlyContrib, true)}/mês`}
        right={
          <button
            onClick={() => { setEditTarget(undefined); setShowModal(true) }}
            className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"
            style={{ background: '#ff7a00', color: '#0a0a0f' }}
          >
            <Plus className="w-3.5 h-3.5" /> Nova Meta
          </button>
        }
      />

      <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">

        {/* HERO */}
        <section className="v2-card-emph v2-dot-grid p-6 sm:p-8 v2-reveal">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="flex-1 min-w-0">
              <p className="v2-caption">Total acumulado</p>
              <div className="flex items-baseline gap-3 mt-1.5 flex-wrap">
                <span className="v2-num text-4xl sm:text-5xl font-bold tracking-tight" style={{ color: '#e8e8f0' }}>
                  {formatBRL(totalSaved)}
                </span>
                {totalTarget > 0 && (
                  <span className="v2-pill" style={{ background: 'rgba(255,122,0,.12)', color: '#ff7a00', border: '1px solid rgba(255,122,0,.25)' }}>
                    {overallPct.toFixed(0)}% de {formatBRL(totalTarget, true)}
                  </span>
                )}
              </div>
              {totalTarget > 0 && (
                <div className="mt-4 h-2 bg-[#1e1e30] rounded-full overflow-hidden max-w-md">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${overallPct}%`, background: 'linear-gradient(90deg, #ff7a00, #ff9a3f)', transition: 'width 600ms cubic-bezier(.22,.61,.36,1)' }}
                  />
                </div>
              )}
              <div className="mt-3 flex items-center gap-4 text-xs text-[#8888aa] flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" style={{ color: '#ff7a00' }} />
                  <span className="text-white font-semibold">{activeGoals.length}</span> metas ativas
                </span>
                <span className="text-[#2a2a3e]">·</span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#00ff88' }} />
                  <span className="text-white font-semibold">{completedCount}</span> concluídas
                </span>
                {totalMonthlyContrib > 0 && (
                  <>
                    <span className="text-[#2a2a3e]">·</span>
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" style={{ color: '#00d4ff' }} />
                      <span className="v2-num text-white font-semibold">{formatBRL(totalMonthlyContrib, true)}</span>/mês em aportes
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Per-goal progress bars — mini sparkline style */}
            {activeGoals.length > 0 && (
              <div className="lg:w-64 flex-shrink-0 space-y-2">
                <p className="v2-caption mb-2">Progresso por meta</p>
                {activeGoals
                  .sort((a, b) => progressPct(b.currentAmount, b.targetAmount) - progressPct(a.currentAmount, a.targetAmount))
                  .slice(0, 5)
                  .map(g => {
                    const p = progressPct(g.currentAmount, g.targetAmount)
                    return (
                      <div key={g.id} className="flex items-center gap-2">
                        <span className="text-sm w-5 text-center flex-shrink-0">{g.emoji}</span>
                        <div className="flex-1 h-1.5 bg-[#1e1e30] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${p}%`, background: g.color, transition: 'width 500ms ease' }} />
                        </div>
                        <span className="v2-num text-[10px] text-[#8888aa] w-8 text-right flex-shrink-0">{p.toFixed(0)}%</span>
                      </div>
                    )
                  })}
                {activeGoals.length > 5 && (
                  <p className="text-[10px] text-[#55556a] pl-7">+{activeGoals.length - 5} mais</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ATTENTION STRIP */}
        <section className="space-y-2.5 v2-reveal">
          <p className="v2-caption">Vale sua atenção</p>
          <div className="grid md:grid-cols-3 gap-2.5">
            {lateGoals.length > 0 ? (
              <AttentionChip
                icon={AlertCircle}
                tone="red"
                title={`${lateGoals.length} meta${lateGoals.length > 1 ? 's' : ''} atrasada${lateGoals.length > 1 ? 's' : ''}`}
                subtitle={lateGoals.map(g => g.name).slice(0, 2).join(', ') + (lateGoals.length > 2 ? ` +${lateGoals.length - 2}` : '')}
                onClick={() => setFilter('active')}
              />
            ) : (
              <AttentionChip
                icon={CheckCircle2}
                tone="green"
                title="Todas as metas no prazo"
                subtitle="Nenhuma meta atrasada ou em atraso"
              />
            )}
            {nextDeadline ? (
              <AttentionChip
                icon={CalendarClock}
                tone="cyan"
                title={`Próximo vencimento: ${nextDeadline.name}`}
                subtitle={formatDate(nextDeadline.targetDate) + ` · ${formatBRL(nextDeadline.targetAmount, true)}`}
              />
            ) : (
              <AttentionChip
                icon={CalendarClock}
                tone="muted"
                title="Sem vencimentos futuros"
                subtitle="Nenhuma meta com data alvo definida"
              />
            )}
            <AttentionChip
              icon={TrendingUp}
              tone="orange"
              title={`Aporte mensal: ${formatBRL(totalMonthlyContrib, true)}`}
              subtitle={`${activeGoals.filter(g => g.impactType === 'savings').length} metas de poupança ativas`}
              onClick={() => { setEditTarget(undefined); setShowModal(true) }}
            />
          </div>
        </section>

        {/* KPI STRIP */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 v2-reveal">
          <KpiCard
            caption="Metas Ativas"
            value={String(activeGoals.length)}
            valueColor="#00d4ff"
            secondary={`${goals.length} no total`}
            pillText={activeGoals.length > 0 ? 'ativas' : 'vazio'}
            pillColor={activeGoals.length > 0 ? 'cyan' : 'muted'}
          />
          <KpiCard
            caption="Concluídas"
            value={String(completedCount)}
            valueColor="#00ff88"
            secondary={goals.length > 0 ? `${((completedCount / goals.length) * 100).toFixed(0)}% do total` : '—'}
            pillText={completedCount > 0 ? 'concluído' : 'nenhuma'}
            pillColor={completedCount > 0 ? 'green' : 'muted'}
          />
          <KpiCard
            caption="Total Acumulado"
            value={formatBRL(totalSaved, true)}
            valueColor="#8b5cf6"
            secondary={totalTarget > 0 ? `de ${formatBRL(totalTarget, true)}` : 'sem meta total'}
            pillText={totalTarget > 0 ? `${overallPct.toFixed(0)}%` : '—'}
            pillColor="muted"
          />
          <KpiCard
            caption="Aporte Mensal"
            value={formatBRL(totalMonthlyContrib, true)}
            valueColor="#f59e0b"
            secondary={`${activeGoals.filter(g => g.impactType === 'savings').length} metas de poupança`}
            pillText={totalMonthlyContrib > 0 ? 'ativo' : 'sem'}
            pillColor={totalMonthlyContrib > 0 ? 'amber' : 'muted'}
          />
        </section>

        {/* PROJECTION CHART */}
        <section className="v2-card p-5 v2-reveal">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#e8e8f0]">Projeção de Patrimônio — {horizonYears} Anos</p>
              <p className="v2-caption mt-0.5" style={{ textTransform: 'none', letterSpacing: 0 }}>
                Crescimento real estimado com e sem aportes mensais das metas
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs flex-shrink-0">
              <span className="flex items-center gap-1.5 text-[#8888aa]">
                <span className="w-3 h-0.5 bg-[#00d4ff] rounded inline-block" />Com Metas
              </span>
              <span className="flex items-center gap-1.5 text-[#8888aa]">
                <span className="w-3 h-0.5 bg-[#55556a] rounded inline-block" style={{ borderStyle: 'dashed' }} />Sem Metas
              </span>
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-4 flex-wrap mb-4">
            {/* Horizon */}
            <div className="flex items-center gap-1.5">
              <span className="v2-caption" style={{ textTransform: 'none' }}>Horizonte:</span>
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[#0a0a0f] border border-[#1e1e30]">
                {[5, 10, 15, 20, 30].map(y => (
                  <button
                    key={y}
                    onClick={() => setHorizonYears(y)}
                    className={clsx('px-2 py-1 rounded-lg text-[11px] font-semibold transition-all',
                      horizonYears === y ? 'bg-[#00d4ff]/10 text-[#00d4ff]' : 'text-[#55556a] hover:text-[#e8e8f0]')}
                  >{y}a</button>
                ))}
              </div>
            </div>
            {/* Growth rate */}
            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
              <span className="v2-caption whitespace-nowrap" style={{ textTransform: 'none' }}>Retorno:</span>
              <input
                type="range" min="0" max="8" step="0.5" value={growthRate}
                onChange={e => setGrowthRate(parseFloat(e.target.value))}
                className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                style={{ background: `linear-gradient(to right, #00d4ff ${(growthRate / 8) * 100}%, #1e1e30 ${(growthRate / 8) * 100}%)` }}
              />
              <span className="v2-num text-xs font-bold w-14 text-right flex-shrink-0" style={{ color: growthRate === 0 ? '#55556a' : '#00d4ff' }}>
                {growthRate === 0 ? '0%' : `${growthRate.toFixed(1)}% a.a.`}
              </span>
            </div>
            {/* Cashflow */}
            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
              <span className="v2-caption whitespace-nowrap" style={{ textTransform: 'none' }}>Fluxo:</span>
              <div className="relative flex-1">
                <input
                  type="range" min="0" max="1" step="0.001" value={cfSliderPos}
                  onChange={e => setCfFromSlider(parseFloat(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: monthlyExpenses === 0 ? '#1e1e30'
                      : monthlyExpenses > 0
                        ? `linear-gradient(to right, #1e1e30 50%, #00ff88 50%, #00ff88 ${cfSliderPos * 100}%, #1e1e30 ${cfSliderPos * 100}%)`
                        : `linear-gradient(to right, #1e1e30 ${cfSliderPos * 100}%, #ff4466 ${cfSliderPos * 100}%, #ff4466 50%, #1e1e30 50%)`,
                  }}
                />
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#2a2a3e] pointer-events-none" />
              </div>
              <span className="v2-num text-xs font-bold w-16 text-right flex-shrink-0" style={{ color: monthlyExpenses === 0 ? '#55556a' : monthlyExpenses > 0 ? '#00ff88' : '#ff4466' }}>
                {monthlyExpenses === 0 ? 'neutro' : `${monthlyExpenses > 0 ? '+' : '−'}${formatBRL(Math.abs(monthlyExpenses), true)}`}
              </span>
            </div>
          </div>

          {/* Chart */}
          <div
            ref={chartWrapRef}
            data-points={String(projectionData.length)}
            className="relative select-none"
          >
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={projectionData} margin={{ top: 36, right: 10, bottom: 0, left: 10 }}>
                <defs>
                  <linearGradient id="goalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00d4ff" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#00d4ff" stopOpacity={0}    />
                  </linearGradient>
                  <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#8888aa" stopOpacity={0.08} />
                    <stop offset="95%" stopColor="#8888aa" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e30" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#55556a', fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
                <YAxis tick={{ fill: '#55556a', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => formatBRL(v, true)} width={YAXIS_WIDTH} />
                <Tooltip content={<ProjectionTooltip />} />

                {tierCrossings.filter(c => c.withinChart).map(({ tier, timeLabel }) => (
                  <ReferenceLine key={`tier-${tier.key}`} y={tier.min} stroke={tier.color} strokeDasharray="6 3" strokeWidth={1.5}
                    label={{ value: `${tier.name} · ${formatBRL(tier.min, true)} · em ${timeLabel}`, position: 'insideTopRight', fill: tier.color, fontSize: 9, fontWeight: 600 }} />
                ))}
                {goalEvents.map(({ goal, idx, occurrenceIndex }) => (
                  <ReferenceLine key={`${goal.id}-${occurrenceIndex}`} x={projectionData[idx]?.label}
                    stroke={goal.impactType === 'expense' ? '#ff4466' : '#00ff88'} strokeDasharray="4 2"
                    label={occurrenceIndex > 0 ? { value: goal.emoji, position: 'top', fill: '#e8e8f0', fontSize: 14 } : undefined} />
                ))}

                <Area type="monotone" dataKey="withoutGoals" name="Sem Metas" stroke="#55556a" strokeWidth={1.5} strokeDasharray="5 3" fill="url(#baseGrad)" dot={false} />
                <Area type="monotone" dataKey="withGoals" name="Com Metas" stroke="#00d4ff" strokeWidth={2} fill="url(#goalGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>

            {/* Draggable emoji overlays */}
            {goalEvents.filter(e => e.occurrenceIndex === 0).map(({ goal, idx }) => {
              const N = projectionData.length - 1
              const plotLeft  = PLOT_MARGIN_LEFT + YAXIS_WIDTH
              const plotRight = chartWidth - PLOT_MARGIN_RIGHT
              const xPx = plotLeft + (N > 0 ? idx / N : 0) * (plotRight - plotLeft)
              const isDragging = draggingIdRef.current === goal.id
              return (
                <div key={goal.id} title={`Arrastar: ${goal.name}`}
                  className="absolute flex flex-col items-center gap-0.5 cursor-grab active:cursor-grabbing"
                  style={{ left: xPx, top: PLOT_MARGIN_TOP - 30, transform: 'translateX(-50%)' }}
                  onMouseDown={e => { e.preventDefault(); draggingIdRef.current = goal.id }}>
                  <span className="text-base leading-none transition-transform"
                    style={{ filter: isDragging ? 'drop-shadow(0 0 6px #00d4ff)' : undefined, transform: isDragging ? 'scale(1.3)' : undefined }}>
                    {goal.emoji}
                  </span>
                  {draftDates[goal.id] && (
                    <span className="text-[9px] text-[#00d4ff] whitespace-nowrap bg-[#0d0d14] px-1 rounded">{formatDate(draftDates[goal.id])}</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Goal events legend */}
          {goalEvents.length > 0 && (() => {
            const seen = new Map<string, { goal: FinancialGoal; date: Date; total: number }>()
            for (const { goal, date, total } of goalEvents) {
              if (!seen.has(goal.id)) seen.set(goal.id, { goal, date, total })
            }
            return (
              <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-[#1e1e30]">
                {[...seen.values()].map(({ goal, date, total }) => (
                  <div key={goal.id} className="flex items-center gap-1.5 text-xs text-[#8888aa]">
                    <span>{goal.emoji}</span>
                    <span className="text-[#e8e8f0]">{goal.name}</span>
                    <span className="text-[#55556a]">({formatDate(date.toISOString().split('T')[0])})</span>
                    {total > 1 && (
                      <span className="v2-pill" style={{ background: 'rgba(255,122,0,.1)', color: '#ff7a00', fontSize: '9px', padding: '2px 6px' }}>×{total}</span>
                    )}
                    <span style={{ color: goal.impactType === 'expense' ? '#ff4466' : '#00ff88' }}>
                      {goal.impactType === 'expense' ? `−${formatBRL(goal.targetAmount, true)}` : `+${formatBRL(goal.targetAmount, true)}`}
                    </span>
                  </div>
                ))}
              </div>
            )
          })()}
        </section>

        {/* GOALS GRID */}
        <section className="v2-reveal">
          <div className="flex items-center gap-3 mb-4">
            <PeriodTabs
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'active',    label: `Ativas (${activeGoals.length})` },
                { value: 'all',       label: 'Todas' },
                { value: 'completed', label: `Concluídas (${completedCount})` },
              ]}
            />
            <span className="ml-auto v2-caption">{filteredGoals.length} meta{filteredGoals.length !== 1 ? 's' : ''}</span>
          </div>

          {filteredGoals.length === 0 ? (
            <div className="v2-card p-12 text-center">
              <Target className="w-10 h-10 mx-auto mb-3" style={{ color: '#1e1e30' }} />
              <p className="text-sm text-[#55556a]">
                {filter === 'completed' ? 'Nenhuma meta concluída ainda' : 'Nenhuma meta cadastrada'}
              </p>
              {filter !== 'completed' && (
                <button
                  onClick={() => { setEditTarget(undefined); setShowModal(true) }}
                  className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 mx-auto"
                  style={{ background: '#ff7a00', color: '#0a0a0f' }}
                >
                  <Plus className="w-3.5 h-3.5" /> Criar primeira meta
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredGoals.map(goal => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  onEdit={() => { setEditTarget(goal); setShowModal(true) }}
                  onDelete={() => handleDelete(goal.id)}
                  onToggle={() => handleToggle(goal)}
                  isHidden={hiddenGoalIds.has(goal.id)}
                  onEyeToggle={() => toggleHidden(goal.id)}
                />
              ))}
            </div>
          )}
        </section>

      </div>

      {/* FAB */}
      <FabMenu onPrimary={() => { setEditTarget(undefined); setShowModal(true) }} />

      {showModal && (
        <GoalModal
          open={showModal}
          onClose={() => { setShowModal(false); setEditTarget(undefined) }}
          initial={editTarget}
        />
      )}
    </div>
  )
}
