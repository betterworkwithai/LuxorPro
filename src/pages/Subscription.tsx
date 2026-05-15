import React, { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import {
  Check, X, Zap, Shield, Star, Gift, ChevronDown,
  Infinity, Calendar, Crown, Lock, Loader2,
} from 'lucide-react'
import luxorLogo from '../assets/logo.png'
import {
  STRIPE_PLANS, buildCheckoutUrl,
  setStoredSubscription, clearNewUser,
  type StripePlan,
} from '../lib/stripe'
import { SUPABASE_CONFIGURED, supabase } from '../lib/supabase'

// ─── Color tokens ────────────────────────────────────────────────────────────
const BRAND  = '#ff7a00'
const GRAD   = 'linear-gradient(135deg, #ff7a00 0%, #ff4500 100%)'
const GOLD   = 'linear-gradient(135deg, #ffd700 0%, #ff7a00 60%, #ff4500 100%)'

// ─── Per-plan trial / guarantee config ───────────────────────────────────────
const PLAN_META: Record<string, { trial?: string; guarantee?: string; cancelNote?: string }> = {
  monthly:  { cancelNote: 'Cancele a qualquer momento' },
  annual:   { trial: '7 dias grátis', guarantee: '30 dias de satisfação garantida', cancelNote: 'Cancele a qualquer momento' },
  lifetime: { guarantee: '30 dias de garantia de reembolso total' },
}

// ─── Feature matrix ───────────────────────────────────────────────────────────
const FEATURES = [
  { text: 'Dashboard financeiro completo',      monthly: true,  annual: true,  lifetime: true  },
  { text: 'Importação de faturas por IA',        monthly: true,  annual: true,  lifetime: true  },
  { text: 'Múltiplas moedas (BRL/USD/EUR)',      monthly: true,  annual: true,  lifetime: true  },
  { text: 'Controle de investimentos',           monthly: true,  annual: true,  lifetime: true  },
  { text: 'Metas financeiras inteligentes',      monthly: true,  annual: true,  lifetime: true  },
  { text: 'Análise 50/30/20',                    monthly: true,  annual: true,  lifetime: true  },
  { text: 'Calculadoras financeiras (VPL/TIR…)', monthly: true,  annual: true,  lifetime: true  },
  { text: 'Suporte prioritário',                 monthly: false, annual: true,  lifetime: true  },
  { text: 'Acesso antecipado a novidades',       monthly: false, annual: false, lifetime: true  },
  { text: 'Acesso vitalício garantido',          monthly: false, annual: false, lifetime: true  },
  { text: 'Sem cobranças futuras',               monthly: false, annual: false, lifetime: true  },
]

// ─── FAQ ─────────────────────────────────────────────────────────────────────
const FAQ = [
  {
    q: 'Como funciona o cancelamento?',
    a: 'Os planos Mensal e Anual podem ser cancelados a qualquer momento direto pelo painel de gerenciamento de assinatura (botão "Gerenciar Assinatura" nas Configurações). O acesso continua até o fim do período já pago. Sem multa, sem burocracia.',
  },
  {
    q: 'Como acionar a garantia de 30 dias?',
    a: 'Se você não estiver satisfeito nos primeiros 30 dias (Anual ou Vitalício), basta enviar um e-mail para suporte@luxor.app com o assunto "Garantia" e processamos o reembolso integral em até 5 dias úteis — sem perguntas.',
  },
  {
    q: 'O que é o Acesso Vitalício?',
    a: 'É um pagamento único de R$597 que garante acesso permanente ao Luxor — todas as funcionalidades atuais e futuras, para sempre, sem mensalidade. O plano se paga em menos de 4 anos comparado ao Anual, e você nunca mais paga nada depois disso.',
  },
  {
    q: 'Tenho um código de amigo. Como uso?',
    a: 'Insira o código no campo "Código de Indicação" antes de clicar em assinar. O desconto será aplicado automaticamente no checkout do Stripe.',
  },
  {
    q: 'Meus dados financeiros estão seguros?',
    a: 'Totalmente. O processamento de faturas e documentos é feito 100% localmente no seu navegador — nenhum dado financeiro sai da sua máquina.',
  },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      className="w-full text-left border border-[#1e1e2e] rounded-2xl overflow-hidden hover:border-[#ff7a00]/30 transition-colors"
      onClick={() => setOpen(o => !o)}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-sm font-medium text-[#e8e8f0]">{q}</span>
        <ChevronDown className={clsx('w-4 h-4 text-[#55556a] transition-transform flex-shrink-0 ml-3', open && 'rotate-180')} />
      </div>
      {open && (
        <div className="px-5 pb-4 text-xs text-[#8888aa] leading-relaxed border-t border-[#1e1e2e]">
          <p className="pt-3">{a}</p>
        </div>
      )}
    </button>
  )
}

function FeatureRow({ text, included }: { text: string; included: boolean }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {included
        ? <Check className="w-4 h-4 text-[#00ff88] flex-shrink-0" />
        : <X     className="w-4 h-4 text-[#2a2a3e] flex-shrink-0" />}
      <span className={clsx('text-xs', included ? 'text-[#c8c8d8]' : 'text-[#3a3a4e] line-through')}>{text}</span>
    </div>
  )
}

function PricingCard({
  plan, promoCode, onSubscribe, isLoading,
}: {
  plan:        StripePlan
  promoCode:   string
  onSubscribe: (plan: StripePlan) => void
  isLoading:   boolean
}) {
  const meta       = PLAN_META[plan.id] ?? {}
  const isLifetime = plan.id === 'lifetime'
  const features   = FEATURES.map(f => ({
    text:     f.text,
    included: plan.id === 'monthly' ? f.monthly : plan.id === 'annual' ? f.annual : f.lifetime,
  }))

  return (
    <div
      className={clsx(
        'relative flex flex-col rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1',
        isLifetime
          ? 'bg-[#0d0d14] border-2 shadow-2xl scale-[1.03] z-10'
          : 'bg-[#0a0a10] border hover:border-[#ff7a00]/30',
      )}
      style={isLifetime ? {
        borderColor: 'rgba(255,122,0,0.6)',
        boxShadow:   '0 0 60px rgba(255,122,0,0.18), 0 24px 48px rgba(0,0,0,0.5)',
      } : { borderColor: '#1e1e2e' }}
    >
      {/* Top badges */}
      {plan.badge && (
        <div
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[11px] font-bold text-white whitespace-nowrap"
          style={{ background: GRAD, boxShadow: '0 4px 16px rgba(255,122,0,0.4)' }}
        >
          ⭐ {plan.badge}
        </div>
      )}
      {plan.savingsLabel && !plan.badge && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold text-[#00ff88] bg-[#00ff88]/10 border border-[#00ff88]/30 whitespace-nowrap">
          💚 {plan.savingsLabel}
        </div>
      )}

      {/* Plan icon */}
      <div className="mb-4">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center"
          style={{
            background: isLifetime ? 'rgba(255,122,0,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isLifetime ? 'rgba(255,122,0,0.4)' : '#1e1e2e'}`,
          }}
        >
          {plan.id === 'monthly'  && <Calendar className="w-5 h-5" style={{ color: '#8888aa' }} />}
          {plan.id === 'lifetime' && <Infinity  className="w-5 h-5" style={{ color: BRAND }} />}
          {plan.id === 'annual'   && <Crown     className="w-5 h-5" style={{ color: '#00ff88' }} />}
        </div>
      </div>

      {/* Label */}
      <p className="text-xs font-semibold uppercase tracking-widest mb-1"
        style={{ color: isLifetime ? BRAND : '#55556a' }}>
        {plan.label}
      </p>

      {/* Price */}
      <div className="mb-1">
        <div className="flex items-end gap-1">
          <span className="text-xs text-[#55556a] mt-1 self-start">R$</span>
          <span
            className="text-4xl font-bold text-[#e8e8f0] leading-none"
            style={isLifetime ? { background: GOLD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } : {}}
          >
            {plan.price.toLocaleString('pt-BR')}
          </span>
          <span className="text-xs text-[#55556a] mb-1">
            {plan.interval === 'month' ? '/mês' : plan.interval === 'year' ? '/ano' : ' único'}
          </span>
        </div>
        {plan.pricePerMonth && plan.interval !== 'month' && (
          <p className="text-[11px] text-[#55556a] mt-0.5">
            equivale a R${plan.pricePerMonth.toFixed(2)}/mês
          </p>
        )}
        {plan.id === 'monthly' && (
          <p className="text-[11px] text-[#3a3a4e] mt-0.5">R$358,80/ano na mensalidade</p>
        )}
      </div>

      {/* Trial pill */}
      {meta.trial && (
        <div
          className="mt-2 mb-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold self-start"
          style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)', color: '#00ff88' }}
        >
          <Zap className="w-3 h-3" />
          {meta.trial}
        </div>
      )}

      {/* Divider */}
      <div className="h-px my-4" style={{ background: isLifetime ? 'rgba(255,122,0,0.2)' : '#1e1e2e' }} />

      {/* Guarantee badge (inside card) */}
      {meta.guarantee && (
        <div
          className="flex items-center gap-2 p-2.5 rounded-xl mb-3 text-[11px] font-medium"
          style={{
            background:  'rgba(255,215,0,0.06)',
            border:      '1px solid rgba(255,215,0,0.2)',
            color:       '#ffd700',
          }}
        >
          <Shield className="w-3.5 h-3.5 flex-shrink-0" />
          🛡 {meta.guarantee}
        </div>
      )}

      {/* Cancel note */}
      {meta.cancelNote && (
        <p className="text-[11px] text-[#3a3a4e] mb-3 flex items-center gap-1.5">
          <span>↩</span> {meta.cancelNote}
        </p>
      )}

      {/* Features */}
      <div className="flex-1 space-y-0.5 mb-6">
        {features.map(f => <FeatureRow key={f.text} text={f.text} included={f.included} />)}
      </div>

      {/* CTA */}
      <button
        onClick={() => onSubscribe(plan)}
        disabled={isLoading}
        className={clsx(
          'w-full py-3 rounded-2xl text-sm font-bold transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed',
          isLifetime
            ? 'text-white shadow-lg hover:opacity-90'
            : 'border hover:border-[#ff7a00]/50 hover:text-[#ff7a00]',
        )}
        style={isLifetime ? {
          background: GRAD,
          boxShadow:  '0 8px 24px rgba(255,122,0,0.35)',
        } : {
          background:  'transparent',
          borderColor: '#2a2a3e',
          color:       '#8888aa',
        }}
      >
        {isLoading
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : plan.id === 'lifetime'
            ? '⚡ Acesso Vitalício'
            : plan.id === 'annual'
              ? '🚀 Começar 7 dias grátis'
              : 'Assinar Mensalmente'}
      </button>
    </div>
  )
}

function StatPill({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#0d0d14] border border-[#1e1e2e]">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#ff7a00]/10 border border-[#ff7a00]/20 flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-[#e8e8f0]">{value}</p>
        <p className="text-[11px] text-[#55556a]">{label}</p>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface SubscriptionProps {
  userId?:    string
  onComplete: () => void
}

export default function Subscription({ userId, onComplete }: SubscriptionProps) {
  const [promoCode,    setPromoCode]    = useState('')
  const [promoInput,   setPromoInput]   = useState('')
  const [promoApplied, setPromoApplied] = useState(false)
  const [promoError,   setPromoError]   = useState('')
  const [showPromo,    setShowPromo]    = useState(false)

  const userName = (() => {
    try {
      const stored = localStorage.getItem('luxor_signup_name') || ''
      if (!stored || stored.includes('@')) return ''
      return stored.split(' ')[0]
    } catch { return '' }
  })()

  // Handle return from Stripe with ?subscription_success=1&plan=XXX
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('subscription_success') === '1') {
      const plan = params.get('plan') ?? 'unknown'
      setStoredSubscription(plan)
      clearNewUser()
      window.history.replaceState({}, '', window.location.pathname)
      // Sync subscription status directly from Stripe into the database,
      // as a fallback in case the webhook didn't fire.
      if (SUPABASE_CONFIGURED) {
        supabase.functions.invoke('sync-subscription').catch(console.error)
      }
      onComplete()
    }
  }, [onComplete])

  const handleApplyPromo = () => {
    const code = promoInput.trim().toUpperCase()
    if (!code) { setPromoError('Insira um código.'); return }
    setPromoCode(code)
    setPromoApplied(true)
    setPromoError('')
  }

  const [checkingOut, setCheckingOut] = useState<string | null>(null)

  const handleSubscribe = (plan: StripePlan) => {
    setCheckingOut(plan.id)
    const url = buildCheckoutUrl(plan, promoCode || undefined, userId)
    setStoredSubscription(plan.id)
    clearNewUser()
    window.location.href = url
  }

  const orderedPlans = [
    STRIPE_PLANS.find(p => p.id === 'monthly')!,
    STRIPE_PLANS.find(p => p.id === 'lifetime')!,
    STRIPE_PLANS.find(p => p.id === 'annual')!,
  ]

  return (
    <div className="min-h-screen bg-[#080810] flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(ellipse, #ff7a00 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center px-4 py-10 sm:py-16">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(255,122,0,0.1)', border: '1px solid rgba(255,122,0,0.3)' }}
          >
            <img src={luxorLogo} alt="Luxor" className="w-7 h-7 object-contain" />
          </div>
          <span className="text-xl font-bold tracking-tight">
            <span className="text-[#e8e8f0]">Luxor</span><span style={{ color: BRAND }}>.Pro</span>
          </span>
        </div>

        {/* Hero */}
        <div className="text-center max-w-2xl mb-4">
          <h1 className="text-3xl sm:text-4xl font-bold text-[#e8e8f0] leading-tight mb-4">
            {userName ? `${userName}, você está quase lá.` : 'Você está quase lá.'}
            <br />
            <span style={{ background: GOLD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Ative seu acesso e coloque seu dinheiro para trabalhar.
            </span>
          </h1>
          <p className="text-[#8888aa] text-sm sm:text-base leading-relaxed">
            Todos os planos incluem acesso completo — dashboard, IA, investimentos e metas.
            Sem limites escondidos. Cancele quando quiser.
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-3xl mb-12">
          <StatPill icon={<Shield className="w-4 h-4 text-[#ff7a00]" />} value="100% Local"   label="Seus dados nunca saem" />
          <StatPill icon={<Lock   className="w-4 h-4 text-[#ff7a00]" />} value="SSL + Stripe" label="Pagamento seguro" />
          <StatPill icon={<Star   className="w-4 h-4 text-[#ff7a00]" />} value="Tudo incluído" label="Sem upgrades escondidos" />
          <StatPill icon={<Gift   className="w-4 h-4 text-[#ff7a00]" />} value="Cancele fácil" label="Sem fidelidade" />
        </div>

        {/* Promo code applied banner */}
        {promoApplied && (
          <div
            className="w-full max-w-3xl mb-6 flex items-center gap-3 p-4 rounded-2xl"
            style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)' }}
          >
            <Check className="w-5 h-5 text-[#00ff88] flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[#00ff88]">
                Código <span className="font-mono">{promoCode}</span> aplicado!
              </p>
              <p className="text-xs text-[#55556a]">O desconto será aplicado automaticamente no checkout.</p>
            </div>
            <button
              onClick={() => { setPromoCode(''); setPromoApplied(false); setPromoInput('') }}
              className="ml-auto text-[#55556a] hover:text-[#ff4466] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Pricing cards */}
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mb-10">
          {orderedPlans.map(plan => (
            <PricingCard
              key={plan.id}
              plan={plan}
              promoCode={promoCode}
              onSubscribe={handleSubscribe}
              isLoading={checkingOut === plan.id}
            />
          ))}
        </div>

        {/* Comparison hint */}
        <div
          className="w-full max-w-3xl mb-8 p-4 rounded-2xl text-center"
          style={{ background: 'rgba(255,122,0,0.04)', border: '1px solid rgba(255,122,0,0.12)' }}
        >
          <p className="text-xs text-[#55556a]">
            💡 <span className="text-[#8888aa]">O Anual sai R$15/mês — 50% de economia vs mensal (R$358,80/ano).</span>
            {' '}Mas o <span className="text-[#ff7a00] font-semibold">Vitalício a R$597</span>{' '}
            se paga em 3 anos e você nunca mais paga nada.
          </p>
        </div>

        {/* Promo code section */}
        <div className="w-full max-w-3xl mb-10">
          {!showPromo && !promoApplied && (
            <button
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-xs text-[#55556a] hover:text-[#ff7a00] border border-dashed border-[#1e1e2e] hover:border-[#ff7a00]/30 transition-all"
              onClick={() => setShowPromo(true)}
            >
              <Gift className="w-4 h-4" />
              Tenho um código de amigo — quero acessar grátis
            </button>
          )}
          {showPromo && !promoApplied && (
            <div className="p-5 rounded-2xl border border-[#1e1e2e] bg-[#0d0d14]">
              <p className="text-sm font-semibold text-[#e8e8f0] mb-1">Código de Indicação</p>
              <p className="text-xs text-[#55556a] mb-4">
                Recebeu um código de um amigo? Insira abaixo para acessar o Luxor gratuitamente.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promoInput}
                  onChange={e => setPromoInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleApplyPromo()}
                  placeholder="SEUCÓDIGO"
                  className="flex-1 bg-[#0a0a10] border border-[#1e1e2e] rounded-xl px-4 py-2.5 text-sm text-[#e8e8f0] placeholder:text-[#3a3a4e] font-mono focus:outline-none focus:border-[#ff7a00]/50 focus:ring-1 focus:ring-[#ff7a00]/20 uppercase"
                />
                <button
                  onClick={handleApplyPromo}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ background: GRAD }}
                >
                  Aplicar
                </button>
              </div>
              {promoError && <p className="text-xs text-[#ff4466] mt-2">{promoError}</p>}
            </div>
          )}
        </div>

        {/* Trust bar */}
        <div className="flex flex-wrap items-center justify-center gap-5 mb-12 text-xs text-[#3a3a4e]">
          {[
            '🔒 Pagamento via Stripe',
            '🇧🇷 Preços em Real',
            '🛡 Garantia de 30 dias',
            '♾️ Cancele a qualquer hora',
          ].map(t => <span key={t}>{t}</span>)}
        </div>

        {/* FAQ */}
        <div className="w-full max-w-2xl mb-12">
          <h2 className="text-base font-bold text-[#e8e8f0] text-center mb-5">Perguntas frequentes</h2>
          <div className="space-y-3">
            {FAQ.map(item => <FaqItem key={item.q} q={item.q} a={item.a} />)}
          </div>
        </div>

        {/* Footer note */}
        <p className="text-[11px] text-[#2a2a3e] pb-8 text-center">
          Ao assinar você concorda com os nossos Termos de Uso · Suporte: suporte@luxor.app
        </p>

      </div>
    </div>
  )
}
