// ─── Invoice Pipeline — Line Classifier ─────────────────────────────────────
//
// Assigns a semantic class to each reconstructed line.
// Only lines classified as transaction_expense, transaction_credit, or installment
// should be passed to the transaction parser.

import type { ReconstructedLine, ClassifiedLine, LineClass } from './types'

// ── Patterns that open a transaction section ───────────────────────────────
const SECTION_OPEN_RE =
  /DATA\s+ESTABELECIMENTO|COMPRAS\s+E\s+SAQUES|DATA\s+HIST[ÓO]RICO\s+VALOR|MOVIMENTA[ÇC][ÃA]O\s+DA\s+CONTA|LANÇAMENTOS\s+(?:DA\s+)?FATURA|DETALHAMENTO\s+(?:DA\s+)?FATURA|COMPRAS\s+PARCELADAS|TRANSAÇÕES\s+(?:NO\s+)?PERODO/i

// ── Patterns for lines that should NEVER become transactions ───────────────
const INVOICE_TOTAL_RE =
  /total\s+(da\s+)?fatura|total\s+(dos\s+)?lan[çc]amentos?|total\s+a\s+pagar|pagamento\s+total|fatura\s+(atual|m[êe]s)/i

const MIN_PAYMENT_RE =
  /pagamento\s+m[íi]nimo|valor\s+m[íi]nimo|m[íi]nimo\s+a\s+pagar/i

const BALANCE_INFO_RE =
  /saldo\s+(anterior|devedor|disponível|final|credor)|limite\s+(de\s+crédito|disponível|utilizado|total)|valor\s+(total\s+)?financiado|cashback|fgts/i

const NOISE_RE = new RegExp([
  'subtotal', 'resumo\\s?(da\\s?)?fatura', 'resumo\\s?do\\s?per[ií]odo',
  '^juros', 'juros\\s?(do\\s?)?(rot[aá]tivo|mora|atraso)',
  '^iof', '^multa\\s', '^encargo', '^mora\\s', '^tarifa', '^anuidade',
  'valor\\s?solicitado', '^simulação', 'cet\\s?(máximo|da)',
  '^cpf', '^cnpj', 'vencimento\\s?da\\s?fatura', 'fatura\\s?(fechada|vencida)',
  '^data\\s+descri[çc]', '^descri[çc][aã]o\\s+valor',
  '^[LPSC=+*]\\s+(total|saldo|juros|iof|multa|encargo)',
].join('|'), 'i')

const HEADER_RE =
  /^(banco|cartão|fatura|extrato|demonstrativo|nota\s+de\s+corretagem|conta\s+corrente|agência|agencia|ag\.\s|\d{4}\s+\d{4}\s+\d{4})/i

const FOOTER_RE =
  /página\s+\d+\s+de\s+\d+|^página\s+\d+$|^pag\s+\d+|^p\.\s*\d+\s*\/\s*\d+/i

const METADATA_RE =
  /vencimento|data\s+(de\s+)?venc|fechamento|periodo|per[ií]odo|portador|titular|cart[aã]o\s+n|final\s+\d{4}/i

// ── Transaction line detection ─────────────────────────────────────────────
// Strong signal: line starts with DD/MM (with or without year)
const TX_DATE_START_RE = /^\d{2}\/\d{2}(?:\/\d{2,4})?[\s\t]/

// Credit / reversal signals
const CREDIT_SIGNAL_RE = /estorno|crédito|reembolso|cashback|devolução|credit/i

// Installment signal: "XX/YY parcela" or "PARC XX/YY"
const INSTALLMENT_RE = /\b\d{2}\/\d{2}\b|\bparc(?:ela)?\s*\d+/i

export function classifyLine(line: ReconstructedLine): ClassifiedLine {
  const t = line.text.trim()

  if (!t || t.length < 2)                     return { ...line, lineClass: 'noise' }
  if (FOOTER_RE.test(t))                      return { ...line, lineClass: 'footer' }
  if (HEADER_RE.test(t))                      return { ...line, lineClass: 'header' }
  if (INVOICE_TOTAL_RE.test(t))               return { ...line, lineClass: 'invoice_total' }
  if (MIN_PAYMENT_RE.test(t))                 return { ...line, lineClass: 'payment_minimum' }
  if (BALANCE_INFO_RE.test(t))                return { ...line, lineClass: 'balance_info' }
  if (NOISE_RE.test(t))                       return { ...line, lineClass: 'noise' }
  if (METADATA_RE.test(t) && !TX_DATE_START_RE.test(t)) return { ...line, lineClass: 'metadata' }

  if (TX_DATE_START_RE.test(t)) {
    // Check for credits/reversals
    if (CREDIT_SIGNAL_RE.test(t)) return { ...line, lineClass: 'transaction_credit' }
    // Check for negative amount (credit)
    if (/\([\d.,]+\)|^-\s*R?\$?\s*[\d.,]+/.test(t)) return { ...line, lineClass: 'transaction_credit' }
    // Installment inside transaction
    if (INSTALLMENT_RE.test(t.slice(6))) return { ...line, lineClass: 'installment' }
    return { ...line, lineClass: 'transaction_expense' }
  }

  return { ...line, lineClass: 'noise' }
}

/**
 * Classify a list of lines, using section awareness:
 * Lines inside known transaction sections are treated as potential transactions
 * even if they lack a date prefix (some banks omit the date on continuation lines).
 */
export function classifyLines(lines: ReconstructedLine[]): ClassifiedLine[] {
  let inSection = false
  const classified: ClassifiedLine[] = []

  for (const line of lines) {
    // Detect section open (transaction table header)
    if (SECTION_OPEN_RE.test(line.text)) {
      inSection = true
      classified.push({ ...line, lineClass: 'header' })
      continue
    }

    // Detect section close (totals and subsequent section headers)
    if (inSection && INVOICE_TOTAL_RE.test(line.text)) {
      inSection = false
      classified.push({ ...line, lineClass: 'invoice_total' })
      continue
    }

    const cls = classifyLine(line)

    // If we're inside a section, upgrade 'noise' lines that have a monetary amount
    // — they might be continuation/description lines for the previous transaction
    if (inSection && cls.lineClass === 'noise' && /[\d.]+,\d{2}/.test(line.text)) {
      classified.push({ ...line, lineClass: 'transaction_expense' })
      continue
    }

    classified.push(cls)
  }

  return classified
}
