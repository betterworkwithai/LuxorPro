// ─── Invoice Pipeline — Invoice Header / Metadata Parser ────────────────────
//
// Extracts metadata from the invoice: issuer, card number, due date,
// total amount, minimum payment, credit limit, and billing period.
// This data is displayed in the review UI and used by the confidence scorer.

import type { ClassifiedLine, InvoiceMetadata } from './types'
import { parseBRLAmount } from './utils'

export function extractMetadata(lines: ClassifiedLine[], rawText: string): InvoiceMetadata {
  const meta: InvoiceMetadata = {}
  const flat = rawText.replace(/\n/g, ' ')

  // ── Issuer detection ────────────────────────────────────────────────────
  if (/nubank|nu\s+pagamentos/i.test(flat))        meta.issuer = 'Nubank'
  else if (/ita[uú]|itaucard/i.test(flat))         meta.issuer = 'Itaú'
  else if (/bradesco/i.test(flat))                 meta.issuer = 'Bradesco'
  else if (/santander/i.test(flat))                meta.issuer = 'Santander'
  else if (/c6\s*bank/i.test(flat))                meta.issuer = 'C6 Bank'
  else if (/inter\s*bank|\binter\b/i.test(flat))   meta.issuer = 'Inter'
  else if (/xp\s*card|xp\s*visa/i.test(flat))      meta.issuer = 'XP'
  else if (/ame\s*digital/i.test(flat))             meta.issuer = 'Ame Digital'
  else if (/pan\s*bank|banco\s*pan/i.test(flat))    meta.issuer = 'Banco Pan'

  // ── Card product ────────────────────────────────────────────────────────
  const productM = flat.match(/(platinum|gold|infinite|black|standard|signature|internacional|nacional)/i)
  if (productM) meta.cardProduct = productM[1]

  // ── Card last four digits ────────────────────────────────────────────────
  const cardM = flat.match(/cart[aã]o\s+(?:final|n[oº°]?\.?|de\s+n[oº°]?\.?)?\s*(\d{4})/i)
    ?? flat.match(/\*{4}\s*(\d{4})/)
    ?? flat.match(/(?:final|n[oº°])[\s.:]*(\d{4})\b/)
  if (cardM) meta.cardLastFour = cardM[1]

  // ── Due date ────────────────────────────────────────────────────────────
  const dueM = flat.match(/vencimento[:\s]+(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{2,4})/i)
    ?? flat.match(/data\s+de\s+venc(?:imento)?[:\s]+(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{2,4})/i)
  if (dueM) {
    const yr = dueM[3].length === 2 ? `20${dueM[3]}` : dueM[3]
    meta.dueDate = `${yr}-${dueM[2].padStart(2,'0')}-${dueM[1].padStart(2,'0')}`
  }

  // ── Billing period ───────────────────────────────────────────────────────
  const periodM = flat.match(/per[ií]odo[:\s]+(\d{2}[\/\.\-]\d{2}[\/\.\-]\d{2,4})\s+(?:a|até)\s+(\d{2}[\/\.\-]\d{2}[\/\.\-]\d{2,4})/i)
    ?? flat.match(/de\s+(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i)
  if (periodM) meta.period = `${periodM[1]} – ${periodM[2]}`

  // ── Total invoice amount ─────────────────────────────────────────────────
  const totalPatterns = [
    /total\s+(da\s+)?fatura[:\s]+R?\$?\s*([\d.]+,\d{2})/i,
    /valor\s+total[:\s]+R?\$?\s*([\d.]+,\d{2})/i,
    /total\s+a\s+pagar[:\s]+R?\$?\s*([\d.]+,\d{2})/i,
    /pagamento\s+total[:\s]+R?\$?\s*([\d.]+,\d{2})/i,
    /fatura\s+(atual|m[êe]s)[:\s]+R?\$?\s*([\d.]+,\d{2})/i,
    /total\s+lan[çc]amentos[:\s]+R?\$?\s*([\d.]+,\d{2})/i,
  ]
  for (const re of totalPatterns) {
    const m = flat.match(re)
    if (m) {
      const v = parseBRLAmount(m[m.length - 1])
      if (v && v > 1) { meta.totalAmount = v; break }
    }
  }

  // ── Minimum payment ─────────────────────────────────────────────────────
  const minM = flat.match(/pagamento\s+m[íi]nimo[:\s]+R?\$?\s*([\d.]+,\d{2})/i)
    ?? flat.match(/m[íi]nimo[:\s]+R?\$?\s*([\d.]+,\d{2})/i)
  if (minM) {
    const v = parseBRLAmount(minM[1])
    if (v) meta.minPayment = v
  }

  // ── Credit limit ────────────────────────────────────────────────────────
  const limitM = flat.match(/limite\s+(?:de\s+)?cr[eé]dito[:\s]+R?\$?\s*([\d.]+,\d{2})/i)
    ?? flat.match(/limite\s+total[:\s]+R?\$?\s*([\d.]+,\d{2})/i)
  if (limitM) {
    const v = parseBRLAmount(limitM[1])
    if (v) meta.creditLimit = v
  }

  return meta
}
