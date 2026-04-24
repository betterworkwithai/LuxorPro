import React, { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ArrowLeftRight, TrendingUp, Receipt,
  FileSearch, Settings, Target, LogOut, User, Calculator, Menu, X,
} from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'
import { LOCAL_AUTH_KEY } from '../../App'
import { pfPath } from '../../constants'
import type { User as SupabaseUser } from '@supabase/supabase-js'
const luxorLogo = '/logo.gif'

const NAV_ITEMS = [
  { to: pfPath('/'),           icon: LayoutDashboard, label: 'Painel' },
  { to: pfPath('/cashflow'),   icon: ArrowLeftRight,  label: 'Receitas e Despesas' },
  { to: pfPath('/wealth'),     icon: TrendingUp,      label: 'Patrimônio / Investimentos' },
  { to: pfPath('/goals'),      icon: Target,          label: 'Minhas Metas' },
  
  { to: pfPath('/documents'),  icon: FileSearch,      label: 'IA de Documentos' },
  { to: pfPath('/tools'),      icon: Calculator,      label: 'Ferramentas' },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const location = useLocation()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Close drawer on route change
  useEffect(() => { setOpen(false) }, [location.pathname])

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [open])

  async function handleLogout() {
    localStorage.removeItem(LOCAL_AUTH_KEY)
    await supabase.auth.signOut()
    window.location.reload()
  }

  const email = user?.email ?? ''

  return (
    <>
      {/* Top bar (mobile only) */}
      <header className="md:hidden fixed top-0 inset-x-0 h-14 bg-[#0d0d15] border-b border-[#1e1e2e] z-30 flex items-center px-3 gap-3">
        <button
          onClick={() => setOpen(true)}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-[#e8e8f0] hover:bg-[#16161f] transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <img src={luxorLogo} alt="Luxor" className="w-7 h-7 rounded-lg object-cover" />
          <p className="text-sm font-bold tracking-wide">
            <span className="text-[#e8e8f0]">Luxor </span><span style={{ color: '#FF7900' }}>Pro</span>
          </p>
        </div>
      </header>

      {/* Backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40 animate-in fade-in"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <aside
        className={clsx(
          'md:hidden fixed top-0 left-0 h-full w-72 max-w-[85vw] bg-[#0d0d15] border-r border-[#1e1e2e] z-50',
          'flex flex-col transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-[#1e1e2e]">
          <div className="flex items-center gap-3">
            <img src={luxorLogo} alt="Luxor" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <p className="text-sm font-bold leading-none tracking-wide">
                <span className="text-[#e8e8f0]">Luxor </span><span style={{ color: '#FF7900' }}>Pro</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8888aa] hover:bg-[#16161f] hover:text-[#e8e8f0]"
            aria-label="Fechar menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <div className="space-y-1 px-2">
            {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === pfPath('/')}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group',
                    isActive
                      ? 'bg-[#ff7a00]/10 text-[#ff7a00] border border-[#ff7a00]/20'
                      : 'text-[#8888aa] hover:bg-[#16161f] hover:text-[#e8e8f0]',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={clsx('w-4 h-4 flex-shrink-0', isActive ? 'text-[#ff7a00]' : 'text-[#55556a] group-hover:text-[#e8e8f0]')} />
                    <span className="truncate">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-[#1e1e2e] p-2 space-y-1">
          <NavLink
            to={pfPath('/settings')}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group',
                isActive
                  ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20'
                  : 'text-[#8888aa] hover:bg-[#16161f] hover:text-[#e8e8f0]',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Settings className={clsx('w-4 h-4 flex-shrink-0', isActive ? 'text-[#00d4ff]' : 'text-[#55556a] group-hover:text-[#e8e8f0]')} />
                <span>Configurações</span>
              </>
            )}
          </NavLink>

          {email && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-[#12121a] border border-[#1e1e2e]">
              <div className="w-6 h-6 rounded-full bg-[#ff7a00]/15 border border-[#ff7a00]/30 flex items-center justify-center flex-shrink-0">
                <User className="w-3 h-3 text-[#ff7a00]" />
              </div>
              <span className="text-[11px] text-[#8888aa] truncate flex-1 font-mono">{email}</span>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#8888aa] hover:bg-red-500/10 hover:text-red-400 transition-all duration-150 group"
          >
            <LogOut className="w-4 h-4 flex-shrink-0 text-[#55556a] group-hover:text-red-400" />
            <span>Sair</span>
          </button>
        </div>
      </aside>
    </>
  )
}
