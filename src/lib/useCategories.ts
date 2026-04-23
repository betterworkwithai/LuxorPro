// ─────────────────────────────────────────────
//  Merges built-in categories with user-defined ones.
//  Use this everywhere instead of importing CATEGORIES directly.
// ─────────────────────────────────────────────
import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { CATEGORIES } from './types'
import type { Category } from './types'

/** All categories: built-in + user's custom ones */
export function useAllCategories(): Category[] {
  // Use the full store (no selector) so Zustand's getSnapshot always returns
  // the same stable state reference — avoids React 18 Strict Mode infinite loop
  // that occurs when a selector creates a new [] reference on deserialization.
  const settings = useStore().settings
  const custom = settings.customCategories
  return useMemo(() => {
    const merged = custom && custom.length > 0 ? [...CATEGORIES, ...custom] : [...CATEGORIES]
    return merged.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custom, custom?.length])
}

/** Categories filtered by transaction type */
export function useCategoriesForType(type: 'income' | 'expense'): Category[] {
  const all = useAllCategories()
  return useMemo(() => all.filter(c => c.type === type || c.type === 'both'), [all, type])
}
