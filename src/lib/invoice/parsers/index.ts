// ─── Invoice Pipeline — Parser Registry ─────────────────────────────────────
//
// To add a new bank parser:
//   1. Create parsers/mybank.ts implementing InvoiceParser
//   2. Import and add it to PARSERS before GenericParser

import type { InvoiceParser } from './base'
import { NubankParser } from './nubank'
import { ItauParser } from './itau'
import { BradescoParser } from './bradesco'
import { SantanderParser } from './santander'
import { GenericParser } from './generic'

/** Ordered list of parsers. First match wins; GenericParser always matches last. */
export const PARSERS: InvoiceParser[] = [
  NubankParser,
  ItauParser,
  BradescoParser,
  SantanderParser,
  GenericParser,
]

/** Select the best parser for the given raw text. */
export function selectParser(rawText: string): InvoiceParser {
  return PARSERS.find(p => p.detect(rawText)) ?? GenericParser
}
