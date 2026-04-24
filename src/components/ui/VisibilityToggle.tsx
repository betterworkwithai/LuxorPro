import React from 'react'
import { Lock, Users } from 'lucide-react'
import { clsx } from 'clsx'
import { useStore } from '../../store/useStore'
import type { Transaction } from '../../lib/types'

interface Props {
  transaction: Transaction
  className?: string
}

export function VisibilityToggle({ transaction, className }: Props) {
  const { partnership, setTransactionVisibility } = useStore()

  // Only render when there is an active partnership
  if (!partnership || partnership.status !== 'active') return null

  const isShared = transaction.visibility === 'shared'

  return (
    <button
      title={isShared ? 'Compartilhada — clique para tornar privada' : 'Privada — clique para compartilhar'}
      onClick={e => {
        e.stopPropagation()
        setTransactionVisibility(transaction.id, isShared ? 'private' : 'shared')
      }}
      className={clsx(
        'w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all',
        isShared
          ? 'bg-[#ff7a00]/15 border border-[#ff7a00]/30 text-[#ff7a00] hover:bg-[#ff7a00]/25'
          : 'bg-[#1e1e2e] border border-[#2a2a3e] text-[#55556a] hover:border-[#ff7a00]/30 hover:text-[#ff7a00]',
        className,
      )}
    >
      {isShared
        ? <Users className="w-3 h-3" />
        : <Lock className="w-3 h-3" />}
    </button>
  )
}
