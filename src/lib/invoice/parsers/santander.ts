// ─── Invoice Pipeline — Santander Parser ────────────────────────────────────
//
// Santander invoices use DD/MM date prefix. International transactions
// may include a BRL conversion note on the next line — those are skipped.

import type { InvoiceParser } from './base'
import type { ClassifiedLine, ParsedTransaction } from '../types'
import { parseTransactionLines } from '../transactionParser'
import { dedup, propagateCategories } from '../utils'

// Santander-specific noise: dollar conversion footnotes
const SANTANDER_NOISE_RE = /cotação|dólar|dollar|taxa\s+de\s+câmbio|conversão/i

export const SantanderParser: InvoiceParser = {
  name: 'Santander',

  detect(rawText: string): boolean {
    return /santander/i.test(rawText)
  },

  parse(
    lines: ClassifiedLine[],
    _rawText: string,
    currentYear: number,
    currentMonth: number,
    defaultAccount = 'Santander',
  ): ParsedTransaction[] {
    const filteredLines = lines.filter(l => !SANTANDER_NOISE_RE.test(l.text))
    const txs = parseTransactionLines(filteredLines, currentYear, currentMonth, defaultAccount)
    return propagateCategories(dedup(txs))
  },
}
