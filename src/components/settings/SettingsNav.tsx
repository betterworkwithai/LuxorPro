import React from 'react'
import { clsx } from 'clsx'
import {
  User, CreditCard, ShieldCheck, BarChart2, Wallet, Target, Heart,
  Building2, Tag, Database, Download, KeyRound, Sparkles, LifeBuoy, AlertTriangle,
} from 'lucide-react'

export interface SettingsNavItem {
  id: string
  label: string
  icon: React.ElementType
  /** When true, the item is rendered with destructive emphasis */
  danger?: boolean
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: 'perfil',          label: 'Perfil',                 icon: User },
  { id: 'assinatura',      label: 'Assinatura',             icon: CreditCard },
  { id: 'seguranca',       label: 'Segurança',              icon: ShieldCheck },
  { id: 'investidor',      label: 'Perfil de Investidor',   icon: BarChart2 },
  { id: 'moeda',           label: 'Moeda e Câmbio',         icon: Wallet },
  { id: 'compartilhamento',label: 'Compartilhamento',       icon: Heart },
  { id: 'instituicoes',    label: 'Instituições',           icon: Building2 },
  { id: 'categorias',      label: 'Categorias',             icon: Tag },
  { id: 'backup',          label: 'Backup',                 icon: Download },
  { id: 'conta',           label: 'Conta',                  icon: KeyRound },
  { id: 'sugerir',         label: 'Sugerir Função',         icon: Sparkles },
  { id: 'suporte',         label: 'Suporte',                icon: LifeBuoy },
  { id: 'apagar',          label: 'Apagar Dados',           icon: AlertTriangle, danger: true },
]

/**
 * Controlled settings tab navigation. Left sidebar on desktop, horizontal
 * scroll tabs on mobile. Only the section matching `active` is rendered by
 * the parent — this is a tab pattern, not anchored scroll.
 */
export function SettingsNav({
  active, onChange,
}: {
  active:   string
  onChange: (id: string) => void
}) {
  const handleClick = (id: string) => {
    onChange(id)
    // Scroll back to the top of the page so users see the tab content
    // from its beginning, regardless of where they clicked from.
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  return (
    <>
      {/* ── Desktop: vertical rail (lg+) ─────────────────────────────────── */}
      <nav
        aria-label="Seções de configurações"
        className="hidden lg:block sticky top-20 self-start w-56 flex-shrink-0"
      >
        <div className="space-y-0.5 pr-2">
          {SETTINGS_NAV_ITEMS.map(({ id, label, icon: Icon, danger }) => {
            const isActive = active === id
            return (
              <button
                key={id}
                onClick={() => handleClick(id)}
                aria-current={isActive ? 'true' : undefined}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium',
                  'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/40',
                  isActive
                    ? danger
                      ? 'bg-[#ff4466]/10 text-[#ff4466] border border-[#ff4466]/25'
                      : 'bg-[#ff7a00]/10 text-[#ff7a00] border border-[#ff7a00]/25'
                    : danger
                      ? 'text-[#8888aa] hover:text-[#ff4466] hover:bg-[#ff4466]/5'
                      : 'text-[#8888aa] hover:text-[#e8e8f0] hover:bg-[#16161f]',
                )}
              >
                <Icon className={clsx('w-4 h-4 flex-shrink-0',
                  isActive
                    ? danger ? 'text-[#ff4466]' : 'text-[#ff7a00]'
                    : 'text-[#55556a]',
                )} />
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* ── Mobile/tablet: horizontal scroll bar ─────────────────────────── */}
      <nav
        aria-label="Seções de configurações"
        className="lg:hidden sticky top-[60px] z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-[#0a0a0f]/95 backdrop-blur border-b border-[#1e1e2e] overflow-x-auto"
      >
        <div className="flex gap-1.5 min-w-max">
          {SETTINGS_NAV_ITEMS.map(({ id, label, icon: Icon, danger }) => {
            const isActive = active === id
            return (
              <button
                key={id}
                onClick={() => handleClick(id)}
                aria-current={isActive ? 'true' : undefined}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap',
                  'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/40',
                  isActive
                    ? danger
                      ? 'bg-[#ff4466]/15 text-[#ff4466]'
                      : 'bg-[#ff7a00]/15 text-[#ff7a00]'
                    : 'text-[#8888aa] hover:text-[#e8e8f0]',
                )}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
