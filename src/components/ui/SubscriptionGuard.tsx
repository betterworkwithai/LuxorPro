// ─── SubscriptionGuard ───────────────────────────────────────────────────────
//
// Wraps content that requires an active subscription.
// When the user's status is not active/trialing, renders a blur paywall
// overlay with an upgrade CTA.
//
// Usage:
//   <SubscriptionGuard feature="Importação de Faturas por IA">
//     <DocumentAI />
//   </SubscriptionGuard>

import React from 'react'
import { Crown, Zap, Shield } from 'lucide-react'
import { useSubscription } from '../../hooks/useSubscription'

interface SubscriptionGuardProps {
  children:   React.ReactNode
  feature?:   string   // e.g. "Importação de Faturas por IA"
  className?: string
}

function UpgradeOverlay({ feature }: { feature?: string }) {
  const handleUpgrade = () => {
    window.dispatchEvent(new CustomEvent('luxor:show-subscription'))
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center z-20 p-4">
      {/* Gradient veil */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(8,8,16,0.2) 0%, rgba(8,8,16,0.92) 60%)',
        }}
      />

      {/* Card */}
      <div
        className="relative bg-[#0d0d15]/95 border rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl"
        style={{
          borderColor: 'rgba(255,122,0,0.35)',
          boxShadow:   '0 0 60px rgba(255,122,0,0.18), 0 24px 48px rgba(0,0,0,0.6)',
        }}
      >
        {/* Icon */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{
            background: 'rgba(255,122,0,0.12)',
            border:     '1px solid rgba(255,122,0,0.35)',
          }}
        >
          <Crown className="w-7 h-7" style={{ color: '#ff7a00' }} />
        </div>

        {/* Heading */}
        <h3 className="text-lg font-bold text-[#e8e8f0] mb-2">
          {feature ? `${feature}` : 'Recurso Premium'}
        </h3>
        <p className="text-xs text-[#55556a] mb-1 font-medium uppercase tracking-widest">
          Requer assinatura ativa
        </p>
        <p className="text-sm text-[#8888aa] mb-6 leading-relaxed">
          Assine o Luxor e tenha controle total do seu patrimônio com automação de nível institucional.
        </p>

        {/* Trial CTA */}
        <button
          onClick={handleUpgrade}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] mb-3"
          style={{
            background:  'linear-gradient(135deg, #ff7a00 0%, #ff4500 100%)',
            boxShadow:   '0 8px 24px rgba(255,122,0,0.4)',
          }}
        >
          <Zap className="w-4 h-4" />
          Começar — 7 dias grátis
        </button>

        {/* Trust line */}
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-[#3a3a4e]">
          <Shield className="w-3 h-3" />
          Cancele a qualquer momento · Sem fidelidade
        </p>
      </div>
    </div>
  )
}

export function SubscriptionGuard({ children, feature, className }: SubscriptionGuardProps) {
  const { isActive, loading } = useSubscription()

  if (loading) {
    return (
      <div className={`w-full flex items-center justify-center py-16 ${className ?? ''}`}>
        <div className="w-5 h-5 rounded-full border-2 border-[#ff7a00] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (isActive) return <>{children}</>

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      {/* Blurred children — non-interactive */}
      <div
        className="pointer-events-none select-none"
        style={{ filter: 'blur(5px)', opacity: 0.35 }}
        aria-hidden="true"
      >
        {children}
      </div>

      <UpgradeOverlay feature={feature} />
    </div>
  )
}
