import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ArrowLeftRight, TrendingUp, Target, FileSearch, Settings, Calculator, Link2,
} from 'lucide-react'
import { clsx } from 'clsx'
import { pfPath } from '../../constants'

const NAV = [
  { to: pfPath('/'),          icon: LayoutDashboard, label: 'Início' },
  { to: pfPath('/cashflow'),  icon: ArrowLeftRight,  label: 'Caixa' },
  { to: pfPath('/wealth'),    icon: TrendingUp,      label: 'Patrim.' },
  { to: pfPath('/goals'),     icon: Target,          label: 'Metas' },
  
  { to: pfPath('/documents'),   icon: FileSearch,  label: 'IA' },
  { to: pfPath('/connections'), icon: Link2,        label: 'Bancos' },
  { to: pfPath('/tools'),       icon: Calculator,  label: 'Ferr.' },
  { to: pfPath('/settings'),    icon: Settings,    label: 'Config' },
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-[#0d0d15] border-t border-[#1e1e2e] z-30 flex overflow-x-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {NAV.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === pfPath('/')}
          className={({ isActive }) =>
            clsx(
              'flex-1 min-w-[60px] flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
              isActive ? 'text-[#ff7a00]' : 'text-[#55556a]',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={clsx('w-5 h-5', isActive ? 'text-[#ff7a00]' : 'text-[#55556a]')} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
