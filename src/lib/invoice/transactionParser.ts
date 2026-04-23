// ─── Invoice Pipeline — Transaction Parser ───────────────────────────────────
//
// Parses individual classified lines into structured ParsedTransaction objects.
// Handles: regular purchases, installments, credits, reversals, and negative amounts.

import type { ClassifiedLine, ParsedTransaction } from './types'
import { parseBRLAmount, niceCase, inferYear, PT_MONTHS, shortId } from './utils'
import { autoCategorize } from './autoCategorize'

const NOISE_DESC_RE = /^[\d\s\/\-\.\,\*\_]+$|^\s*$|^[a-z]{1,2}\s*$/i

/**
 * Attempt to parse a classified transaction line into a ParsedTransaction.
 * Returns null if the line cannot be reliably parsed.
 */
export function parseTransactionLine(
  line: ClassifiedLine,
  currentYear: number,
  currentMonth: number,
  defaultAccount = 'Cartão',
): ParsedTransaction | null {
  const raw = line.text.trim()
  if (!raw || raw.length < 5) return null

  // ── 1. Extract date ──────────────────────────────────────────────────────
  let date: string | null = null
  let rest = raw

  // DD/MM/YYYY or DD/MM/YY
  const fullDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{2,4})/)
  if (fullDate) {
    const [m0, d, mo, y] = fullDate
    const yr = y.length === 2 ? `20${y}` : y
    date = `${yr}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    rest = raw.slice(m0.length).trim()
  }

  // DD/MM (no year)
  if (!date) {
    const s = raw.match(/^(\d{2})\/(\d{2})(?!\/)[\s\t]/)
    if (s) {
      const [m0, d, mo] = s
      const yr = inferYear(parseInt(mo, 10), currentYear, currentMonth)
      date = `${yr}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
      rest = raw.slice(m0.length).trim()
    }
  }

  // "15 JAN" style
  if (!date) {
    const s = raw.match(/^(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|feb|apr|may|aug|sep|oct|dec)/i)
    if (s) {
      const [m0, d, mon] = s
      const mo = PT_MONTHS[mon.toLowerCase()] ?? '01'
      const yr = inferYear(parseInt(mo, 10), currentYear, currentMonth)
      date = `${yr}-${mo}-${d.padStart(2, '0')}`
      rest = raw.slice(m0.length).trim()
    }
  }

  if (!date) return null

  // ── 2. Extract amount ────────────────────────────────────────────────────
  // All amounts on the line; we take the last one (usually the transaction total)
  const amtMatches = [...rest.matchAll(/(?:R\$\s*)?([\d.]+,\d{2})/g)]
  if (amtMatches.length === 0) return null

  const lastAmtMatch = amtMatches[amtMatches.length - 1]
  let amount = parseBRLAmount(lastAmtMatch[1])
  if (!amount || amount < 0.01 || amount > 500_000) return null

  // ── 3. Determine credit / expense direction ──────────────────────────────
  let isCredit = line.lineClass === 'transaction_credit'
  // Parenthetical amounts or leading minus → credit
  if (/\([\d.]+,\d{2}\)/.test(rest)) { isCredit = true }
  if (/^-\s*R?\$?/.test(rest)) { isCredit = true }

  // ── 4. Extract installment info ──────────────────────────────────────────
  let installment: string | undefined
  const instM = rest.match(/\b(\d{2}\/\d{2})\b/)
  if (instM) installment = instM[1]

  // ── 5. Build merchant description ────────────────────────────────────────
  const amtPos = rest.lastIndexOf(lastAmtMatch[0])
  let merchant = rest.slice(0, amtPos)
    .replace(/\b\d{2}\/\d{2}\b/g, '')     // remove installment fraction
    .replace(/\*[A-Z0-9]+/g, '')           // remove tracking codes
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\W]+|[\W]+$/g, '')
    .trim()

  if (!merchant || merchant.length < 2) return null
  if (NOISE_DESC_RE.test(merchant)) return null
  if (/^(total|subtot|saldo|limite|juros|iof|multa|encargo)/i.test(merchant)) return null

  merchant = niceCase(merchant)

  // ── 6. Categorize ────────────────────────────────────────────────────────
  const { category, type: catType } = autoCategorize(merchant)
  const type: ParsedTransaction['type'] = isCredit ? 'income' : catType

  return {
    id: shortId(),
    date,
    merchant,
    amount,
    installment,
    type,
    category: isCredit ? (category === 'outros' ? 'other_income' : category) : category,
    rawText: raw,
    confidence: 0,   // will be set by confidenceScorer
    sourcePage: line.page,
    sourceLine: raw,
    selected: true,
    account: defaultAccount,
  }
}

/**
 * Safety-net: split a line that looks like two merged transactions.
 *
 * A merged line has the shape: <merchant1> <amount1> <merchant2> [amount2]
 * We split right after <amount1> when there is "enough text" following it
 * that cannot plausibly be an installment fraction or a trailing annotation.
 *
 * Examples that ARE split:
 *   "Amazon Br 499,27 Uber * Pending"       → ["Amazon Br 499,27", "Uber * Pending"]
 *   "Mercado Livre 89,90 iFood 34,50"       → ["Mercado Livre 89,90", "iFood 34,50"]
 *
 * Examples that are NOT split (false-positive guards):
 *   "Amazon Br 499,27 01/12"                → single installment line (after = "01/12" → digits)
 *   "Netflix 39,90 em 1x"                   → short trailing note (< 6 chars)
 */
function splitMergedLine(line: ClassifiedLine): ClassifiedLine[] {
  const text = line.text

  // Find every BRL-format amount in the line
  const amtRe = /([\d.]+,\d{2})/g
  let match: RegExpExecArray | null

  while ((match = amtRe.exec(text)) !== null) {
    const amtEnd = match.index + match[0].length
    const after = text.slice(amtEnd).trim()

    // Nothing meaningful after this amount → not a merge
    if (!after || after.length < 6) continue

    // If what follows starts with digits only (e.g. installment "01/12") → not a merge
    if (/^\d/.test(after)) continue

    // If what follows looks like a genuine second merchant (starts with a letter, ≥6 chars)
    if (/^[A-Za-záéíóúàâêôãõüç]/.test(after) && after.replace(/\s/g, '').length >= 5) {
      const part1 = text.slice(0, amtEnd).trim()
      if (part1.length < 4) continue  // first part too short to be a real transaction

      return [
        { ...line, text: part1 },
        { ...line, text: after, lineClass: line.lineClass },
      ]
    }
  }

  return [line]
}

/**
 * Parse a batch of classified lines. Skips non-transaction lines automatically.
 * Applies the merged-line splitter before parsing each line.
 */
export function parseTransactionLines(
  lines: ClassifiedLine[],
  currentYear: number,
  currentMonth: number,
  defaultAccount = 'Cartão',
): ParsedTransaction[] {
  const results: ParsedTransaction[] = []

  for (const line of lines) {
    if (
      line.lineClass !== 'transaction_expense' &&
      line.lineClass !== 'transaction_credit' &&
      line.lineClass !== 'installment'
    ) continue

    // Split before parsing — handles PDFs where adjacent rows were merged
    const candidates = splitMergedLine(line)

    for (const candidate of candidates) {
      const tx = parseTransactionLine(candidate, currentYear, currentMonth, defaultAccount)
      if (tx) results.push(tx)
    }
  }

  return results
}
