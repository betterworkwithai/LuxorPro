import React, { useState, useEffect } from 'react'
import { Globe, Building2, Home, ChevronDown, ChevronRight, Plus, X } from 'lucide-react'
import { Modal, ModalFooter } from '../ui/Modal'
import { useStore } from '../../store/useStore'
import { todayISO, formatDate } from '../../lib/formatters'
import type { Investment, AssetLocation, TaxTreatment, PricePoint } from '../../lib/types'
import { LIQUIDITY_OPTIONS, BENCHMARK_OPTIONS, RISK_LABELS } from '../../lib/types'
import { LOCAL_CLASSES, INTL_CLASSES } from '../../lib/suitability'

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
  { value: 'taxable',      label: 'Tributável',      desc: 'CDB, LF, COE, etc.',                  color: '#ff4466' },
  { value: 'tax-deferred', label: 'Imposto Diferido', desc: 'VGBL, PGBL, etc.',                  color: '#f59e0b' },
  { value: 'tax-exempt',   label: 'Isento de IR',     desc: 'LCI / LCA / CRI / CRA / Infraestrutura', color: '#00ff88' },
]

const LOCATION_OPTIONS: { value: AssetLocation; label: string; icon: typeof Building2; color: string }[] = [
  { value: 'onshore',     label: 'Onshore (Brasil)',         icon: Building2, color: '#00d4ff' },
  { value: 'offshore',    label: 'Offshore (Internacional)', icon: Globe,     color: '#ff7a00' },
  { value: 'physical-re', label: 'Imóvel Físico / Empresa',  icon: Home,      color: '#8b5cf6' },
]

const CLASS_CUSTOM = '__custom__'
const INST_CUSTOM  = '__inst_custom__'

const FIXED_INCOME_CLASSES = [
  'Pós-Fixado', 'Prefixado', 'IPCA Juro Real (Curto)', 'IPCA Juro Real (Longo)',
  'Renda Fixa Ativo', 'Cash/CD', 'US Treasury', 'US Investment Grade',
  'Developed Govt/Corp', 'US High Yield', 'EM Govt/Corp', 'Private Credit',
]
const EQUITY_CLASSES = [
  'RV Ibovespa', 'RV S&P (BRL)', 'RV US', 'RV Europe', 'RV Asia', 'RV Emerging',
]
const REAL_ESTATE_CLASSES = [
  'Alt. FII (Tijolo)', 'Private Real Estate',
  'Imóvel Residencial', 'Imóvel Comercial', 'Terreno', 'Outro Imóvel Físico',
]

// ─── Form state ──────────────────────────────
const blank = () => ({
  // step 1
  location: 'onshore' as AssetLocation,
  currency: 'BRL' as 'BRL' | 'USD' | 'EUR',
  assetClass: 'Pós-Fixado',
  customClass: '',
  taxTreatment: 'taxable' as TaxTreatment,
  // step 2
  name: '', ticker: '',
  institutionSelect: '', institutionCustom: '',
  quantity: '', avgCost: '', currentPrice: '',
  purchaseDate: todayISO(),
  benchmark: '',
  // step 3
  maturityDate: '', interestRate: '',
  liquidity: '', riskLevel: '' as '' | 1 | 2 | 3 | 4 | 5,
  managementFee: '', performanceFee: '',
  dividendsReceived: '', interestReceived: '',
  sector: '', country: '', issuer: '',
  notes: '',
})

const fromInvestment = (i: Investment, allInstitutions: string[]) => {
  const isPredefined = ALL_PREDEFINED_CLASSES.includes(i.assetClass)
  const isKnownInst  = allInstitutions.includes(i.institution)
  return {
    location:          i.location,
    currency:          i.currency,
    assetClass:        isPredefined ? i.assetClass : CLASS_CUSTOM,
    customClass:       isPredefined ? '' : i.assetClass,
    taxTreatment:      i.taxTreatment ?? 'taxable',
    name:              i.name,
    ticker:            i.ticker ?? '',
    institutionSelect: isKnownInst ? i.institution : (i.institution ? INST_CUSTOM : ''),
    institutionCustom: isKnownInst ? '' : (i.institution ?? ''),
    quantity:          String(i.quantity),
    avgCost:           String(i.avgCost),
    currentPrice:      String(i.currentPrice),
    purchaseDate:      i.purchaseDate,
    benchmark:         i.benchmark ?? '',
    maturityDate:      i.maturityDate ?? '',
    interestRate:      String(i.interestRate ?? ''),
    liquidity:         i.liquidity ?? '',
    riskLevel:         (i.riskLevel ?? '') as '' | 1 | 2 | 3 | 4 | 5,
    managementFee:     String(i.managementFee ?? ''),
    performanceFee:    String(i.performanceFee ?? ''),
    dividendsReceived: String(i.dividendsReceived ?? ''),
    interestReceived:  String(i.interestReceived ?? ''),
    sector:            i.sector ?? '',
    country:           i.country ?? '',
    issuer:            i.issuer ?? '',
    notes:             i.notes ?? '',
  }
}

interface Props {
  open: boolean
  onClose: () => void
  initial?: Investment
}

const STEPS = [
  { key: 'classify', label: 'Tipo & Classe' },
  { key: 'core',     label: 'Posição' },
  { key: 'detail',   label: 'Detalhes' },
  { key: 'history',  label: 'Histórico' },
] as const

export function InvestmentModal({ open, onClose, initial }: Props) {
  const { addInvestment, updateInvestment, settings, saveCustomInstitution } = useStore()

  const allInstitutions = Array.from(new Set([
    ...PREDEFINED_INSTITUTIONS,
    ...(settings.customInstitutions ?? []),
  ])).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const [f, setF]               = useState(() => initial ? fromInvestment(initial, allInstitutions) : blank())
  const [step, setStep]         = useState(0)
  const [saving, setSaving]     = useState(false)
  const [history, setHistory]   = useState<PricePoint[]>(initial?.priceHistory ?? [])
  const [hpDate, setHpDate]     = useState('')
  const [hpPrice, setHpPrice]   = useState('')

  useEffect(() => {
    if (!open) return
    setF(initial ? fromInvestment(initial, allInstitutions) : blank())
    setHistory(initial?.priceHistory ?? [])
    setStep(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id])

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

  const isFixedIncome = FIXED_INCOME_CLASSES.includes(resolvedClass)
  const isEquity      = EQUITY_CLASSES.includes(resolvedClass)
  const isRealEstate  = REAL_ESTATE_CLASSES.includes(resolvedClass) || f.location === 'physical-re'

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
  const removeHistoryPoint = (date: string) => {
    setHistory(prev => prev.filter(p => p.date !== date))
  }

  const canAdvance =
    step === 0 ? (f.assetClass !== CLASS_CUSTOM || f.customClass.trim().length > 0) :
    step === 1 ? Boolean(f.name && f.quantity && f.avgCost && f.currentPrice && resolvedInstitution) :
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
      maturityDate:      f.maturityDate && f.maturityDate !== 'none' ? f.maturityDate : undefined,
      interestRate:      f.interestRate ? parseFloat(f.interestRate) : undefined,
      taxTreatment:      f.taxTreatment,
      dividendsReceived: f.dividendsReceived ? parseFloat(f.dividendsReceived) : undefined,
      interestReceived:  f.interestReceived  ? parseFloat(f.interestReceived)  : undefined,
      benchmark:         f.benchmark || undefined,
      notes:             f.notes || undefined,
      liquidity:         f.liquidity || undefined,
      managementFee:     f.managementFee  !== '' ? parseFloat(f.managementFee  as string) : undefined,
      performanceFee:    f.performanceFee !== '' ? parseFloat(f.performanceFee as string) : undefined,
      riskLevel:         f.riskLevel !== '' ? (f.riskLevel as 1 | 2 | 3 | 4 | 5) : undefined,
      sector:            f.sector  || undefined,
      country:           f.country || undefined,
      issuer:            f.issuer  || undefined,
      priceHistory:      history.length > 0 ? history : undefined,
    }
    if (initial) await updateInvestment({ ...payload, id: initial.id })
    else         await addInvestment(payload)
    setSaving(false)
    onClose()
  }

  const stepDot = (idx: number) => (
    <div key={idx} className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setStep(idx)}
        className="flex items-center gap-2 rounded-full transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/40 group"
      >
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border transition-all ${
          idx === step
            ? 'bg-[#ff7a00] border-[#ff7a00] text-[#0a0a0f]'
            : idx < step
              ? 'bg-[#ff7a00]/15 border-[#ff7a00]/40 text-[#ff7a00] group-hover:bg-[#ff7a00]/25'
              : 'bg-[#16161f] border-[#1e1e2e] text-[#55556a] group-hover:border-[#ff7a00]/40 group-hover:text-[#e8e8f0]'
        }`}>
          {idx + 1}
        </div>
        <span className={`text-xs hidden sm:block ${idx === step ? 'text-[#e8e8f0] font-medium' : 'text-[#55556a] group-hover:text-[#e8e8f0]'}`}>
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

        {/* ─── Step 1: Classify ─── */}
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
                      style={active ? {
                        background: opt.color + '15',
                        borderColor: opt.color + '55',
                        color: opt.color,
                      } : { background: '#16161f', borderColor: '#1e1e2e', color: '#55556a' }}>
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
                      style={active ? {
                        background: opt.color + '15',
                        borderColor: opt.color + '55',
                        color: opt.color,
                      } : { background: '#16161f', borderColor: '#1e1e2e', color: '#55556a' }}>
                      <span className="font-semibold block">{opt.label}</span>
                      <span className="text-[10px] opacity-70 mt-0.5 block">{opt.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ─── Step 2: Core Position ─── */}
        {step === 1 && (
          <>
            <div className="col-span-2">
              <label className="text-xs text-[#8888aa] mb-1.5 block">Nome / Descrição</label>
              <input className="input-dark"
                placeholder={isRealEstate ? 'Ex: Apto Pinheiros, Sala Comercial…' : 'Ex: Tesouro IPCA+ 2035, AAPL…'}
                value={f.name} onChange={e => upd('name', e.target.value)} />
            </div>

            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">
                {isRealEstate ? 'Endereço / Código' : 'Ticker (opcional)'}
              </label>
              <input className="input-dark" value={f.ticker} onChange={e => upd('ticker', e.target.value)} />
            </div>

            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Instituição / Custodiante</label>
              <select className="input-dark" value={f.institutionSelect} onChange={e => upd('institutionSelect', e.target.value)}>
                <option value="">Selecionar…</option>
                {allInstitutions.map(i => <option key={i} value={i}>{i}</option>)}
                <option value={INST_CUSTOM}>Personalizado…</option>
              </select>
            </div>

            {f.institutionSelect === INST_CUSTOM && (
              <div className="col-span-2">
                <label className="text-xs text-[#8888aa] mb-1.5 block">Nome da Instituição</label>
                <input className="input-dark" value={f.institutionCustom}
                  onChange={e => upd('institutionCustom', e.target.value)} />
              </div>
            )}

            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">
                {isRealEstate ? 'Cotas / Participação' : 'Quantidade'}
              </label>
              <input className="input-dark" type="number" placeholder="1"
                value={f.quantity} onChange={e => upd('quantity', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">
                {isRealEstate ? 'Custo Total Aquisição' : 'Preço Médio (Total Investido)'}
              </label>
              <input className="input-dark" type="number"
                value={f.avgCost} onChange={e => upd('avgCost', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">
                {isRealEstate ? 'Valor de Mercado Atual' : 'Preço Atual (Valor de Mercado)'}
              </label>
              <input className="input-dark" type="number"
                value={f.currentPrice} onChange={e => upd('currentPrice', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Data de Compra</label>
              <input type="date" className="input-dark" value={f.purchaseDate}
                onChange={e => upd('purchaseDate', e.target.value)} />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-[#8888aa] mb-1.5 block">Benchmark Personalizado</label>
              <select className="input-dark" value={f.benchmark} onChange={e => upd('benchmark', e.target.value)}>
                <option value="">Nenhum</option>
                {BENCHMARK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </>
        )}

        {/* ─── Step 3: Specifics ─── */}
        {step === 2 && (
          <>
            {isFixedIncome && (
              <>
                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">Taxa (% a.a.)</label>
                  <input className="input-dark" type="number" placeholder="14.4"
                    value={f.interestRate} onChange={e => upd('interestRate', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">Vencimento</label>
                  <input type="date" className="input-dark" value={f.maturityDate}
                    disabled={f.maturityDate === 'none'}
                    onChange={e => upd('maturityDate', e.target.value)} />
                  <label className="flex items-center gap-2 mt-1.5 text-[11px] text-[#8888aa] cursor-pointer">
                    <input type="checkbox" checked={f.maturityDate === 'none'}
                      onChange={e => upd('maturityDate', e.target.checked ? 'none' : '')} />
                    Sem Vencimento
                  </label>
                </div>
              </>
            )}

            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Liquidez (D+)</label>
              <select className="input-dark" value={f.liquidity} onChange={e => upd('liquidity', e.target.value)}>
                <option value="">Selecionar…</option>
                {LIQUIDITY_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Taxa de Administração / Custódia (% a.a.)</label>
              <input className="input-dark" type="number" step="0.01" placeholder="0.50"
                value={f.managementFee} onChange={e => upd('managementFee', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Taxa de Performance (%)</label>
              <input className="input-dark" type="number" step="0.1" placeholder="20"
                value={f.performanceFee} onChange={e => upd('performanceFee', e.target.value)} />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-[#8888aa] mb-1.5 block">Risco do Ativo</label>
              <div className="flex gap-2">
                {(() => {
                  const RISK_COLORS_LOCAL: Record<number, string> = {
                    1: '#60a5fa', 2: '#84cc16', 3: '#eab308', 4: '#f97316', 5: '#ef4444',
                  }
                  return ([1, 2, 3, 4, 5] as const).map(level => {
                    const c = RISK_COLORS_LOCAL[level]
                    const active = f.riskLevel === level
                    return (
                      <button key={level} type="button"
                        onClick={() => setF(p => ({ ...p, riskLevel: p.riskLevel === level ? '' : level }))}
                        className="flex-1 py-2 rounded-xl text-[10px] font-medium border transition-all"
                        style={active ? {
                          background: c + '22',
                          borderColor: c + '88',
                          color: c,
                        } : { background: '#16161f', borderColor: '#1e1e2e', color: '#55556a' }}>
                        <span className="block font-semibold leading-tight">Risco</span>
                        <span className="block leading-tight">{RISK_LABELS[level]}</span>
                      </button>
                    )
                  })
                })()}
              </div>
            </div>

            {(isEquity || isRealEstate) && (
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">
                  {isRealEstate ? 'Aluguel Recebido (total)' : 'Dividendos Recebidos'}
                </label>
                <input className="input-dark" type="number"
                  value={f.dividendsReceived} onChange={e => upd('dividendsReceived', e.target.value)} />
              </div>
            )}
            {isFixedIncome && (
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">Cupons Recebidos</label>
                <input className="input-dark" type="number"
                  value={f.interestReceived} onChange={e => upd('interestReceived', e.target.value)} />
              </div>
            )}

            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Emissor</label>
              <input className="input-dark" value={f.issuer} onChange={e => upd('issuer', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">País</label>
              <input className="input-dark" value={f.country} onChange={e => upd('country', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-[#8888aa] mb-1.5 block">Setor</label>
              <input className="input-dark" value={f.sector} onChange={e => upd('sector', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-[#8888aa] mb-1.5 block">Observações</label>
              <input className="input-dark" value={f.notes} onChange={e => upd('notes', e.target.value)} />
            </div>
          </>
        )}

        {/* ─── Step 4: Price History ─── */}
        {step === 3 && (
          <div className="col-span-2 space-y-4">
            <div className="p-3 bg-[#ff7a00]/5 border border-[#ff7a00]/20 rounded-xl">
              <p className="text-xs text-[#ff7a00] font-medium mb-1">Histórico de Preços (opcional)</p>
              <p className="text-[11px] text-[#8888aa]">
                Adicione pontos históricos para que os gráficos de performance (1M, 6M, YTD, 1Y, ALL) e o cálculo de Time-Weighted Return reflitam dados reais.
              </p>
            </div>

            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">Data</label>
                <input type="date" className="input-dark" value={hpDate} onChange={e => setHpDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">Preço ({f.currency})</label>
                <input type="number" className="input-dark" value={hpPrice} onChange={e => setHpPrice(e.target.value)} />
              </div>
              <button onClick={addHistoryPoint}
                disabled={!hpDate || !hpPrice}
                className="btn-primary h-[38px]">
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {history.length === 0 ? (
              <p className="text-xs text-[#55556a] italic text-center py-6">
                Nenhum ponto histórico ainda.
              </p>
            ) : (
              <div className="border border-[#1e1e2e] rounded-xl overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  {history.map(p => (
                    <div key={p.date} className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e2e] last:border-0 text-xs">
                      <span className="text-[#8888aa]">{formatDate(p.date)}</span>
                      <span className="text-[#e8e8f0] font-mono">{p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      <button onClick={() => removeHistoryPoint(p.date)}
                        className="text-[#55556a] hover:text-[#ff4466]">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ModalFooter>
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
