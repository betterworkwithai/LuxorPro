import React, { useState, useEffect } from 'react'
import { Globe, Building2, Home, ClipboardList, Plus, X, ChevronRight } from 'lucide-react'
import { Modal, ModalFooter } from '../ui/Modal'
import { useStore } from '../../store/useStore'
import { todayISO, formatDate } from '../../lib/formatters'
import type { Investment, AssetLocation, TaxTreatment, PricePoint, CashflowEvent, CashflowEventType } from '../../lib/types'
import { LIQUIDITY_OPTIONS, BENCHMARK_OPTIONS, RISK_LABELS } from '../../lib/types'
import { LOCAL_CLASSES, INTL_CLASSES } from '../../lib/suitability'
import { markInvestmentEdited } from '../../lib/userEditedInvestments'
import { supabase } from '../../lib/supabase'
import { clsx } from 'clsx'

// ─── Asset classes by location ────────────────
export const BRL_CLASSES = LOCAL_CLASSES
export const USD_EUR_CLASSES = INTL_CLASSES
export const PHYSICAL_RE_CLASSES = ['Imóvel Residencial', 'Imóvel Comercial', 'Terreno', 'Outro Imóvel Físico']

export const ALL_PREDEFINED_CLASSES = [...BRL_CLASSES, ...USD_EUR_CLASSES, ...PHYSICAL_RE_CLASSES]

export const PREDEFINED_INSTITUTIONS = [
  'Avenue', 'Banco do Brasil', 'BTG Pactual', 'Bradesco', 'Caixa',
  'Clear', 'Genial', 'Interactive Brokers', 'Inter', 'Itaú',
  'Nubank', 'Rico', 'Santander', 'Schwab', 'Warren',
  'Wise', 'XP Investimentos',
].sort((a, b) => a.localeCompare(b, 'pt-BR'))

const TAX_OPTIONS: { value: TaxTreatment; label: string; desc: string; color: string }[] = [
  { value: 'taxable',      label: 'Tributável',       desc: 'CDB, LF, COE, etc.',                       color: '#ff4466' },
  { value: 'tax-deferred', label: 'Imposto Diferido',  desc: 'VGBL, PGBL, etc.',                        color: '#f59e0b' },
  { value: 'tax-exempt',   label: 'Isento de IR',      desc: 'LCI / LCA / CRI / CRA / Infraestrutura',  color: '#00ff88' },
]

const LOCATION_OPTIONS: { value: AssetLocation; label: string; icon: typeof Building2; color: string }[] = [
  { value: 'onshore',     label: 'Onshore (Brasil)',         icon: Building2, color: '#00d4ff' },
  { value: 'offshore',    label: 'Offshore (Internacional)', icon: Globe,     color: '#ff7a00' },
  { value: 'physical-re', label: 'Imóvel Físico / Empresa',  icon: Home,      color: '#8b5cf6' },
]

const CLASS_CUSTOM = '__custom__'
const INST_CUSTOM  = '__inst_custom__'

// ─── Product type options ──────────────────────
type ProductType = 'titulo' | 'fundo' | 'acao' | 'coe'

const PRODUCT_TYPES: { value: ProductType; label: string; emoji: string; desc: string }[] = [
  { value: 'titulo', label: 'Título',  emoji: '📄', desc: 'CDB, LCI, LCA, Debênture…' },
  { value: 'fundo',  label: 'Fundo',   emoji: '🏦', desc: 'FI, FIA, FIM, FII…' },
  { value: 'acao',   label: 'Ação',    emoji: '📈', desc: 'Ações, ETFs, BDRs…' },
  { value: 'coe',    label: 'COE',     emoji: '🔧', desc: 'Certificado de Operações Estruturadas' },
]

const TITULO_TYPES = ['CDB', 'CDCA', 'CPR', 'CRA', 'CRI', 'Debênture', 'LCA', 'LCI', 'LF', 'LIG', 'Outro', 'Soberano'].sort((a, b) => a.localeCompare(b, 'pt-BR'))

const FUNDO_TYPES = [
  'FI', 'FIA', 'FIAGRO', 'FIDC', 'FII', 'FI-Infra', 'FIM', 'FIP',
  'Outro',
  'Previdência PGBL', 'Previdência VGBL',
].sort((a, b) => a.localeCompare(b, 'pt-BR'))

const PAYMENT_FREQ_TITULO_COE = ['Mensal', 'Trimestral', 'Semestral', 'Anual', 'Vencimento']
const PAYMENT_FREQ_FUNDO = ['Mensal', 'Distribuição de Capital - Alternativos', 'Vencimento', 'Não distribui juros']

const RISK_COLORS: Record<number, string> = {
  1: '#60a5fa', 2: '#84cc16', 3: '#eab308', 4: '#f97316', 5: '#ef4444',
}

// ─── Bulk-paste parser ────────────────────────
function parseBrazilDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[\/\-.‐](\d{1,2})[\/\-.‐](\d{2,4})$/)
  if (!m) return null
  let [, d, mo, y] = m
  if (y.length === 2) y = y < '50' ? '20' + y : '19' + y
  return `${y.padStart(4, '20')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseAnyNumber(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(/R\$\s*/i, '')
  if (!t) return null
  const lastComma  = t.lastIndexOf(',')
  const lastPeriod = t.lastIndexOf('.')
  let norm: string
  if (lastComma > lastPeriod) {
    // Brazilian: comma is decimal separator (e.g. "1.234,56")
    norm = t.replace(/\./g, '').replace(',', '.')
  } else {
    // US / plain (e.g. "1,234.56" or "564.44")
    norm = t.replace(/,/g, '')
  }
  const n = parseFloat(norm)
  return isNaN(n) ? null : n
}

function parsePasteRows(text: string): { date: string; value: number }[] {
  const results: { date: string; value: number }[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    // Split by tab, semicolon, or 2+ spaces
    const parts = line.split(/\t|;|\s{2,}/).map(p => p.trim()).filter(Boolean)
    if (parts.length < 2) continue
    let date: string | null = null
    let value: number | null = null
    for (const p of parts) {
      if (!date) { date = parseBrazilDate(p); if (date) continue }
      if (date && value === null) { value = parseAnyNumber(p); if (value !== null) break }
    }
    if (date && value !== null && !seen.has(date)) {
      seen.add(date)
      results.push({ date, value })
    }
  }
  return results
}

// ─── Form state ──────────────────────────────
const blank = () => ({
  // step 1 — Tipo & Classe
  location: 'onshore' as AssetLocation,
  currency: 'BRL' as 'BRL' | 'USD' | 'EUR',
  assetClass: 'Pós-Fixado',
  customClass: '',
  taxTreatment: 'taxable' as TaxTreatment,
  // step 2 — Posição
  productType: '' as '' | ProductType,
  name: '',
  ticker: '',
  tituloType: '',
  fundType: '',
  institutionSelect: '',
  institutionCustom: '',
  quantity: '',
  avgCost: '',
  currentPrice: '',
  purchaseDate: todayISO(),
  benchmark: '',
  interestRate: '',
  custodyFee: '',
  managementFee: '',
  performanceFee: '',
  maturityDate: '',
  liquidity: '',
  riskLevel: '' as '' | 1 | 2 | 3 | 4 | 5,
  paymentFrequency: '',
  issuer: '',
  holding: '',
  sector: '',
  country: '',
  gestora: '',
  notes: '',
})

function inferProductType(i: Investment): '' | ProductType {
  if (i.productType) return i.productType
  if (i.managementFee != null || i.performanceFee != null) return 'fundo'
  if (i.maturityDate || i.interestRate != null) return 'titulo'
  return 'acao'
}

const fromInvestment = (i: Investment, allInstitutions: string[]) => {
  const isPredefined = ALL_PREDEFINED_CLASSES.includes(i.assetClass)
  const isKnownInst  = allInstitutions.includes(i.institution)
  return {
    location:          i.location,
    currency:          i.currency,
    assetClass:        isPredefined ? i.assetClass : CLASS_CUSTOM,
    customClass:       isPredefined ? '' : i.assetClass,
    taxTreatment:      i.taxTreatment ?? 'taxable',
    productType:       inferProductType(i),
    name:              i.name,
    ticker:            i.ticker ?? '',
    tituloType:        i.tituloType ?? '',
    fundType:          i.fundType ?? '',
    institutionSelect: isKnownInst ? i.institution : (i.institution ? INST_CUSTOM : ''),
    institutionCustom: isKnownInst ? '' : (i.institution ?? ''),
    quantity:          String(i.quantity),
    avgCost:           String(i.avgCost),
    currentPrice:      String(i.currentPrice),
    purchaseDate:      i.purchaseDate,
    benchmark:         i.benchmark ?? '',
    interestRate:      String(i.interestRate ?? ''),
    custodyFee:        String(i.custodyFee ?? ''),
    managementFee:     String(i.managementFee ?? ''),
    performanceFee:    String(i.performanceFee ?? ''),
    maturityDate:      i.maturityDate ?? '',
    liquidity:         i.liquidity ?? '',
    riskLevel:         (i.riskLevel ?? '') as '' | 1 | 2 | 3 | 4 | 5,
    paymentFrequency:  i.paymentFrequency ?? '',
    issuer:            i.issuer ?? '',
    holding:           i.holding ?? '',
    sector:            i.sector ?? '',
    country:           i.country ?? '',
    gestora:           i.gestora ?? '',
    notes:             i.notes ?? '',
  }
}

interface Props {
  open: boolean
  onClose: () => void
  initial?: Investment
  /** Bank-statement transactions linked to this investment (set by WealthV2). */
  linkedTransactions?: import('../../lib/types').Transaction[]
  /** Pre-fill the form from an existing transaction (e.g. user is converting
   *  a Pluggy-imported "expense" that was actually a transfer to a broker
   *  into a real Investment record). Quantity defaults to 1, currentPrice
   *  and avgCost are seeded with the transaction amount, name + purchase
   *  date come from the transaction. */
  seedFromTransaction?: {
    description: string
    amount:      number
    date:        string
  }
  /** Called after a successful save when the modal was opened in
   *  seedFromTransaction mode — used to delete the source transaction. */
  onSeedSaved?: () => void | Promise<void>
}

const STEPS = [
  { key: 'classify', label: 'Tipo & Classe' },
  { key: 'core',     label: 'Posição' },
  { key: 'history',  label: 'Histórico & Rendimentos' },
] as const

const CASHFLOW_EVENT_TYPES: { value: CashflowEventType; label: string; color: string }[] = [
  { value: 'dividend',     label: 'Dividendo / Rendimento',  color: '#00ff88' },
  { value: 'coupon',       label: 'Cupom / Juros',           color: '#00d4ff' },
  { value: 'amortization', label: 'Amortização',             color: '#f59e0b' },
  { value: 'jcp',          label: 'JCP',                     color: '#8b5cf6' },
  { value: 'other',        label: 'Outro',                   color: '#55556a' },
]

// ─── Risk buttons ────────────────────────────
function RiskButtons({ value, onChange }: { value: '' | 1|2|3|4|5; onChange: (v: ''|1|2|3|4|5) => void }) {
  return (
    <div className="col-span-2">
      <label className="text-xs text-[#8888aa] mb-1.5 block">Risco do Ativo</label>
      <div className="flex gap-2">
        {([1, 2, 3, 4, 5] as const).map(level => {
          const c = RISK_COLORS[level]
          const active = value === level
          return (
            <button key={level} type="button"
              onClick={() => onChange(value === level ? '' : level)}
              className="flex-1 py-2 rounded-xl text-[10px] font-medium border transition-all"
              style={active
                ? { background: c + '22', borderColor: c + '88', color: c }
                : { background: '#16161f', borderColor: '#1e1e2e', color: '#55556a' }}>
              <span className="block font-semibold leading-tight">Risco {level}</span>
              <span className="block leading-tight">{RISK_LABELS[level]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Institution select ──────────────────────
function InstitutionField({ sel, custom, allInstitutions, onSel, onCustom }: {
  sel: string; custom: string; allInstitutions: string[]
  onSel: (v: string) => void; onCustom: (v: string) => void
}) {
  return (
    <>
      <div className="col-span-2 grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[#8888aa] mb-1.5 block">Instituição / Custodiante</label>
          <select className="input-dark" value={sel} onChange={e => onSel(e.target.value)}>
            <option value="">Selecionar…</option>
            {allInstitutions.map(i => <option key={i} value={i}>{i}</option>)}
            <option value={INST_CUSTOM}>Personalizado…</option>
          </select>
        </div>
        {sel === INST_CUSTOM && (
          <div>
            <label className="text-xs text-[#8888aa] mb-1.5 block">Nome da Instituição</label>
            <input className="input-dark" value={custom} onChange={e => onCustom(e.target.value)} />
          </div>
        )}
      </div>
    </>
  )
}

export function InvestmentModal({ open, onClose, initial, linkedTransactions, seedFromTransaction, onSeedSaved }: Props) {
  const { addInvestment, updateInvestment, deleteInvestment, investments, settings, saveCustomInstitution } = useStore()

  // Only show institutions already in use + any the user has manually saved
  const allInstitutions = Array.from(new Set([
    ...investments.map(i => i.institution).filter(Boolean),
    ...(settings.customInstitutions ?? []),
  ])).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  // Build the initial form state — from an existing Investment, from a
  // transaction-seed (one-click conversion), or blank.
  const buildInitial = () => {
    if (initial) return fromInvestment(initial, allInstitutions)
    const base = blank()
    if (seedFromTransaction) {
      const amt = String(seedFromTransaction.amount.toFixed(2))
      return {
        ...base,
        name:         seedFromTransaction.description,
        quantity:     '1',
        avgCost:      amt,
        currentPrice: amt,
        purchaseDate: seedFromTransaction.date,
      }
    }
    return base
  }

  const [f, setF]             = useState(buildInitial)
  const [step, setStep]       = useState(0)
  const [saving, setSaving]   = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [history, setHistory] = useState<PricePoint[]>(initial?.priceHistory ?? [])
  const [hpDate, setHpDate]   = useState('')
  const [hpPrice, setHpPrice] = useState('')
  // Cashflow events (dividends, coupons, amortizations, etc.)
  const [cashflowHistory, setCashflowHistory] = useState<CashflowEvent[]>(initial?.cashflowHistory ?? [])
  const [cfDate, setCfDate]     = useState('')
  const [cfType, setCfType]     = useState<CashflowEventType>('dividend')
  const [cfAmount, setCfAmount] = useState('')
  const [cfDesc, setCfDesc]     = useState('')
  const [histTab, setHistTab]   = useState<'prices' | 'cashflow'>('prices')
  const [showPricePaste, setShowPricePaste] = useState(false)
  const [pricePasteText, setPricePasteText] = useState('')
  const [showCfPaste, setShowCfPaste]       = useState(false)
  const [cfPasteText, setCfPasteText]       = useState('')

  useEffect(() => {
    if (!open) return
    setF(buildInitial())
    setHistory(initial?.priceHistory ?? [])
    setCashflowHistory(initial?.cashflowHistory ?? [])
    setHistTab('prices')
    setShowPricePaste(false); setPricePasteText('')
    setShowCfPaste(false);    setCfPasteText('')
    setStep(0)
    setSaveError(null)
    setSaveSuccess(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id, seedFromTransaction?.description, seedFromTransaction?.amount, seedFromTransaction?.date])

  const upd = (k: string, v: string | number) => setF(p => ({ ...p, [k]: v }))

  const handleLocationChange = (loc: AssetLocation) => {
    setF(p => {
      let cur: 'BRL' | 'USD' | 'EUR' = p.currency
      let cls = p.assetClass
      if (loc === 'onshore') {
        cur = 'BRL'
        if (cls !== CLASS_CUSTOM && !BRL_CLASSES.includes(cls)) cls = BRL_CLASSES[0]
      } else if (loc === 'offshore') {
        if (cur === 'BRL') cur = 'USD'
        if (cls !== CLASS_CUSTOM && !USD_EUR_CLASSES.includes(cls)) cls = USD_EUR_CLASSES[0]
      } else {
        cur = 'BRL'
        if (cls !== CLASS_CUSTOM && !PHYSICAL_RE_CLASSES.includes(cls)) cls = PHYSICAL_RE_CLASSES[0]
      }
      return { ...p, location: loc, currency: cur, assetClass: cls }
    })
  }

  const handleCurrencyChange = (cur: 'BRL' | 'USD' | 'EUR') => {
    setF(p => {
      let cls = p.assetClass
      if (p.location === 'offshore' && cls !== CLASS_CUSTOM && !USD_EUR_CLASSES.includes(cls)) {
        cls = USD_EUR_CLASSES[0]
      }
      return { ...p, currency: cur, assetClass: cls }
    })
  }

  const resolvedClass       = f.assetClass === CLASS_CUSTOM ? f.customClass : f.assetClass
  const resolvedInstitution = f.institutionSelect === INST_CUSTOM ? f.institutionCustom : f.institutionSelect

  const classOptions =
    f.location === 'onshore'  ? BRL_CLASSES :
    f.location === 'offshore' ? USD_EUR_CLASSES :
                                PHYSICAL_RE_CLASSES

  const addHistoryPoint = () => {
    const price = parseFloat(hpPrice)
    if (!hpDate || isNaN(price)) return
    setHistory(prev => {
      const next = [...prev.filter(p => p.date !== hpDate), { date: hpDate, price }]
      next.sort((a, b) => a.date.localeCompare(b.date))
      return next
    })
    setHpDate(''); setHpPrice('')
  }
  const removeHistoryPoint = (date: string) => setHistory(prev => prev.filter(p => p.date !== date))

  const addCashflowEvent = () => {
    const amt = parseFloat(cfAmount)
    if (!cfDate || isNaN(amt) || amt <= 0) return
    setCashflowHistory(prev => {
      const next: CashflowEvent[] = [...prev, { date: cfDate, type: cfType, amount: amt, description: cfDesc.trim() || undefined }]
      next.sort((a, b) => a.date.localeCompare(b.date))
      return next
    })
    setCfDate(''); setCfAmount(''); setCfDesc('')
  }
  const removeCashflowEvent = (idx: number) =>
    setCashflowHistory(prev => prev.filter((_, i) => i !== idx))

  const canAdvance =
    step === 0 ? (f.assetClass !== CLASS_CUSTOM || f.customClass.trim().length > 0) :
    step === 1 ? Boolean(f.productType && f.name && f.quantity && f.avgCost && f.currentPrice && resolvedInstitution) :
    true

  const handleSave = async () => {
    const qty  = parseFloat(f.quantity)
    const avg  = parseFloat(f.avgCost)
    const curr = parseFloat(f.currentPrice)
    if (!f.name || isNaN(qty) || isNaN(avg) || isNaN(curr)) return
    if (f.assetClass === CLASS_CUSTOM && !f.customClass.trim()) return
    if (!resolvedInstitution) return

    if (f.institutionSelect === INST_CUSTOM && f.institutionCustom.trim()) {
      await saveCustomInstitution(f.institutionCustom.trim())
    }

    setSaving(true)
    setSaveError(null)
    const payload: Omit<Investment, 'id'> = {
      name:              f.name,
      ticker:            f.ticker || undefined,
      assetClass:        resolvedClass,
      location:          f.location,
      quantity:          qty,
      avgCost:           avg,
      currentPrice:      curr,
      currency:          f.currency,
      institution:       resolvedInstitution,
      purchaseDate:      f.purchaseDate,
      taxTreatment:      f.taxTreatment,
      benchmark:         f.benchmark || undefined,
      notes:             f.notes || undefined,
      liquidity:         f.liquidity || undefined,
      riskLevel:         f.riskLevel !== '' ? (f.riskLevel as 1|2|3|4|5) : undefined,
      priceHistory:      history.length > 0 ? history : undefined,
      cashflowHistory:   cashflowHistory.length > 0 ? cashflowHistory : undefined,
      productType:       f.productType || undefined,
      tituloType:        f.tituloType || undefined,
      fundType:          f.fundType || undefined,
      paymentFrequency:  f.paymentFrequency || undefined,
      holding:           f.holding || undefined,
      gestora:           f.gestora || undefined,
      sector:            f.sector  || undefined,
      country:           f.country || undefined,
      issuer:            f.issuer  || undefined,
      // Type-specific numeric fields
      maturityDate:      (f.productType === 'titulo' || f.productType === 'coe' || f.productType === 'fundo') && f.maturityDate && f.maturityDate !== 'none' ? f.maturityDate : undefined,
      interestRate:      (f.productType === 'titulo' || f.productType === 'coe') && f.interestRate ? parseFloat(f.interestRate) : undefined,
      custodyFee:        f.productType === 'titulo' && f.custodyFee ? parseFloat(f.custodyFee) : undefined,
      managementFee:     f.productType === 'fundo' && f.managementFee ? parseFloat(f.managementFee) : undefined,
      performanceFee:    f.productType === 'fundo' && f.performanceFee ? parseFloat(f.performanceFee) : undefined,
      // Stamp every manual save so Pluggy auto-sync knows to skip overwrites
      // on broker-sourced fields (quantity/currentPrice/avgCost/etc).
      lastUserEdit:      new Date().toISOString(),
    }
    try {
      if (initial) {
        // CRITICAL: spread `...initial` FIRST so the upsert preserves any
        // fields that aren't represented in the modal form (e.g.
        // dividendsReceived, interestReceived, capitalReturn, incomeReturn,
        // grossUpRate). Without this, every save silently wipes those
        // fields back to undefined.
        const merged: Investment = { ...initial, ...payload, id: initial.id }
        // ── Verbose pre-save diff so the user can SEE in console exactly
        // which fields differ between the version they opened and the
        // version they're about to save ─────────────────────────────────
        const beforeKeys = new Set([...Object.keys(initial), ...Object.keys(merged)])
        const diffs: Record<string, { from: unknown; to: unknown }> = {}
        for (const k of beforeKeys) {
          const a = (initial as Record<string, unknown>)[k]
          const b = (merged   as Record<string, unknown>)[k]
          if (JSON.stringify(a) !== JSON.stringify(b)) diffs[k] = { from: a, to: b }
        }
        // eslint-disable-next-line no-console
        console.log('[InvestmentModal] 📝 diff before save:', diffs)
        if (Object.keys(diffs).length === 0) {
          // eslint-disable-next-line no-console
          console.warn('[InvestmentModal] ⚠️ NO FIELDS CHANGED between initial and merged. Either the form didn\'t pick up your edits, or the values you entered match what was already there.')
        }
        await updateInvestment(merged)
        // Belt-and-suspenders: mark this investment ID in localStorage too,
        // so Pluggy sync can skip overwrite even if `lastUserEdit` somehow
        // fails to round-trip through Supabase JSONB.
        markInvestmentEdited(initial.id)
        console.info('[InvestmentModal] saved edit for', initial.id, 'with lastUserEdit', payload.lastUserEdit)
        // ── Triple-source verification: compare what we sent vs what's
        //    in Zustand (local) vs what's in Supabase (cloud). If they
        //    all agree, the save worked end-to-end. If they diverge, the
        //    log pinpoints exactly which layer broke. ─────────────────
        try {
          // 1. Zustand snapshot (synchronous, should reflect our set() above)
          const fromStore = useStore.getState().investments.find(x => x.id === initial.id)
          // 2. Supabase round-trip (read the row back)
          const { data: { user } } = await supabase.auth.getUser()
          let persisted: Record<string, unknown> | undefined
          if (user) {
            const { data: row, error: verErr } = await supabase
              .from('luxor_investments')
              .select('data')
              .eq('user_id', user.id)
              .eq('client_id', initial.id)
              .maybeSingle()
            if (verErr) {
              console.warn('[InvestmentModal] verify — Supabase fetch failed:', verErr.message)
            } else {
              persisted = row?.data as Record<string, unknown> | undefined
            }
          }
          // Per-field comparison: sent vs Zustand vs Supabase
          const sentObj  = merged as Record<string, unknown>
          const storeObj = (fromStore ?? {}) as Record<string, unknown>
          const cloudObj = persisted ?? {}
          const KEYS = ['name','ticker','quantity','avgCost','currentPrice','assetClass','institution','taxTreatment','riskLevel','liquidity','notes','priceHistory','productType','tituloType','fundType','lastUserEdit']
          let allMatch = true
          for (const k of KEYS) {
            const a = JSON.stringify(sentObj[k])
            const b = JSON.stringify(storeObj[k])
            const c = JSON.stringify(cloudObj[k])
            const storeOk = a === b
            const cloudOk = a === c
            if (!storeOk || !cloudOk) {
              allMatch = false
              // eslint-disable-next-line no-console
              console.warn(`[InvestmentModal] ${k}: ${storeOk ? '✓' : '✗'} store · ${cloudOk ? '✓' : '✗'} cloud`,
                { sent: sentObj[k], store: storeObj[k], cloud: cloudObj[k] })
            }
          }
          if (allMatch) {
            // eslint-disable-next-line no-console
            console.log('[InvestmentModal] ✅ All ' + KEYS.length + ' fields persisted to BOTH Zustand and Supabase. Save is working — if UI still shows stale data, it\'s a render/memo issue.')
          } else {
            console.warn('[InvestmentModal] ⚠️ Some fields did not persist — see individual ✗ logs above for which layer dropped them.')
          }
        } catch (e) {
          console.warn('[InvestmentModal] verify — unexpected error:', e)
        }
      } else {
        await addInvestment(payload)
        console.info('[InvestmentModal] added new investment with lastUserEdit', payload.lastUserEdit)
      }
      // If this was a transaction conversion, let the caller delete the source tx.
      if (seedFromTransaction && onSeedSaved) {
        try { await onSeedSaved() } catch (e) { console.error('[InvestmentModal] onSeedSaved failed:', e) }
      }
      setSaveSuccess(true)
      setSaving(false)
      // brief success state so the user sees confirmation before the modal closes
      setTimeout(() => { onClose() }, 600)
    } catch (e) {
      // Surface the error to the user instead of silently failing.
      console.error('[InvestmentModal] save failed:', e)
      setSaving(false)
      setSaveError(e instanceof Error ? e.message : 'Falha ao salvar. Verifique sua conexão.')
    }
  }

  const stepDot = (idx: number) => (
    <div key={idx} className="flex items-center gap-2">
      <button type="button" onClick={() => setStep(idx)}
        className="flex items-center gap-2 rounded-full transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/40 group">
        <div className={clsx(
          'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border transition-all',
          idx === step
            ? 'bg-[#ff7a00] border-[#ff7a00] text-[#0a0a0f]'
            : idx < step
              ? 'bg-[#ff7a00]/15 border-[#ff7a00]/40 text-[#ff7a00] group-hover:bg-[#ff7a00]/25'
              : 'bg-[#16161f] border-[#1e1e2e] text-[#55556a] group-hover:border-[#ff7a00]/40 group-hover:text-[#e8e8f0]',
        )}>
          {idx + 1}
        </div>
        <span className={clsx('text-xs hidden sm:block', idx === step ? 'text-[#e8e8f0] font-medium' : 'text-[#55556a] group-hover:text-[#e8e8f0]')}>
          {STEPS[idx].label}
        </span>
      </button>
      {idx < STEPS.length - 1 && <div className="w-6 sm:w-10 h-px bg-[#1e1e2e]" />}
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar Ativo' : 'Adicionar Ativo'} size="lg">
      {/* Stepper */}
      <div className="px-6 py-4 border-b border-[#1e1e2e] flex items-center gap-1">
        {STEPS.map((_, idx) => stepDot(idx))}
      </div>

      <div className="px-6 py-5 grid grid-cols-2 gap-4">

        {/* ─── Step 1: Tipo & Classe (unchanged) ─── */}
        {step === 0 && (
          <>
            <div className="col-span-2">
              <label className="text-xs text-[#8888aa] mb-2 block">Localização do Ativo</label>
              <div className="grid grid-cols-3 gap-2">
                {LOCATION_OPTIONS.map(opt => {
                  const Icon = opt.icon
                  const active = f.location === opt.value
                  return (
                    <button key={opt.value} onClick={() => handleLocationChange(opt.value)}
                      className="py-3 px-2 rounded-xl text-xs font-medium border transition-all flex flex-col items-center gap-1.5"
                      style={active ? { background: opt.color + '15', borderColor: opt.color + '55', color: opt.color }
                                    : { background: '#16161f', borderColor: '#1e1e2e', color: '#55556a' }}>
                      <Icon className="w-4 h-4" />
                      <span className="text-center leading-tight">{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Moeda</label>
              <select className="input-dark" value={f.currency}
                onChange={e => handleCurrencyChange(e.target.value as 'BRL' | 'USD' | 'EUR')}
                disabled={f.location === 'physical-re'}>
                <option value="BRL">BRL (R$)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Classe do Ativo</label>
              <select className="input-dark" value={f.assetClass} onChange={e => upd('assetClass', e.target.value)}>
                {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
                <option value={CLASS_CUSTOM}>Personalizado…</option>
              </select>
            </div>

            {f.assetClass === CLASS_CUSTOM && (
              <div className="col-span-2">
                <label className="text-xs text-[#8888aa] mb-1.5 block">Nome da Classe Personalizada</label>
                <input className="input-dark" placeholder="Ex: Debêntures, Crypto Yield…"
                  value={f.customClass} onChange={e => upd('customClass', e.target.value)} />
              </div>
            )}

            <div className="col-span-2">
              <label className="text-xs text-[#8888aa] mb-1.5 block">Tax Status</label>
              <div className="grid grid-cols-3 gap-2">
                {TAX_OPTIONS.map(opt => {
                  const active = f.taxTreatment === opt.value
                  return (
                    <button key={opt.value} onClick={() => upd('taxTreatment', opt.value)}
                      className="py-2.5 px-3 rounded-xl text-xs font-medium border transition-all text-left"
                      style={active ? { background: opt.color + '15', borderColor: opt.color + '55', color: opt.color }
                                    : { background: '#16161f', borderColor: '#1e1e2e', color: '#55556a' }}>
                      <span className="font-semibold block">{opt.label}</span>
                      <span className="text-[10px] opacity-70 mt-0.5 block">{opt.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ─── Step 2: Posição ─── */}
        {step === 1 && (
          <>
            {/* Tipo de Produto */}
            <div className="col-span-2">
              <label className="text-xs text-[#8888aa] mb-2 block">Tipo de Produto</label>
              <div className="grid grid-cols-4 gap-2">
                {PRODUCT_TYPES.map(pt => {
                  const active = f.productType === pt.value
                  return (
                    <button key={pt.value} type="button"
                      onClick={() => {
                        const next: Partial<ReturnType<typeof blank>> = { productType: pt.value }
                        if (pt.value === 'acao') next.liquidity = 'D+2'
                        setF(p => ({ ...p, ...next }))
                      }}
                      className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-medium border transition-all"
                      style={active
                        ? { background: '#ff7a00' + '18', borderColor: '#ff7a00' + '55', color: '#ff7a00' }
                        : { background: '#16161f', borderColor: '#1e1e2e', color: '#55556a' }}>
                      <span className="text-lg leading-none">{pt.emoji}</span>
                      <span className="font-semibold">{pt.label}</span>
                      <span className="text-[9px] text-center leading-tight opacity-70">{pt.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {f.productType && (
              <>
                {/* ── Nome ── */}
                <div className="col-span-2">
                  <label className="text-xs text-[#8888aa] mb-1.5 block">Nome / Descrição</label>
                  <input className="input-dark"
                    placeholder={
                      f.productType === 'titulo' ? 'Ex: CDB Itaú 14,5% a.a.' :
                      f.productType === 'fundo'  ? 'Ex: Verde AM, SPX Raptor FIM…' :
                      f.productType === 'acao'   ? 'Ex: Petrobras PN, Apple Inc…' :
                                                   'Ex: COE Itaú Barreira Dupla…'
                    }
                    value={f.name} onChange={e => upd('name', e.target.value)} />
                </div>

                {/* ── Ticker (Título, Ação) ── */}
                {(f.productType === 'titulo' || f.productType === 'acao') && (
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Ticker (opcional)</label>
                    <input className="input-dark" placeholder={f.productType === 'acao' ? 'Ex: PETR4, AAPL' : 'Ex: TEFLO17'}
                      value={f.ticker} onChange={e => upd('ticker', e.target.value)} />
                  </div>
                )}

                {/* ── Tipo do Título ── */}
                {f.productType === 'titulo' && (
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Tipo</label>
                    <select className="input-dark" value={f.tituloType} onChange={e => upd('tituloType', e.target.value)}>
                      <option value="">Selecionar…</option>
                      {TITULO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}

                {/* ── Tipo do Fundo ── */}
                {f.productType === 'fundo' && (
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Tipo</label>
                    <select className="input-dark" value={f.fundType} onChange={e => upd('fundType', e.target.value)}>
                      <option value="">Selecionar…</option>
                      {FUNDO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}

                {/* ── Instituição ── */}
                <InstitutionField
                  sel={f.institutionSelect}
                  custom={f.institutionCustom}
                  allInstitutions={allInstitutions}
                  onSel={v => upd('institutionSelect', v)}
                  onCustom={v => upd('institutionCustom', v)}
                />

                {/* ── Quantidade, Preços, Data ── */}
                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">
                    {f.productType === 'fundo' ? 'Quantidade de Cotas' : 'Quantidade'}
                  </label>
                  <input className="input-dark" type="number" placeholder="1"
                    value={f.quantity} onChange={e => upd('quantity', e.target.value)} />
                </div>

                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">
                    {f.productType === 'fundo' ? 'Preço Cota Aquisição' : 'Preço Aquisição'}
                  </label>
                  <input className="input-dark" type="number"
                    value={f.avgCost} onChange={e => upd('avgCost', e.target.value)} />
                </div>

                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">
                    {f.productType === 'fundo' ? 'Preço Cota Atual' : 'Preço Atual'}
                  </label>
                  <input className="input-dark" type="number"
                    value={f.currentPrice} onChange={e => upd('currentPrice', e.target.value)} />
                </div>

                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">Data da Compra</label>
                  <input type="date" className="input-dark" value={f.purchaseDate}
                    onChange={e => upd('purchaseDate', e.target.value)} />
                </div>

                {/* ── Benchmark ── */}
                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">Benchmark</label>
                  <select className="input-dark" value={f.benchmark} onChange={e => upd('benchmark', e.target.value)}>
                    <option value="">Nenhum</option>
                    {BENCHMARK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                {/* ── Taxa % a.a. (Título, COE) ── */}
                {(f.productType === 'titulo' || f.productType === 'coe') && (
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Taxa % a.a.</label>
                    <input className="input-dark" type="number" placeholder="14.5"
                      value={f.interestRate} onChange={e => upd('interestRate', e.target.value)} />
                  </div>
                )}

                {/* ── Vencimento (Título, COE, Fundo) ── */}
                {(f.productType === 'titulo' || f.productType === 'coe' || f.productType === 'fundo') && (
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Vencimento</label>
                    <input type="date" className="input-dark"
                      value={f.maturityDate === 'none' || (f.productType === 'fundo' && f.maturityDate === '') ? '' : f.maturityDate}
                      disabled={f.maturityDate === 'none' || (f.productType === 'fundo' && f.maturityDate === '')}
                      onChange={e => upd('maturityDate', e.target.value)} />
                    <label className="flex items-center gap-2 mt-1.5 text-[11px] text-[#8888aa] cursor-pointer">
                      <input type="checkbox"
                        checked={f.maturityDate === 'none' || (f.productType === 'fundo' && f.maturityDate === '')}
                        onChange={e => upd('maturityDate', e.target.checked ? 'none' : new Date().toISOString().slice(0, 10))} />
                      Sem Vencimento
                    </label>
                  </div>
                )}

                {/* ── Liquidez ── */}
                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">Liquidez</label>
                  <select className="input-dark" value={f.liquidity} onChange={e => upd('liquidity', e.target.value)}>
                    <option value="">Selecionar…</option>
                    {LIQUIDITY_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>

                {/* ── Taxa de Custódia (Título only) ── */}
                {f.productType === 'titulo' && (
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Taxa de Custódia % a.a.</label>
                    <input className="input-dark" type="number" step="0.01" placeholder="0.20"
                      value={f.custodyFee} onChange={e => upd('custodyFee', e.target.value)} />
                  </div>
                )}

                {/* ── Taxa de Administração (Fundo) ── */}
                {f.productType === 'fundo' && (
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Taxa de Administração % a.a.</label>
                    <input className="input-dark" type="number" step="0.01" placeholder="1.50"
                      value={f.managementFee} onChange={e => upd('managementFee', e.target.value)} />
                  </div>
                )}

                {/* ── Taxa de Performance (Fundo) ── */}
                {f.productType === 'fundo' && (
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Taxa de Performance %</label>
                    <input className="input-dark" type="number" step="0.1" placeholder="20"
                      value={f.performanceFee} onChange={e => upd('performanceFee', e.target.value)} />
                  </div>
                )}

                {/* ── Risco ── */}
                <RiskButtons
                  value={f.riskLevel}
                  onChange={v => setF(p => ({ ...p, riskLevel: v }))}
                />

                {/* ── Frequência de Pagamento de Juros ── */}
                {(f.productType === 'titulo' || f.productType === 'coe' || f.productType === 'fundo') && (
                  <div className="col-span-2">
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Frequência de Pagamento de Juros</label>
                    <select className="input-dark" value={f.paymentFrequency} onChange={e => upd('paymentFrequency', e.target.value)}>
                      <option value="">Selecionar…</option>
                      {(f.productType === 'fundo' ? PAYMENT_FREQ_FUNDO : PAYMENT_FREQ_TITULO_COE)
                        .map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                )}

                {/* ── Emissor (Título, Ação) ── */}
                {(f.productType === 'titulo' || f.productType === 'acao') && (
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Emissor</label>
                    <input className="input-dark" placeholder="Ex: Itaú, Apple Inc…"
                      value={f.issuer} onChange={e => upd('issuer', e.target.value)} />
                  </div>
                )}

                {/* ── Holding (Título, Ação) ── */}
                {(f.productType === 'titulo' || f.productType === 'acao') && (
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Holding</label>
                    <input className="input-dark" placeholder="Ex: Itaúsa, Vivo…"
                      value={f.holding} onChange={e => upd('holding', e.target.value)} />
                  </div>
                )}

                {/* ── Setor (Título, Ação) ── */}
                {(f.productType === 'titulo' || f.productType === 'acao') && (
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Setor</label>
                    <input className="input-dark" placeholder="Ex: Financeiro, Tecnologia…"
                      value={f.sector} onChange={e => upd('sector', e.target.value)} />
                  </div>
                )}

                {/* ── País (Título, Ação) ── */}
                {(f.productType === 'titulo' || f.productType === 'acao') && (
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">País</label>
                    <input className="input-dark" placeholder="Ex: Brasil, EUA…"
                      value={f.country} onChange={e => upd('country', e.target.value)} />
                  </div>
                )}

                {/* ── Gestora (Fundo) ── */}
                {f.productType === 'fundo' && (
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Gestora</label>
                    <input className="input-dark" placeholder="Ex: Verde AM, Itaú Asset…"
                      value={f.gestora} onChange={e => upd('gestora', e.target.value)} />
                  </div>
                )}

                {/* ── Observações ── */}
                <div className="col-span-2">
                  <label className="text-xs text-[#8888aa] mb-1.5 block">
                    Observações{f.productType === 'fundo' ? ' (ex. Capital Comprometido)' : ''}
                  </label>
                  <input className="input-dark"
                    placeholder={f.productType === 'fundo' ? 'Ex: Capital comprometido R$ 500k, chamadas trimestrais' : ''}
                    value={f.notes} onChange={e => upd('notes', e.target.value)} />
                </div>
              </>
            )}
          </>
        )}

        {/* ─── Step 3: Histórico & Rendimentos ─── */}
        {step === 2 && (
          <div className="col-span-2 space-y-4">
            {/* Tab switcher */}
            <div className="flex gap-1 p-1 bg-[#0a0a0f] rounded-xl border border-[#1e1e2e]">
              {[
                { key: 'prices',   label: `Preços ${history.length > 0 ? `(${history.length})` : ''}` },
                { key: 'cashflow', label: `Rendimentos ${cashflowHistory.length > 0 ? `(${cashflowHistory.length})` : ''}` },
              ].map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setHistTab(tab.key as 'prices' | 'cashflow')}
                  className={clsx(
                    'flex-1 py-1.5 rounded-lg text-xs font-medium transition-all',
                    histTab === tab.key
                      ? 'bg-[#ff7a00] text-[#0a0a0f]'
                      : 'text-[#55556a] hover:text-[#e8e8f0]',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Prices tab ── */}
            {histTab === 'prices' && (
              <>
                <div className="p-3 bg-[#ff7a00]/5 border border-[#ff7a00]/20 rounded-xl">
                  <p className="text-xs text-[#ff7a00] font-medium mb-1">Histórico de Preços (opcional)</p>
                  <p className="text-[11px] text-[#8888aa]">
                    Adicione pontos históricos para que os gráficos de performance (1M, 6M, YTD, 1Y, ALL) reflitam dados reais.
                  </p>
                </div>

                {/* Mode toggle */}
                <div className="flex items-center gap-1.5">
                  <button type="button"
                    onClick={() => { setShowPricePaste(false); setPricePasteText('') }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${!showPricePaste ? 'bg-[#ff7a00]/15 border-[#ff7a00]/40 text-[#ff7a00]' : 'bg-[#16161f] border-[#1e1e2e] text-[#55556a] hover:text-[#e8e8f0]'}`}
                  >Adicionar ponto</button>
                  <button type="button"
                    onClick={() => setShowPricePaste(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${showPricePaste ? 'bg-[#ff7a00]/15 border-[#ff7a00]/40 text-[#ff7a00]' : 'bg-[#16161f] border-[#1e1e2e] text-[#55556a] hover:text-[#e8e8f0]'}`}
                  ><ClipboardList className="w-3.5 h-3.5"/>Colar do Excel</button>
                </div>

                {!showPricePaste ? (
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                    <div>
                      <label className="text-xs text-[#8888aa] mb-1.5 block">Data</label>
                      <input type="date" className="input-dark" value={hpDate} onChange={e => setHpDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-[#8888aa] mb-1.5 block">Preço ({f.currency})</label>
                      <input type="number" className="input-dark" value={hpPrice} onChange={e => setHpPrice(e.target.value)} />
                    </div>
                    <button onClick={addHistoryPoint} disabled={!hpDate || !hpPrice} className="btn-primary h-[38px]">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      className="w-full h-44 bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-3 text-[11px] text-[#e8e8f0] font-mono placeholder:text-[#55556a] resize-none focus:outline-none focus:border-[#ff7a00]/40"
                      placeholder={`Cole dados copiados do Excel (data + preço, um por linha):\n\nData\t\tPreço\n30/04/2026\t1,02\n31/03/2026\t1,01\n28/02/2026\t0,98\n\nAceita DD/MM/AAAA, vírgula ou ponto decimal, separado por Tab.`}
                      value={pricePasteText}
                      onChange={e => setPricePasteText(e.target.value)}
                    />
                    {pricePasteText.trim() && (() => {
                      const parsed = parsePasteRows(pricePasteText)
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[#8888aa]">
                              {parsed.length > 0
                                ? `${parsed.length} ponto${parsed.length !== 1 ? 's' : ''} detectado${parsed.length !== 1 ? 's' : ''}`
                                : 'Nenhuma linha reconhecida — verifique o formato'}
                            </span>
                            <button
                              type="button"
                              disabled={parsed.length === 0}
                              onClick={() => {
                                setHistory(prev => {
                                  const next = [...prev]
                                  for (const { date, value: price } of parsed) {
                                    const idx = next.findIndex(p => p.date === date)
                                    if (idx >= 0) next[idx] = { date, price }
                                    else next.push({ date, price })
                                  }
                                  return next.sort((a, b) => a.date.localeCompare(b.date))
                                })
                                setPricePasteText('')
                                setShowPricePaste(false)
                              }}
                              className="btn-primary text-xs px-4 py-1.5 disabled:opacity-40"
                            >Importar {parsed.length} ponto{parsed.length !== 1 ? 's' : ''}</button>
                          </div>
                          {parsed.length > 0 && (
                            <div className="border border-[#1e1e2e] rounded-xl overflow-hidden">
                              <div className="max-h-36 overflow-y-auto">
                                {parsed.map(({ date, value }) => (
                                  <div key={date} className="flex items-center justify-between px-3 py-1.5 border-b border-[#1e1e2e] last:border-0 text-xs">
                                    <span className="text-[#8888aa]">{formatDate(date)}</span>
                                    <span className="font-mono text-[#e8e8f0]">{value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}

                {history.length === 0 ? (
                  <p className="text-xs text-[#55556a] italic text-center py-6">Nenhum ponto histórico ainda.</p>
                ) : (
                  <div className="border border-[#1e1e2e] rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1e1e2e] bg-[#0d0e1c]">
                      <span className="text-[10px] uppercase tracking-wider text-[#55556a]">{history.length} pontos salvos</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {[...history].reverse().map(p => (
                        <div key={p.date} className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e2e] last:border-0 text-xs">
                          <span className="text-[#8888aa]">{formatDate(p.date)}</span>
                          <span className="text-[#e8e8f0] font-mono">{p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
                          <button onClick={() => removeHistoryPoint(p.date)} className="text-[#55556a] hover:text-[#ff4466]">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Cashflow events tab ── */}
            {histTab === 'cashflow' && (
              <>
                <div className="p-3 bg-[#00ff88]/5 border border-[#00ff88]/20 rounded-xl">
                  <p className="text-xs text-[#00ff88] font-medium mb-1">Histórico de Rendimentos (opcional)</p>
                  <p className="text-[11px] text-[#8888aa]">
                    Registre dividendos, cupons, amortizações e JCP recebidos. O total é acumulado separadamente dos campos manuais do ativo.
                  </p>
                </div>

                {/* Event type selector */}
                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">Tipo de Evento</label>
                  <div className="flex flex-wrap gap-1.5">
                    {CASHFLOW_EVENT_TYPES.map(et => (
                      <button
                        key={et.value}
                        type="button"
                        onClick={() => setCfType(et.value)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all"
                        style={cfType === et.value
                          ? { background: et.color + '18', borderColor: et.color + '55', color: et.color }
                          : { background: '#16161f', borderColor: '#1e1e2e', color: '#55556a' }}
                      >
                        {et.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mode toggle */}
                <div className="flex items-center gap-1.5">
                  <button type="button"
                    onClick={() => { setShowCfPaste(false); setCfPasteText('') }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${!showCfPaste ? 'bg-[#00ff88]/15 border-[#00ff88]/40 text-[#00ff88]' : 'bg-[#16161f] border-[#1e1e2e] text-[#55556a] hover:text-[#e8e8f0]'}`}
                  >Adicionar</button>
                  <button type="button"
                    onClick={() => setShowCfPaste(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${showCfPaste ? 'bg-[#00ff88]/15 border-[#00ff88]/40 text-[#00ff88]' : 'bg-[#16161f] border-[#1e1e2e] text-[#55556a] hover:text-[#e8e8f0]'}`}
                  ><ClipboardList className="w-3.5 h-3.5"/>Colar do Excel</button>
                </div>

                {!showCfPaste ? (
                  <>
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div>
                        <label className="text-xs text-[#8888aa] mb-1.5 block">Data</label>
                        <input type="date" className="input-dark" value={cfDate} onChange={e => setCfDate(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs text-[#8888aa] mb-1.5 block">Valor Total ({f.currency})</label>
                        <input type="number" className="input-dark" placeholder="0.00" value={cfAmount} onChange={e => setCfAmount(e.target.value)} />
                      </div>
                      <button onClick={addCashflowEvent} disabled={!cfDate || !cfAmount} className="btn-primary h-[38px]">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <label className="text-xs text-[#8888aa] mb-1.5 block">Descrição (opcional)</label>
                      <input className="input-dark" placeholder="Ex: Dividendo referente a nov/24" value={cfDesc} onChange={e => setCfDesc(e.target.value)} />
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      className="w-full h-44 bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-3 text-[11px] text-[#e8e8f0] font-mono placeholder:text-[#55556a] resize-none focus:outline-none focus:border-[#00ff88]/40"
                      placeholder={`Cole dados copiados do Excel (data + valor, um por linha):\n\nData\t\tProventos\n30/04/2026\t564,44\n31/03/2026\t599,40\n28/02/2026\t587,22\n\nAceita DD/MM/AAAA, vírgula ou ponto decimal, separado por Tab.`}
                      value={cfPasteText}
                      onChange={e => setCfPasteText(e.target.value)}
                    />
                    {cfPasteText.trim() && (() => {
                      const parsed = parsePasteRows(cfPasteText)
                      const activeCfType = CASHFLOW_EVENT_TYPES.find(t => t.value === cfType)
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[#8888aa]">
                              {parsed.length > 0
                                ? `${parsed.length} rendimento${parsed.length !== 1 ? 's' : ''} detectado${parsed.length !== 1 ? 's' : ''}`
                                : 'Nenhuma linha reconhecida — verifique o formato'}
                            </span>
                            <button
                              type="button"
                              disabled={parsed.length === 0}
                              onClick={() => {
                                const desc = cfDesc.trim() || undefined
                                setCashflowHistory(prev => {
                                  const next: CashflowEvent[] = [
                                    ...prev,
                                    ...parsed.map(({ date, value }) => ({
                                      date,
                                      type: cfType,
                                      amount: value,
                                      description: desc,
                                    })),
                                  ]
                                  next.sort((a, b) => a.date.localeCompare(b.date))
                                  return next
                                })
                                setCfPasteText('')
                                setShowCfPaste(false)
                              }}
                              className="btn-primary text-xs px-4 py-1.5 disabled:opacity-40"
                              style={{ background: parsed.length > 0 ? activeCfType?.color + '22' : undefined, borderColor: parsed.length > 0 ? activeCfType?.color + '55' : undefined, color: parsed.length > 0 ? activeCfType?.color : undefined }}
                            >Importar {parsed.length} rendimento{parsed.length !== 1 ? 's' : ''}</button>
                          </div>
                          {parsed.length > 0 && (
                            <div className="border border-[#1e1e2e] rounded-xl overflow-hidden">
                              <div className="max-h-36 overflow-y-auto">
                                {parsed.map(({ date, value }) => (
                                  <div key={date} className="flex items-center justify-between px-3 py-1.5 border-b border-[#1e1e2e] last:border-0 text-xs">
                                    <span className="text-[#8888aa]">{formatDate(date)}</span>
                                    <span className="font-mono text-[#e8e8f0]">{value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {f.currency}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}

                {cashflowHistory.length === 0 ? (
                  <p className="text-xs text-[#55556a] italic text-center py-4">Nenhum rendimento registrado ainda.</p>
                ) : (
                  <>
                    {/* Summary by type */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {CASHFLOW_EVENT_TYPES.filter(et => cashflowHistory.some(e => e.type === et.value)).map(et => {
                        const total = cashflowHistory.filter(e => e.type === et.value).reduce((s, e) => s + e.amount, 0)
                        return (
                          <div key={et.value} className="px-2.5 py-2 rounded-xl border text-xs" style={{ borderColor: et.color + '30', background: et.color + '08' }}>
                            <p className="text-[10px] truncate" style={{ color: et.color }}>{et.label}</p>
                            <p className="font-semibold v2-num mt-0.5">{total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {f.currency}</p>
                          </div>
                        )
                      })}
                    </div>

                    <div className="border border-[#1e1e2e] rounded-xl overflow-hidden">
                      <div className="max-h-48 overflow-y-auto">
                        {[...cashflowHistory].reverse().map((e, i) => {
                          const et = CASHFLOW_EVENT_TYPES.find(t => t.value === e.type)
                          return (
                            <div key={i} className="flex items-center gap-2 px-3 py-2 border-b border-[#1e1e2e] last:border-0 text-xs">
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: et?.color ?? '#55556a' }} />
                              <span className="text-[#8888aa] w-20 flex-shrink-0">{formatDate(e.date)}</span>
                              <span className="text-[10px] flex-shrink-0" style={{ color: et?.color ?? '#55556a' }}>{et?.label ?? e.type}</span>
                              <span className="flex-1 text-[#55556a] truncate">{e.description ?? ''}</span>
                              <span className="font-mono font-semibold text-[#e8e8f0] flex-shrink-0">
                                {e.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                              <button onClick={() => removeCashflowEvent(cashflowHistory.length - 1 - i)} className="text-[#55556a] hover:text-[#ff4466] flex-shrink-0">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}

                {/* ── Linked bank-statement transactions ── */}
                {linkedTransactions && linkedTransactions.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-[#1e1e2e]" />
                      <span className="text-[10px] uppercase tracking-wider text-[#55556a]">Extrato Bancário Vinculado</span>
                      <div className="h-px flex-1 bg-[#1e1e2e]" />
                    </div>
                    <p className="text-[11px] text-[#8888aa]">
                      Transações do extrato marcadas como rendimento deste investimento. Já incluídas no cálculo de retorno.
                    </p>
                    <div className="border border-[#00d4ff]/20 rounded-xl overflow-hidden">
                      <div className="max-h-48 overflow-y-auto">
                        {[...linkedTransactions].sort((a, b) => b.date.localeCompare(a.date)).map(t => {
                          const et = CASHFLOW_EVENT_TYPES.find(e => e.value === t.cashflowEventType)
                          return (
                            <div key={t.id} className="flex items-center gap-2 px-3 py-2 border-b border-[#1e1e2e] last:border-0 text-xs">
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: et?.color ?? '#00d4ff' }} />
                              <span className="text-[#8888aa] w-20 flex-shrink-0">{formatDate(t.date)}</span>
                              <span className="text-[10px] flex-shrink-0" style={{ color: et?.color ?? '#00d4ff' }}>{et?.label ?? 'Rendimento'}</span>
                              <span className="flex-1 text-[#55556a] truncate">{t.description}</span>
                              <span className="font-mono font-semibold text-[#00d4ff] flex-shrink-0">
                                + {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {t.currency ?? 'BRL'}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <p className="text-[10px] text-[#55556a]">
                      Total: {linkedTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {f.currency}
                      · Para desvincular, edite a transação no Fluxo de Caixa.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {saveError && (
        <div className="px-6 py-3 border-t border-[#1e1e2e] bg-[#ff4466]/10">
          <p className="text-xs font-semibold text-[#ff4466]">Erro ao salvar</p>
          <p className="text-[11px] text-[#ff8898] mt-0.5">{saveError}</p>
        </div>
      )}
      {saveSuccess && !saveError && (
        <div className="px-6 py-3 border-t border-[#1e1e2e] bg-[#00ff88]/10 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,255,136,.2)' }}>
            <span className="text-[#00ff88] text-xs">✓</span>
          </span>
          <p className="text-xs font-semibold text-[#00ff88]">{initial ? 'Alterações salvas!' : 'Investimento adicionado!'}</p>
        </div>
      )}
      <ModalFooter>
        {initial && (
          <button
            className="btn-danger mr-auto"
            disabled={saving}
            onClick={async () => {
              const isPluggy = !!initial.notes?.match(/pluggy:[^\s]+/)
              const msg = isPluggy
                ? `Excluir "${initial.name}"?\n\nEste ativo veio do Open Finance. A exclusão é permanente: ele NÃO retorna em syncs futuros, mesmo que ainda apareça na corretora.`
                : `Excluir "${initial.name}"?`
              if (!confirm(msg)) return
              try {
                await deleteInvestment(initial.id)
                onClose()
              } catch (e) {
                console.error('[InvestmentModal] delete failed', e)
                setSaveError(e instanceof Error ? e.message : 'Falha ao excluir.')
              }
            }}
            title="Excluir investimento (permanente, com tombstone vs Pluggy)"
          >
            <X className="w-4 h-4" /> Excluir
          </button>
        )}
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        {step > 0 && (
          <button className="btn-secondary" onClick={() => setStep(s => Math.max(0, s - 1))}>
            <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button className="btn-primary" onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
            disabled={!canAdvance}>
            Avançar <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button className="btn-primary" onClick={handleSave}
            disabled={saving || !f.name || !resolvedInstitution}>
            {saving ? 'Salvando…' : initial ? 'Salvar Alterações' : 'Adicionar Ativo'}
          </button>
        )}
      </ModalFooter>
    </Modal>
  )
}
