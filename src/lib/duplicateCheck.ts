// ─── Transaction duplicate detection ─────────────────────────────────────────
// A transaction is a duplicate ONLY when all three match exactly:
//   • date          (same YYYY-MM-DD)
//   • description   (case-insensitive, whitespace-normalized)
//   • amount        (cent precision)

import type { Transaction, Investment } from './types'

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const cents = (n: number) => Math.round(n * 100)

interface MatchInput {
  date: string                  // "YYYY-MM-DD"
  description: string
  amount: number                // always positive
  type?: 'expense' | 'income'   // accepted for caller compatibility but not part of the key
}

/** Composite key — exact date + abs(amount) + normalized desc. */
function dupKey(t: Pick<Transaction, 'date' | 'description' | 'amount'>): string {
  return `${t.date}|${cents(t.amount)}|${norm(t.description)}`
}

/** Returns transactions sharing exact date + description + amount. */
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

// ─── Investment duplicate detection ──────────────────────────────────────────
// An investment is "the same position" when it shares: normalized name (or
// ticker if present) + institution + assetClass. Quantity/price intentionally
// excluded — those drift between syncs even for the same underlying asset.

function invDupKey(i: Pick<Investment, 'name' | 'ticker' | 'institution' | 'assetClass'>): string {
  const handle = (i.ticker?.trim() || i.name).toLowerCase().replace(/\s+/g, ' ')
  const inst   = norm(i.institution)
  const cls    = norm(i.assetClass)
  return `${cls}|${inst}|${handle}`
}

export function findAllDuplicateInvestmentGroups(investments: Investment[]): Investment[][] {
  const buckets = new Map<string, Investment[]>()
  for (const inv of investments) {
    const k = invDupKey(inv)
    const arr = buckets.get(k)
    if (arr) arr.push(inv)
    else buckets.set(k, [inv])
  }
  const groups: Investment[][] = []
  for (const arr of buckets.values()) {
    if (arr.length < 2) continue
    arr.sort((a, b) => {
      // Oldest first by purchaseDate, then by id
      if (a.purchaseDate !== b.purchaseDate) return a.purchaseDate < b.purchaseDate ? -1 : 1
      return a.id < b.id ? -1 : 1
    })
    groups.push(arr)
  }
  groups.sort((g1, g2) => g2.length - g1.length)
  return groups
}
