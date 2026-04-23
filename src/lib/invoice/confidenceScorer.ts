// ─── Invoice Pipeline — Confidence Scorer ───────────────────────────────────
//
// Assigns a 0–1 confidence score to each parsed transaction.
// High confidence (≥0.7): follows as normal suggestion.
// Medium confidence (0.4–0.69): highlighted for review.
// Low confidence (<0.4): flagged as suspicious.

import type { ParsedTransaction, InvoiceMetadata } from './types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const VALID_DATE_RANGE = { min: new Date('2010-01-01').getTime(), max: Date.now() + 90 * 86400_000 }

function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false
  const t = new Date(date).getTime()
  return t >= VALID_DATE_RANGE.min && t <= VALID_DATE_RANGE.max
}

function isReasonableAmount(amount: number): boolean {
  return amount > 0.01 && amount < 500_000
}

function isMeaningfulMerchant(merchant: string): boolean {
  if (!merchant || merchant.length < 3) return false
  // Purely numeric → noise
  if (/^\d+$/.test(merchant.replace(/\s/g, ''))) return false
  // All special chars → noise
  if (/^[\W_]+$/.test(merchant)) return false
  return true
}

/** Score a single transaction. Returns a new object with updated confidence. */
export function scoreTransaction(
  tx: ParsedTransaction,
  metadata: InvoiceMetadata,
): ParsedTransaction {
  let score = 0

  // Date validity (0.35)
  if (isValidDate(tx.date)) score += 0.35

  // Amount reasonableness (0.30)
  if (isReasonableAmount(tx.amount)) score += 0.30

  // Merchant quality (0.20)
  if (isMeaningfulMerchant(tx.merchant)) score += 0.20

  // Consistency with invoice metadata (0.15)
  // If we know the invoice total, check that this amount is not larger than it
  if (metadata.totalAmount && tx.amount <= metadata.totalAmount) {
    score += 0.10
  } else if (!metadata.totalAmount) {
    score += 0.10  // no total to compare against — don't penalise
  }
  // If we know the invoice period and the transaction date falls within it → bonus
  if (metadata.period && tx.date) {
    score += 0.05  // simplified — just reward having a period at all
  }

  // Raw text quality: penalise if rawText is very short or looks like noise
  if (tx.rawText && tx.rawText.length > 10) score = Math.min(1, score + 0.0)
  else score = Math.max(0, score - 0.05)

  return { ...tx, confidence: Math.round(score * 100) / 100 }
}

/** Score an array of transactions in bulk. */
export function scoreTransactions(
  txs: ParsedTransaction[],
  metadata: InvoiceMetadata,
): ParsedTransaction[] {
  return txs.map(tx => scoreTransaction(tx, metadata))
}

/** Human-readable label for a confidence score. */
export function confidenceLabel(score: number): 'alta' | 'média' | 'baixa' {
  if (score >= 0.7) return 'alta'
  if (score >= 0.4) return 'média'
  return 'baixa'
}

/** Tailwind color class for a confidence score. */
export function confidenceColor(score: number): string {
  if (score >= 0.7) return 'text-[#00ff88]'
  if (score >= 0.4) return 'text-[#f59e0b]'
  return 'text-[#ff4466]'
}
