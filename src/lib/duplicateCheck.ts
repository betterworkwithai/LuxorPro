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

/** Composite key used for grouping — same month + type + abs(amount) + normalized desc. */
function dupKey(t: Pick<Transaction, 'date' | 'description' | 'amount' | 'type'>): string {
  return `${t.date.slice(0, 7)}|${t.type}|${cents(t.amount)}|${norm(t.description)}`
}

/**
 * Returns transactions in the same month that share description + amount + type.
 * Caller decides whether to warn the user.
 */
export function findDuplicates(input: MatchInput, existing: Transaction[]): Transaction[] {
  const targetKey = dupKey(input)
  return existing.filter(t => dupKey(t) === targetKey)
}

/**
 * Scans the entire transaction set and returns every group with 2+ duplicates.
 * Each group is sorted oldest-first (by createdAt then id) so the first item
 * is the natural "keeper" and the rest are the deletable duplicates.
 */
export function findAllDuplicateGroups(transactions: Transaction[]): Transaction[][] {
  const buckets = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const k = dupKey(t)
    const arr = buckets.get(k)
    if (arr) arr.push(t)
    else buckets.set(k, [t])
  }
  const groups: Transaction[][] = []
  for (const arr of buckets.values()) {
    if (arr.length < 2) continue
    arr.sort((a, b) => {
      // Oldest first — by createdAt timestamp, fallback to id (stable nanoid order roughly tracks creation)
      const ac = a.createdAt ?? ''
      const bc = b.createdAt ?? ''
      if (ac !== bc) return ac < bc ? -1 : 1
      return a.id < b.id ? -1 : 1
    })
    groups.push(arr)
  }
  // Sort groups by descending duplicate count, then by most recent date
  groups.sort((g1, g2) => {
    if (g1.length !== g2.length) return g2.length - g1.length
    return g2[0].date.localeCompare(g1[0].date)
  })
  return groups
}
