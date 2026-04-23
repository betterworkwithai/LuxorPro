// ─── Invoice Pipeline — Bradesco Parser ─────────────────────────────────────
//
// Bradesco invoices follow the standard DD/MM layout with no special prefixes.
// Delegates to the generic parser with Bradesco account label.

import type { InvoiceParser } from './base'
import type { ClassifiedLine, ParsedTransaction } from '../types'
import { parseTransactionLines } from '../transactionParser'
import { dedup, propagateCategories } from '../utils'

export const BradescoParser: InvoiceParser = {
  name: 'Bradesco',

  detect(rawText: string): boolean {
    return /bradesco/i.test(rawText)
  },

  parse(
    lines: ClassifiedLine[],
    _rawText: string,
    currentYear: number,
    currentMonth: number,
    defaultAccount = 'Bradesco',
  ): ParsedTransaction[] {
    const txs = parseTransactionLines(lines, currentYear, currentMonth, defaultAccount)
    return propagateCategories(dedup(txs))
  },
}
