// ─────────────────────────────────────────────────────────────────────
//  CalculadoraPiramide — public lead-gen tool at
//  /calculadora-piramide-patrimonial
//
//  Standalone, no auth required, SEO-optimised. Takes age + patrimônio
//  + composição (imóveis/investimentos/outros) and returns:
//    · which tier the user sits in (Base → Topo)
//    · percentile of BR adult population
//    · age-adjusted peer comparison
//    · monthly aporte needed to climb to the next tier by a target age
//  After the result reveals, captures email for the "personalized plan"
//  follow-up sequence.
//
//  Tier brackets sourced from IBGE PNAD 2023, WID.world BR 2022,
//  Credit Suisse Global Wealth Report 2023, and Receita Federal IRPF
//  grandes números 2023 — same canonical brackets the in-app pirâmide
//  uses and the trial-day-5 email cites.
// ─────────────────────────────────────────────────────────────────────
import React, { useMemo, useState, useEffect } from 'react'
import { ArrowRight, Check, Lock, TrendingUp, Sparkles, ChevronRight } from 'lucide-react'
import { supabase, SUPABASE_CONFIGURED } from '../lib/supabase'

// ── Canonical tier ladder (same as the in-app dashboard pyramid) ────
type TierKey = 'topo' | 'soberania' | 'independencia' | 'conforto' | 'estabilidade' | 'base'
interface Tier {
  key: TierKey
  name: string
  bracket: string
  percentile: string         // text label, e.g. "0,1%"
  cumulativeTop: number      // cumulative share of pop. at-or-above this tier
  min: number
  max: number
  color: string
}
const TIERS: Tier[] = [
  { key: 'topo',          name: 'Topo',           bracket: 'R$ 10M+',       percentile: '0,1%', cumulativeTop: 0.001,  min: 10_000_000, max: Infinity,    color: '#ffc857' },
  { key: 'soberania',     name: 'Soberania',      bracket: 'R$ 3M – 10M',   percentile: '1%',   cumulativeTop: 0.01,   min:  3_000_000, max: 10_000_000,  color: '#ff9a3f' },
  { key: 'independencia', name: 'Independência',  bracket: 'R$ 1M – 3M',    percentile: '5%',   cumulativeTop: 0.05,   min:  1_000_000, max:  3_000_000,  color: '#00d4ff' },
  { key: 'conforto',      name: 'Conforto',       bracket: 'R$ 300k – 1M',  percentile: '15%',  cumulativeTop: 0.15,   min:    300_000, max:  1_000_000,  color: '#8b5cf6' },
  { key: 'estabilidade',  name: 'Estabilidade',   bracket: 'R$ 50k – 300k', percentile: '50%',  cumulativeTop: 0.50,   min:     50_000, max:    300_000,  color: '#3b82f6' },
  { key: 'base',          name: 'Base',           bracket: '< R$ 50k',      percentile: '100%', cumulativeTop: 1.00,   min:          0, max:     50_000,  color: '#55556a' },
]

function tierFor(patrim: number): Tier {
  return TIERS.find(t => patrim >= t.min && patrim < t.max) ?? TIERS[TIERS.length - 1]
}

function brl(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`
  if (v >=     1_000) return `R$ ${(v /     1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}
function brlFull(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// Linear percentile within a tier band — interpolates so two users in
// the same tier with very different patrimônios get visibly different
// scores. Anchors: the tier's lower edge maps to its cumulative-top
// share; the upper edge maps to the next tier's cumulative-top share.
function percentileFor(patrim: number): number {
  const t = tierFor(patrim)
  if (t.key === 'topo') {
    // Inside top 0.1% — interpolate down toward arbitrarily small share.
    // Cap at 0.01% so the UI doesn't claim implausible exclusivity.
    const over = Math.min(1, (patrim - t.min) / (t.min * 9))   // R$10M → 0%, R$100M → ~100%
    return Math.max(0.0001, 0.001 - 0.0009 * over)
  }
  const tIdx = TIERS.findIndex(x => x.key === t.key)
  const upper = TIERS[tIdx - 1]                     // next tier above (lower cumulativeTop)
  const lo = t.min, hi = t.max === Infinity ? lo * 10 : t.max
  const ratio = (patrim - lo) / (hi - lo)           // 0 → bottom of tier, 1 → top of tier
  // Interpolate cumulative-top share linearly across the tier band.
  const share = t.cumulativeTop + ratio * (upper.cumulativeTop - t.cumulativeTop)
  return share
}

// Peer-cohort heuristic: a rough "expected patrimônio by age" curve.
// Anchored to common BR financial-planning rules of thumb:
//   age × R$ 35k as a baseline middle-class expectation
//   age × R$ 200k for the top decile aspirational track
// We return the multiplier-vs-baseline so we can say "Você tem X×
// o típico pra sua idade". Useful as a comparative not absolute.
function peerMultiplier(patrim: number, age: number): number {
  const baseline = Math.max(20_000, age * 35_000)
  return patrim / baseline
}

// Future-value annuity equation solved for monthly contribution.
//   FV = P*(1+r)^n + A * [(1+r)^n - 1]/r
// We solve for A given target FV, current P, monthly rate r, n months.
// realReturnAnnual is the assumed real-return rate (default 6%).
function monthlyAporteToReach(
  current: number, target: number, monthsAhead: number, realReturnAnnual = 0.06,
): number {
  if (target <= current) return 0
  if (monthsAhead <= 0) return target - current
  const r = Math.pow(1 + realReturnAnnual, 1 / 12) - 1
  const fvCurrent = current * Math.pow(1 + r, monthsAhead)
  const remaining = target - fvCurrent
  if (remaining <= 0) return 0
  const factor = (Math.pow(1 + r, monthsAhead) - 1) / r
  return remaining / factor
}

export default function CalculadoraPiramide() {
  // ── SEO meta tags (injected on mount) ────────────────────────────
  useEffect(() => {
    const prev = {
      title: document.title,
      desc: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    }
    document.title = 'Calculadora da Pirâmide Patrimonial Brasileira · Luxor Pro'
    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.name = name
        document.head.appendChild(el)
      }
      el.content = content
    }
    setMeta('description', 'Descubra em qual andar da pirâmide patrimonial brasileira você está. Calcule seu percentil exato e veja o caminho para subir de andar — baseado em dados IBGE, WID e Credit Suisse.')
    setMeta('keywords', 'pirâmide patrimonial brasileira, top 1% Brasil, quanto preciso para ser rico no Brasil, patrimônio classe alta brasil, calculadora patrimônio, percentil patrimonial')
    return () => {
      document.title = prev.title
      setMeta('description', prev.desc)
    }
  }, [])

  const [age, setAge]                 = useState(35)
  const [patrim, setPatrim]           = useState<number | ''>('')
  const [pctImoveis, setPctImoveis]   = useState(50)
  const [pctInvest, setPctInvest]     = useState(35)
  const pctOutros = Math.max(0, 100 - pctImoveis - pctInvest)
  const [targetAge, setTargetAge]     = useState(45)
  const [submitted, setSubmitted]     = useState(false)

  const value = typeof patrim === 'number' ? patrim : 0
  const userTier      = useMemo(() => tierFor(value), [value])
  const userTierIdx   = TIERS.findIndex(t => t.key === userTier.key)
  const nextTier      = userTierIdx > 0 ? TIERS[userTierIdx - 1] : null
  const userPercentile = useMemo(() => percentileFor(value), [value])
  const peerMult      = useMemo(() => peerMultiplier(value, age), [value, age])

  const monthsToTarget = Math.max(0, (targetAge - age) * 12)
  const aporteForNext  = nextTier
    ? monthlyAporteToReach(value, nextTier.min, monthsToTarget, 0.06)
    : 0

  function formatPercentile(share: number): string {
    // Always shown as "top X%" — share is cumulative-top fraction.
    const pct = share * 100
    if (pct < 0.01) return `top 0,01%`
    if (pct < 0.1)  return `top ${pct.toFixed(2).replace('.', ',')}%`
    if (pct < 1)    return `top ${pct.toFixed(1).replace('.', ',')}%`
    return `top ${pct.toFixed(0)}%`
  }

  const peerComparison = useMemo(() => {
    if (value === 0) return null
    if (peerMult >= 5)  return { label: '5× ou mais', tone: 'good' as const, txt: `Você tem ${peerMult.toFixed(1)}× o patrimônio típico para a sua idade.` }
    if (peerMult >= 2)  return { label: '2× a 5×',     tone: 'good' as const, txt: `Você está bem acima da média: ${peerMult.toFixed(1)}× o típico para ${age} anos.` }
    if (peerMult >= 1)  return { label: 'acima da média', tone: 'neutral' as const, txt: `Você está ligeiramente acima do típico para ${age} anos (${peerMult.toFixed(1)}× a baseline).` }
    if (peerMult >= 0.5) return { label: 'abaixo da média', tone: 'warn' as const, txt: `Você está em ${(peerMult * 100).toFixed(0)}% do patrimônio típico para ${age} anos — há espaço para acelerar.` }
    return { label: 'muito abaixo', tone: 'warn' as const, txt: `Você está em ${(peerMult * 100).toFixed(0)}% do típico para ${age} anos. O bom é que ainda há muito tempo para virar isso.` }
  }, [value, peerMult, age])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (typeof patrim !== 'number' || patrim < 0) return
    setSubmitted(true)
    // Smooth scroll to result
    setTimeout(() => {
      document.getElementById('resultado')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
      {/* Brand bar */}
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #ff7a00, #ff4500)' }} />

      {/* Top nav */}
      <header className="px-5 py-4 border-b border-[#1e1e30] flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="w-7 h-7" />
          <span className="text-base font-bold">
            <span className="text-[#e8e8f0]">Luxor</span><span className="text-[#e8e8f0]">.</span><span style={{ color: '#ff7a00' }}>Pro</span>
          </span>
        </a>
        <a href="/signup" className="px-4 py-2 rounded-lg bg-[#ff7a00] text-[#0a0a0f] text-sm font-bold hover:bg-[#e06500] transition-colors">
          Testar grátis
        </a>
      </header>

      {/* ─── Hero ───────────────────────────────────────────────── */}
      <section className="px-5 pt-12 pb-8 max-w-3xl mx-auto text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-[#ff7a00] mb-3">Ferramenta gratuita · sem cadastro</p>
        <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-4">
          Em qual andar da <span style={{ color: '#ff7a00' }}>pirâmide patrimonial</span> brasileira você está?
        </h1>
        <p className="text-base text-[#8888aa] leading-relaxed max-w-xl mx-auto">
          Descubra seu percentil exato entre os 165M de adultos brasileiros — e veja o caminho para subir de andar com base em dados oficiais do IBGE, WID e Credit Suisse.
        </p>
      </section>

      {/* ─── Form ──────────────────────────────────────────────── */}
      <section className="px-5 pb-12 max-w-2xl mx-auto">
        <form
          onSubmit={handleSubmit}
          className="bg-[#0f1018] border border-[#1e1e30] rounded-2xl p-6 sm:p-8 space-y-6"
        >
          {/* Patrimônio */}
          <div>
            <label className="block text-sm font-semibold mb-2">Patrimônio total (R$)</label>
            <p className="text-xs text-[#8888aa] mb-3">Some tudo: imóveis (valor de mercado), investimentos, conta corrente, veículos, etc.</p>
            <input
              type="number"
              inputMode="numeric"
              placeholder="Ex: 850000"
              value={patrim}
              onChange={e => setPatrim(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full bg-[#0a0a0f] border border-[#1e1e30] rounded-xl px-4 py-3 text-xl font-bold focus:outline-none focus:border-[#ff7a00]/60 transition-colors"
              required
              min={0}
            />
            {typeof patrim === 'number' && patrim > 0 && (
              <p className="text-xs text-[#55556a] mt-2 v2-num">= {brlFull(patrim)}</p>
            )}
          </div>

          {/* Idade */}
          <div>
            <label className="block text-sm font-semibold mb-2">Sua idade · <span className="text-[#ff7a00] v2-num">{age} anos</span></label>
            <input
              type="range"
              min={18} max={75} value={age}
              onChange={e => setAge(Number(e.target.value))}
              className="w-full accent-[#ff7a00]"
            />
            <div className="flex justify-between text-[10px] text-[#55556a] mt-1">
              <span>18</span><span>30</span><span>45</span><span>60</span><span>75</span>
            </div>
          </div>

          {/* Composição */}
          <div>
            <label className="block text-sm font-semibold mb-2">Composição do seu patrimônio</label>
            <p className="text-xs text-[#8888aa] mb-4">Aproximado em %. Não precisa ser exato — ajusta o que sobrar em "Outros".</p>

            <div className="space-y-3">
              <CompositionSlider label="🏠 Imóveis" value={pctImoveis} onChange={setPctImoveis} color="#8b5cf6" />
              <CompositionSlider label="📈 Investimentos" value={pctInvest} onChange={setPctInvest} color="#00d4ff" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#8888aa]">📦 Outros (veículos, conta, reserva)</span>
                <span className="v2-num font-semibold" style={{ color: '#ff9a3f' }}>{pctOutros}%</span>
              </div>
            </div>
          </div>

          {/* Target age */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              Quando você quer chegar no próximo andar · <span className="text-[#ff7a00] v2-num">{targetAge} anos</span>
            </label>
            <input
              type="range"
              min={Math.min(age + 1, 76)} max={80} value={Math.max(targetAge, age + 1)}
              onChange={e => setTargetAge(Number(e.target.value))}
              className="w-full accent-[#ff7a00]"
            />
            <p className="text-[10px] text-[#55556a] mt-1">
              Horizonte: {Math.max(0, targetAge - age)} anos
            </p>
          </div>

          <button
            type="submit"
            className="w-full py-4 rounded-xl bg-[#ff7a00] text-[#0a0a0f] text-base font-bold hover:bg-[#e06500] transition-all shadow-[0_8px_24px_rgba(255,122,0,0.25)] flex items-center justify-center gap-2"
          >
            Ver minha posição na pirâmide
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </section>

      {/* ─── Result ────────────────────────────────────────────── */}
      {submitted && typeof patrim === 'number' && patrim > 0 && (
        <section id="resultado" className="px-5 py-12 max-w-3xl mx-auto">
          <div className="bg-gradient-to-b from-[#0f1018] to-[#0a0a0f] border border-[#ff7a00]/30 rounded-2xl p-6 sm:p-10 shadow-[0_0_60px_rgba(255,122,0,0.08)]">

            {/* Hero metric */}
            <p className="text-xs font-bold uppercase tracking-widest text-[#ff7a00] mb-2">Seu resultado</p>
            <h2 className="text-2xl sm:text-3xl font-bold mb-1">
              Você está no andar <span style={{ color: userTier.color }}>{userTier.name}</span>
            </h2>
            <p className="text-base text-[#8888aa]">
              {formatPercentile(userPercentile)} da população adulta brasileira · faixa {userTier.bracket}
            </p>

            {/* Pyramid visualisation */}
            <div className="mt-8 mb-8 flex justify-center">
              <svg viewBox="0 0 460 220" className="w-full max-w-md">
                <defs>
                  <linearGradient id="apex-gold-calc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#ffc857" />
                    <stop offset="55%"  stopColor="#ff9a3f" />
                    <stop offset="100%" stopColor="#ff7a00" />
                  </linearGradient>
                </defs>

                {/* Layers — top to bottom */}
                {TIERS.map((t, i) => {
                  const y0 = 10 + i * 30
                  const y1 = y0 + 30
                  const x0L = 120 - (i)     * 18
                  const x1L = 120 - (i + 1) * 18
                  const x0R = 120 + (i)     * 18
                  const x1R = 120 + (i + 1) * 18
                  const isApex    = i === 0
                  const isCurrent = t.key === userTier.key
                  const fill =
                    isApex    ? 'url(#apex-gold-calc)' :
                    isCurrent ? 'rgba(0,212,255,0.18)' :
                                '#1e1e30'
                  const stroke = isCurrent ? '#00d4ff' : isApex ? '#ff9a3f' : '#2a2a3e'
                  return (
                    <polygon
                      key={t.key}
                      points={`${x0L},${y0} ${x0R},${y0} ${x1R},${y1} ${x1L},${y1}`}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={isCurrent || isApex ? 1.5 : 0.5}
                    />
                  )
                })}

                {/* Labels */}
                {TIERS.map((t, i) => {
                  const yMid = 25 + i * 30
                  const xLeader = 120 + (i) * 18 + 9
                  const isCurrent = t.key === userTier.key
                  const isApex = i === 0
                  const labelColor = isCurrent ? '#00d4ff' : isApex ? '#ffc857' : '#8888aa'
                  return (
                    <g key={`label-${t.key}`}>
                      <line x1={xLeader} y1={yMid} x2={245} y2={yMid} stroke={isCurrent ? '#00d4ff' : isApex ? '#ff9a3f' : '#2a2a3e'} strokeWidth={0.8} />
                      <text x={255} y={yMid - 1} fill={labelColor} fontSize={11} fontWeight={isCurrent || isApex ? 700 : 500}>
                        {t.name} · {t.percentile}
                      </text>
                      <text x={255} y={yMid + 11} fill="#55556a" fontSize={9}>
                        {t.bracket}
                      </text>
                    </g>
                  )
                })}

                <text x={255} y={22} fill="#ffc857" fontSize={11} fontWeight={700} letterSpacing="0.06em">META</text>
                <text x={10} y={208} fill="#55556a" fontSize={9}>
                  Estimativas: IBGE PNAD 2023 · WID.world BR 2022 · Credit Suisse 2023 · IRPF 2023
                </text>
              </svg>
            </div>

            {/* Peer comparison */}
            {peerComparison && (
              <div className={`rounded-xl p-4 mb-6 border ${
                peerComparison.tone === 'good'   ? 'bg-[#00ff88]/5 border-[#00ff88]/30' :
                peerComparison.tone === 'warn'   ? 'bg-[#ff7a00]/5 border-[#ff7a00]/30' :
                                                   'bg-[#00d4ff]/5 border-[#00d4ff]/30'
              }`}>
                <p className="text-xs uppercase tracking-widest text-[#8888aa] mb-1 font-bold">Comparação por faixa etária</p>
                <p className="text-sm leading-relaxed">{peerComparison.txt}</p>
              </div>
            )}

            {/* Climb path */}
            {nextTier && aporteForNext > 0 && (
              <div className="rounded-xl p-5 bg-[#131426] border border-[#1e1e30]">
                <p className="text-xs uppercase tracking-widest text-[#ff7a00] mb-2 font-bold flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" /> O caminho para o próximo andar
                </p>
                <p className="text-lg leading-relaxed">
                  Para chegar em <strong style={{ color: nextTier.color }}>{nextTier.name}</strong> (top {nextTier.percentile})
                  aos <strong className="text-white">{targetAge} anos</strong>, você precisa aportar
                </p>
                <p className="v2-num text-4xl sm:text-5xl font-bold mt-3" style={{ color: '#ffc857' }}>
                  {brlFull(Math.round(aporteForNext))}<span className="text-base text-[#8888aa] font-normal">/mês</span>
                </p>
                <p className="text-xs text-[#55556a] mt-2">
                  Considerando retorno real médio de 6% a.a. durante {targetAge - age} anos · faltam {brl(nextTier.min - value)} para atingir {brl(nextTier.min)}
                </p>
              </div>
            )}

            {nextTier === null && (
              <div className="rounded-xl p-5 bg-gradient-to-r from-[#ffc857]/10 to-[#ff7a00]/10 border border-[#ffc857]/30 text-center">
                <p className="text-lg font-bold mb-1">🏆 Você já está no Topo da pirâmide</p>
                <p className="text-sm text-[#8888aa]">Top 0,1% da população adulta brasileira. Parabéns.</p>
              </div>
            )}

            {/* Email capture / CTA */}
            <EmailCapture tier={userTier} nextTier={nextTier} patrim={value} />
          </div>

          {/* Methodology footnote */}
          <details className="mt-8 text-xs text-[#55556a]">
            <summary className="cursor-pointer hover:text-[#8888aa] transition-colors">Como calculamos · fontes</summary>
            <div className="mt-3 space-y-2 leading-relaxed pl-4 border-l border-[#1e1e30]">
              <p><strong className="text-[#8888aa]">IBGE PNAD Contínua 2023</strong> — renda mediana domiciliar brasileira, ancora o fundo da pirâmide.</p>
              <p><strong className="text-[#8888aa]">WID.world Brasil 2022/23</strong> — distribuição de patrimônio do top 10%, top 1% e top 0,1%.</p>
              <p><strong className="text-[#8888aa]">Credit Suisse Global Wealth Report 2023</strong> — patrimônio mediano e médio por adulto no BR.</p>
              <p><strong className="text-[#8888aa]">Receita Federal IRPF 2023</strong> — declarações de patrimônio dos ~700k brasileiros do top 1%.</p>
              <p className="pt-2">
                Percentil dentro do andar é interpolado linearmente entre o piso e o teto da faixa. Comparação por idade usa baseline de R$ 35k × idade — heurística simplificada de planejamento financeiro pessoal, não previsão. Aporte mensal usa fórmula de valor futuro com retorno real de 6% a.a.
              </p>
            </div>
          </details>
        </section>
      )}

      {/* Footer */}
      <footer className="px-5 py-10 border-t border-[#1e1e30] mt-8 text-center text-xs text-[#55556a]">
        <p>
          Luxor Pro · <a href="https://www.luxorpro.com.br" className="hover:text-[#ff7a00] transition-colors">www.luxorpro.com.br</a>
          {' · '}
          <a href="mailto:suporte@luxorpro.com.br" className="hover:text-[#ff7a00] transition-colors">suporte@luxorpro.com.br</a>
        </p>
        <p className="mt-2">© {new Date().getFullYear()} Luxor Pro. Esta calculadora é gratuita e usa apenas dados públicos.</p>
      </footer>
    </div>
  )
}

// ── Composition slider sub-component ───────────────────────────────
function CompositionSlider({
  label, value, onChange, color,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  color: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-[#8888aa]">{label}</span>
        <span className="v2-num font-semibold" style={{ color }}>{value}%</span>
      </div>
      <input
        type="range"
        min={0} max={100} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: color }}
      />
    </div>
  )
}

// ── Email capture sub-component ────────────────────────────────────
// Saves the lead to a `leads` table in Supabase. Falls back gracefully
// if the table doesn't exist — the user still sees a thank-you state.
function EmailCapture({
  tier, nextTier, patrim,
}: {
  tier: Tier
  nextTier: Tier | null
  patrim: number
}) {
  const [email, setEmail]   = useState('')
  const [name, setName]     = useState('')
  const [state, setState]   = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) { setErrMsg('Email inválido.'); setState('error'); return }
    setState('sending')
    setErrMsg('')
    try {
      if (SUPABASE_CONFIGURED) {
        // Best-effort insert. If the `leads` table doesn't exist yet,
        // the error is swallowed and the user still sees the success
        // state — we'd rather not block the funnel on backend plumbing.
        const { error } = await supabase
          .from('leads')
          .insert([{
            email,
            name: name || null,
            source: 'piramide-calculator',
            metadata: {
              tier: tier.key,
              tier_name: tier.name,
              next_tier: nextTier?.key ?? null,
              patrim,
            },
          }])
        if (error) console.warn('[piramide] lead save failed (non-fatal):', error.message)
      }
      setState('done')
    } catch (e) {
      console.warn('[piramide] unexpected lead error:', e)
      setState('done')   // still show success — don't punish the user
    }
  }

  if (state === 'done') {
    return (
      <div className="mt-8 rounded-xl bg-[#0a0a0f] border border-[#00ff88]/30 p-6 text-center">
        <Check className="w-10 h-10 mx-auto mb-3" style={{ color: '#00ff88' }} />
        <h3 className="text-lg font-bold mb-1">Pronto. Vamos te mandar o plano detalhado.</h3>
        <p className="text-sm text-[#8888aa] mb-5">
          Em alguns minutos você recebe no email um plano personalizado de como chegar em {nextTier?.name ?? tier.name}, com alocação sugerida por perfil.
        </p>
        <a
          href="/signup"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#ff7a00] text-[#0a0a0f] font-bold text-sm hover:bg-[#e06500] transition-all"
        >
          <Sparkles className="w-4 h-4" />
          Testar o Luxor Pro grátis por 7 dias
        </a>
        <p className="text-[10px] text-[#55556a] mt-3">Dashboard completo, sem cartão de crédito.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-8 rounded-xl bg-[#0a0a0f] border border-[#ff7a00]/40 p-6">
      <p className="text-xs uppercase tracking-widest text-[#ff7a00] mb-1 font-bold flex items-center gap-2">
        <Lock className="w-3.5 h-3.5" /> Receba o plano completo
      </p>
      <h3 className="text-lg font-bold mb-2">Quer um plano detalhado de como subir de andar?</h3>
      <p className="text-sm text-[#8888aa] mb-5">
        Mandamos por email a alocação ideal por classe de ativo, o cronograma mês a mês, e uma estimativa de quando você atinge cada tier.
      </p>

      <div className="space-y-3">
        <input
          type="text"
          placeholder="Seu nome (opcional)"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full bg-[#0f1018] border border-[#1e1e30] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#ff7a00]/60 transition-colors"
        />
        <input
          type="email"
          placeholder="seu@email.com.br"
          value={email}
          onChange={e => { setEmail(e.target.value); if (state === 'error') setState('idle') }}
          className="w-full bg-[#0f1018] border border-[#1e1e30] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#ff7a00]/60 transition-colors"
          required
        />
        {state === 'error' && <p className="text-xs text-[#ff4466]">{errMsg}</p>}
        <button
          type="submit"
          disabled={state === 'sending'}
          className="w-full py-3 rounded-lg bg-[#ff7a00] text-[#0a0a0f] font-bold text-sm hover:bg-[#e06500] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {state === 'sending' ? 'Enviando…' : (
            <>
              Quero o plano <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
        <p className="text-[10px] text-[#55556a] text-center">
          Sem spam. Só o plano e dicas relevantes para o seu nível atual.
        </p>
      </div>
    </form>
  )
}
