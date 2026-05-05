// ─── Transaction duplicate detection ─────────────────────────────────────────
// A transaction is "exactly the same" when in the same month it has matching
// description (case-insensitive, trimmed), amount (cent precision), and type.

import type { Transaction } from './types'

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const cents = (n: number) => Math.round(n * 100)

interface MatchInput {
  date: string                  // "YYYY-MM-DD"
  description: string
  amount: number                // always positive
  type: 'expense' | 'income'
}

/**
 * Returns transactions in the same month that share description + amount + type.
 * Caller decides whether to warn the user.
 */
export function findDuplicates(input: MatchInput, existing: Transaction[]): Transaction[] {
  const month = input.date.slice(0, 7) // "YYYY-MM"
  const desc  = norm(input.description)
  const amt   = cents(input.amount)
  return existing.filter(t =>
    t.date.slice(0, 7) === month &&
    t.type === input.type &&
    cents(t.amount) === amt &&
    norm(t.description) === desc,
  )
}
