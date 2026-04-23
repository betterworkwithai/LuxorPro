// ─── Invoice Pipeline — Base Parser Interface ────────────────────────────────
//
// All bank-specific parsers implement this interface.
// To add a new bank parser:
//   1. Create a file in this folder (e.g., mybank.ts)
//   2. Export a class implementing InvoiceParser
//   3. Register it in the PARSERS array in index.ts

import type { ClassifiedLine, ParsedTransaction } from '../types'

export interface InvoiceParser {
  /** Display name for the parser */
  name: string
  /** Return true if this parser should handle the given raw text */
  detect(rawText: string): boolean
  /** Parse classified lines into transactions */
  parse(
    lines: ClassifiedLine[],
    rawText: string,
    currentYear: number,
    currentMonth: number,
    defaultAccount?: string,
  ): ParsedTransaction[]
}
