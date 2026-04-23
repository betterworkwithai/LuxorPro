// ─── Invoice Pipeline — Itaú Parser ─────────────────────────────────────────
//
// Itaú PDF invoices use a structured table with DD/MM date prefix.
// Some lines start with single-letter codes (L=lançamento, P=pagamento, etc.)
// which must be stripped. Installment format: "XX/YY" mid-line.

import type { InvoiceParser } from './base'
import type { ClassifiedLine, ParsedTransaction } from '../types'
import { parseTransactionLines } from '../transactionParser'
import { dedup, propagateCategories } from '../utils'

// Itaú single-letter code prefix (L, P, S, C, etc.)
const CODE_PREFIX_RE = /^[LPSC=+*]\s+/

export const ItauParser: InvoiceParser = {
  name: 'Itaú',

  detect(rawText: string): boolean {
    return /ita[uú]|itaucard/i.test(rawText)
  },

  parse(
    lines: ClassifiedLine[],
    rawText: string,
    currentYear: number,
    currentMonth: number,
    defaultAccount = 'Itaú',
  ): ParsedTransaction[] {
    // Strip Itaú single-letter code prefixes before parsing
    const cleanedLines: ClassifiedLine[] = lines.map(l => ({
      ...l,
      text: l.text.replace(CODE_PREFIX_RE, ''),
    }))

    const txs = parseTransactionLines(cleanedLines, currentYear, currentMonth, defaultAccount)
    return propagateCategories(dedup(txs))
  },
}
