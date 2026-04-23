// ─── Invoice Pipeline — Nubank Parser ───────────────────────────────────────
//
// Nubank PDF invoices have a clean two-column layout:
//   DD MMM  Merchant Name          R$ 1.234,56
// Lines may span multiple rows; credit lines are prefixed with "-".
// The "Pagamento recebido" line must NOT be imported as a transaction.

import type { InvoiceParser } from './base'
import type { ClassifiedLine, ParsedTransaction } from '../types'
import { parseBRLAmount, niceCase, shortId, dedup, propagateCategories, PT_MONTHS } from '../utils'
import { autoCategorize } from '../autoCategorize'

const NUBANK_SKIP_RE = /pagamento\s+recebido|saldo\s+final|limite\s+dispon|cashback\s+acumulado|encargos?\s+cobrados/i

// Nubank date format: "15 JAN" or "15 Jan" (no year)
const NUBANK_DATE_RE = /^(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i

export const NubankParser: InvoiceParser = {
  name: 'Nubank',

  detect(rawText: string): boolean {
    return /nubank|nu\s+pagamentos/i.test(rawText)
  },

  parse(
    lines: ClassifiedLine[],
    _rawText: string,
    currentYear: number,
    currentMonth: number,
    defaultAccount = 'Nubank',
  ): ParsedTransaction[] {
    const results: ParsedTransaction[] = []

    for (const line of lines) {
      const t = line.text.trim()
      if (!t || NUBANK_SKIP_RE.test(t)) continue

      // A single reconstructed line can sometimes contain two merged Nubank rows
      // (e.g. "15 JAN Amazon Br 499,27  16 JAN Uber * Pending").
      // We expand these before parsing so both transactions are captured.
      const segments = expandNubankLine(t)

      for (const seg of segments) {
        const tx = parseNubankSegment(seg, line, currentYear, currentMonth, defaultAccount)
        if (tx) results.push(tx)
      }
    }

    return propagateCategories(dedup(results))
  },
}

/**
 * Split a single raw line into one or more Nubank transaction segments.
 * Detects the pattern: (date)(merchant)(amount)(date)(merchant)...
 * and splits at each secondary date found after an amount.
 */
function expandNubankLine(text: string): string[] {
  const segments: string[] = []
  let remaining = text

  // Keep extracting date-led segments until none left
  while (remaining.length > 0) {
    const dateM = remaining.match(NUBANK_DATE_RE)
    if (!dateM) {
      // No date found — could still be an amount-only tail, keep as-is
      if (/[\d.]+,\d{2}/.test(remaining) || remaining.length > 5) {
        segments.push(remaining)
      }
      break
    }

    // Find where the NEXT date starts (after at least one amount)
    const afterDate = remaining.slice(dateM[0].length)
    const amtRe = /([\d.]+,\d{2})/g
    let lastAmtEnd = -1
    let nextDateStart = -1
    let amtMatch: RegExpExecArray | null

    while ((amtMatch = amtRe.exec(afterDate)) !== null) {
      lastAmtEnd = amtMatch.index + amtMatch[0].length
      // Look for another Nubank date after this amount
      const tail = afterDate.slice(lastAmtEnd).trimStart()
      if (NUBANK_DATE_RE.test(tail)) {
        nextDateStart = dateM[0].length + lastAmtEnd + (afterDate.slice(lastAmtEnd).length - tail.length)
        break
      }
    }

    if (nextDateStart > 0) {
      segments.push(remaining.slice(0, nextDateStart).trim())
      remaining = remaining.slice(nextDateStart).trim()
    } else {
      // No second date found — the rest is one segment
      segments.push(remaining.trim())
      break
    }
  }

  return segments.filter(s => s.length > 3)
}

function parseNubankSegment(
  t: string,
  line: ClassifiedLine,
  currentYear: number,
  currentMonth: number,
  defaultAccount: string,
): ParsedTransaction | null {
  const dateM = t.match(NUBANK_DATE_RE)
  if (!dateM) return null

  const [, d, mon] = dateM
  const mo = PT_MONTHS[mon.toLowerCase()] ?? '01'
  const moNum = parseInt(mo, 10)
  const yr = moNum > currentMonth + 2 ? currentYear - 1 : currentYear
  const date = `${yr}-${mo}-${d.padStart(2, '0')}`

  const rest = t.slice(dateM[0].length).trim()

  const amtMatches = [...rest.matchAll(/([\d.]+,\d{2})/g)]
  if (amtMatches.length === 0) return null
  const rawAmt = amtMatches[amtMatches.length - 1][1]
  const amount = parseBRLAmount(rawAmt)
  if (!amount || amount < 0.01) return null

  const isCredit = t.startsWith('-') || /estorno|crédito/i.test(rest)

  const amtPos = rest.lastIndexOf(rawAmt)
  let merchant = rest.slice(0, amtPos)
    .replace(/\b\d{2}\/\d{2}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^-\s*/, '')
    .trim()

  if (!merchant || merchant.length < 2) return null
  merchant = niceCase(merchant)

  const instM = rest.match(/\b(\d{2}\/\d{2})\b/)
  const installment = instM ? instM[1] : undefined

  const { category, type: catType } = autoCategorize(merchant)

  return {
    id: shortId(),
    date, merchant, amount, installment,
    type: isCredit ? 'income' : catType,
    category: isCredit ? 'other_income' : category,
    rawText: t,
    confidence: 0,
    sourcePage: line.page,
    sourceLine: t,
    selected: true,
    account: defaultAccount,
  }
}
