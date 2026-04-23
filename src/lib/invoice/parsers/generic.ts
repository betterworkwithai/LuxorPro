// ─── Invoice Pipeline — Generic Parser ──────────────────────────────────────
//
// Handles any credit card / bank statement that doesn't match a specific
// bank's layout. Works on classified lines using the standard transaction parser.

import type { InvoiceParser } from './base'
import type { ClassifiedLine, ParsedTransaction } from '../types'
import { parseTransactionLines } from '../transactionParser'
import { dedup, propagateCategories } from '../utils'

export const GenericParser: InvoiceParser = {
  name: 'Generic',

  detect(_rawText: string): boolean {
    return true   // always matches as the final fallback
  },

  parse(
    lines: ClassifiedLine[],
    _rawText: string,
    currentYear: number,
    currentMonth: number,
    defaultAccount = 'Cartão',
  ): ParsedTransaction[] {
    const txs = parseTransactionLines(lines, currentYear, currentMonth, defaultAccount)
    return propagateCategories(dedup(txs))
  },
}
