import React, { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ArrowLeftRight, TrendingUp, Receipt,
  FileSearch, Settings, ChevronLeft, ChevronRight, Target, LogOut, User, Calculator, Shield, Link2,
} from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'
import { LOCAL_AUTH_KEY } from '../../App'
import { pfPath } from '../../constants'
import { isAdmin } from '../../lib/admin'
import type { User as SupabaseUser } from '@supabase/supabase-js'
const luxorLogo = '/logo.png'

const NAV_ITEMS = [
  { to: pfPath('/'),           icon: LayoutDashboard, label: 'Painel Consolidado' },
  { to: pfPath('/cashflow'),   icon: ArrowLeftRight,  label: 'Receitas e Despesas' },
  { to: pfPath('/wealth'),     icon: TrendingUp,      label: ' Investimentos' },
  { to: pfPath('/goals'),      icon: Target,          label: 'Minhas Metas' },
  
  { to: pfPath('/documents'),  icon: FileSearch,      label: 'IA de Documentos' },
  { to: pfPath('/connections'),icon: Link2,           label: 'Open Finance' },
  { to: pfPath('/tools'),      icon: Calculator,      label: 'Ferramentas' },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const expanded = !collapsed || hovered

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    try {
      const { resetUser } = await import('../../lib/analytics')
      resetUser()
    } catch { /* best-effort */ }
    localStorage.removeItem(LOCAL_AUTH_KEY) // clear local session flag
    await supabase.auth.signOut()           // clear Supabase session (no-op if not configured)
    window.location.reload()
  }

  const email = user?.email ?? ''
  // Short label for collapsed mode: first letter of email
  const emailInitial = email ? email[0].toUpperCase() : '?'

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={clsx(
        'relative flex flex-col h-screen bg-[#0d0d15] border-r border-[#1e1e2e]',
        'transition-all duration-300 ease-in-out flex-shrink-0 z-20',
        expanded ? 'w-56' : 'w-16',
      )}
    >
      {/* Logo */}
      <div className={clsx(
        'flex items-center gap-3 px-4 py-5 border-b border-[#1e1e2e] overflow-hidden',
        !expanded && 'justify-center px-2',
      )}>
        <img
          src={luxorLogo}
          alt="Luxor"
          className="w-10 h-10 rounded-lg object-contain flex-shrink-0"
          onError={e => { (e.currentTarget as HTMLImageElement).src = '/brand-icon.png' }}
        />
        {expanded && (
          <div className="overflow-hidden">
            <p className="text-xl font-bold leading-none tracking-wide">
              <span className="text-[#e8e8f0]">Luxor</span><span className="text-[#e8e8f0]">.</span><span style={{ color: '#FF7900' }}>Pro</span>
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
        <div className="space-y-1 px-2">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === pfPath('/')}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                  'transition-all duration-150 group',
                  !expanded && 'justify-center px-2',
                  isActive
                    ? 'bg-[#ff7a00]/10 text-[#ff7a00] border border-[#ff7a00]/20'
                    : 'text-[#8888aa] hover:bg-[#16161f] hover:text-[#e8e8f0]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={clsx('w-4 h-4 flex-shrink-0', isActive ? 'text-[#ff7a00]' : 'text-[#55556a] group-hover:text-[#e8e8f0]')} />
                  {expanded && <span className="truncate">{label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Bottom section: Settings, User info, Logout, Collapse */}
      <div className="border-t border-[#1e1e2e] p-2 space-y-1">
        {/* Settings */}
        <NavLink
          to={pfPath('/settings')}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group',
              !expanded && 'justify-center px-2',
              isActive
                ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20'
                : 'text-[#8888aa] hover:bg-[#16161f] hover:text-[#e8e8f0]',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Settings className={clsx('w-4 h-4 flex-shrink-0', isActive ? 'text-[#ff7a00]' : 'text-[#55556a] group-hover:text-[#e8e8f0]')} />
              {expanded && <span>Configurações</span>}
            </>
          )}
        </NavLink>

        {/* Admin link — only for admin emails */}
        {isAdmin(email) && (
          <NavLink
            to={pfPath('/admin')}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group',
                !expanded && 'justify-center px-2',
                isActive
                  ? 'bg-[#ff7a00]/10 text-[#ff7a00] border border-[#ff7a00]/20'
                  : 'text-[#8888aa] hover:bg-[#16161f] hover:text-[#e8e8f0]',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Shield className={clsx('w-4 h-4 flex-shrink-0', isActive ? 'text-[#ff7a00]' : 'text-[#55556a] group-hover:text-[#ff7a00]')} />
                {expanded && <span>Admin</span>}
              </>
            )}
          </NavLink>
        )}

        {/* User info row — only shown when there's a logged-in user */}
        {email && (
          !expanded ? (
            <div title={email} className="flex items-center justify-center rounded-xl px-2 py-2.5">
              <div className="w-6 h-6 rounded-full bg-[#ff7a00]/15 border border-[#ff7a00]/30 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-[#ff7a00]">{emailInitial}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-[#12121a] border border-[#1e1e2e]">
              <div className="w-6 h-6 rounded-full bg-[#ff7a00]/15 border border-[#ff7a00]/30 flex items-center justify-center flex-shrink-0">
                <User className="w-3 h-3 text-[#ff7a00]" />
              </div>
              <span className="text-[11px] text-[#8888aa] truncate flex-1 font-mono">{email}</span>
            </div>
          )
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={clsx(
            'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
            'text-[#8888aa] hover:bg-red-500/10 hover:text-red-400 transition-all duration-150 group',
            !expanded && 'justify-center px-2',
          )}
          title="Sair"
        >
          <LogOut className="w-4 h-4 flex-shrink-0 text-[#55556a] group-hover:text-red-400" />
          {expanded && <span>Sair</span>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[#55556a] hover:bg-[#16161f] hover:text-[#e8e8f0] transition-all"
        >
          {!expanded
            ? <ChevronRight className="w-4 h-4" />
            : <><ChevronLeft className="w-4 h-4" /><span>Recolher</span></>
          }
        </button>
      </div>
    </aside>
  )
}
