// ─── Invoice Pipeline — Shared Utilities ────────────────────────────────────

import type { ParsedTransaction } from './types'

export const PT_MONTHS: Record<string, string> = {
  jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
  jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
  feb: '02', apr: '04', may: '05', aug: '08', sep: '09', oct: '10', dec: '12',
}

/**
 * Parse a Brazilian-formatted amount string to a number.
 * Handles "1.234,56" → 1234.56 and "1234,56" → 1234.56
 */
export function parseBRLAmount(s: string): number | null {
  const cleaned = s.replace(/[R$\s]/g, '').trim()
  if (/,\d{2}$/.test(cleaned)) {
    const n = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
    return isNaN(n) ? null : n
  }
  if (/\.\d{2}$/.test(cleaned)) {
    const n = parseFloat(cleaned.replace(',', ''))
    return isNaN(n) ? null : n
  }
  return null
}

/** Title-case a description string, capped at 80 chars. */
export function niceCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-záéíóúàâêôãõüç])/g, c => c.toUpperCase())
    .slice(0, 80)
}

/** Infer a reasonable year for a DD/MM date found in an invoice. */
export function inferYear(month: number, currentYear: number, currentMonth: number): number {
  // If the month is more than 2 months ahead of current month, assume last year
  return month > currentMonth + 2 ? currentYear - 1 : currentYear
}

/** Remove true duplicates: same date + amount + first 20 chars of description. */
export function dedup(arr: ParsedTransaction[]): ParsedTransaction[] {
  const seen = new Set<string>()
  return arr
    .filter(t => {
      const key = `${t.date}|${t.amount.toFixed(2)}|${t.merchant.toLowerCase().slice(0, 20)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Category propagation: if same merchant appears with a specific category, apply to all. */
export function propagateCategories(txs: ParsedTransaction[]): ParsedTransaction[] {
  const key = (s: string) => s.toLowerCase().replace(/[^a-záéíóúàâêôãõüç0-9]/g, '').slice(0, 14)
  const catMap = new Map<string, string>()
  for (const tx of txs) {
    if (tx.category !== 'outros') catMap.set(key(tx.merchant), tx.category)
  }
  return txs.map(tx => {
    const cat = catMap.get(key(tx.merchant))
    return cat && tx.category === 'outros' ? { ...tx, category: cat } : tx
  })
}

/** Generate a simple short unique ID (no nanoid dependency in lib layer). */
export function shortId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
