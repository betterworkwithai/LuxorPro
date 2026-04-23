// ─── Invoice Pipeline — Legacy Parsers ──────────────────────────────────────
//
// Handles document types that don't use the spatial pipeline:
//   - Payslips (Demonstrativo de Pagamento)
//   - Investment brokerage notes (Nota de Corretagem)
//
// These parsers work directly on raw text strings and return ParsedTransaction
// objects compatible with the rest of the pipeline.

import type { ParsedTransaction } from './types'
import { parseBRLAmount, niceCase, shortId, dedup } from './utils'
import { autoCategorize } from './autoCategorize'

// ── Payslip code→type mapping (Itaú CNAB codes) ──────────────────────────
const PAYSLIP_CODE_TYPES: Record<string, 'income' | 'expense' | 'skip'> = {
  '001591': 'income',  '001593': 'income',  '003004': 'income',
  '003012': 'income',  '003498': 'income',  '005004': 'income',
  '005400': 'income',  '005993': 'income',  '005999': 'income',
  '006666': 'income',  '006791': 'income',  '006842': 'income',
  '001687': 'expense', '004028': 'expense', '004244': 'expense',
  '004255': 'expense', '005172': 'expense', '005947': 'expense',
  '008142': 'expense', '008418': 'expense', '008470': 'expense',
  '008475': 'expense', '008476': 'expense', '008950': 'expense',
  '004984': 'expense',
  '001599': 'skip',    '001611': 'skip',    '001612': 'skip',
  '001617': 'skip',    '002599': 'skip',    '002999': 'skip',
  '004420': 'skip',    '009018': 'skip',    '010006': 'skip',
  '010078': 'skip',    '015381': 'skip',
}

const PAYSLIP_SKIP_LINE_RE =
  /total\s+(proventos?|descontos?|remuner|dedu[çc])|pagamento\s+l[ií]quido|sal\.\s*contrib|base\s*fgts|te[oó]rico|fgts\s*dev|^(c[oó]digo|descri[çc]|base|unidade?|proventos?|descontos?)\b/i

type ExtType = 'income' | 'expense'

function parsePayslip(text: string, defaultAccount: string): ParsedTransaction[] {
  if (!/demonstrativo\s+de\s+pagamento/i.test(text)) return []

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1)
  const flatText = text.replace(/\n/g, ' ')

  // Extract payment date
  let payDate = new Date().toISOString().split('T')[0]
  const dtPago = flatText.match(/dt\.?\s*pago[:\s]+(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/i)
  if (dtPago) {
    payDate = `${dtPago[3]}-${dtPago[2]}-${dtPago[1]}`
  } else {
    const vig = flatText.match(/vig[eê]ncia[:\s]+(\d{2})[\/\.\-](\d{4})/i)
    if (vig) payDate = `${vig[2]}-${vig[1]}-27`
  }

  const results: ParsedTransaction[] = []

  for (const line of lines) {
    if (PAYSLIP_SKIP_LINE_RE.test(line)) continue

    const allAmounts = [...line.matchAll(/([\d.]+,\d{2})/g)]
    if (allAmounts.length === 0) continue

    const monetary = allAmounts.filter(m => {
      const n = parseBRLAmount(m[1])
      return n !== null && !(n <= 31 && m[1].endsWith(',00'))
    })
    const pick = (monetary.length > 0 ? monetary : allAmounts).slice(-1)[0]
    const amount = parseBRLAmount(pick[1])
    if (!amount || amount < 0.50) continue

    const codeRaw = line.match(/^(\d{6}[A-Z]?)\s+/)?.[1] ?? null
    const code = codeRaw ? codeRaw.replace(/[A-Z]$/, '') : null

    const desc = line
      .replace(/^\d{6}[A-Z]?\s+/, '')
      .replace(/[\d.]+,\d{2}/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()

    if (!desc || desc.length < 3) continue
    if (/^\d[\d\s]*$/.test(desc)) continue

    let txType: 'income' | 'expense' | 'skip' = 'skip'
    if (code && PAYSLIP_CODE_TYPES[code] !== undefined) {
      txType = PAYSLIP_CODE_TYPES[code]
    } else {
      const d = desc
      if (/sal[aá]rio|comiss[aã]o|plr|particip|resultado|pcr|f[eé]rias|13[oº]|d[eé]cimo|ajuda.?custo|teletrabalho|remunera/i.test(d)) txType = 'income'
      else if (/inss|imposto|irrf|pgbl|plano|odonto|m[eé]dic|assist|copart|taxa\s+negoc|contrib\s+negoc/i.test(d)) txType = 'expense'
    }
    if (txType === 'skip') continue

    const dl = desc.toLowerCase()
    let category: string
    let extType: ExtType

    if (txType === 'income') {
      extType = 'income'
      category = /plr|particip|resultado|pcr|bônus|bonus|comiss[aã]o|cargo/i.test(dl) ? 'other_income' : 'salary'
    } else {
      extType = 'expense'
      if (/inss|pgbl|previdên/i.test(dl)) category = 'imposto'
      else if (/imposto|irrf|renda/i.test(dl)) category = 'imposto'
      else if (/plano|odonto|m[eé]dic|assist|saúde|copart/i.test(dl)) category = 'saude'
      else category = 'outros'
    }

    results.push({
      id: shortId(),
      date: payDate,
      merchant: niceCase(desc),
      amount,
      type: extType,
      category,
      rawText: line,
      confidence: 0.85,   // payslip items have high confidence (structured format)
      sourcePage: 1,
      sourceLine: line,
      selected: true,
      account: defaultAccount,
    })
  }

  return dedup(results)
}

// ── Investment brokerage statement ─────────────────────────────────────────
function parseInvestmentStatement(text: string, defaultAccount: string): ParsedTransaction[] {
  const isInvestment =
    /nota\s+de\s+corretagem|neg[oó]cios\s+realizados|liquidação|bovespa|b3\s*\-|extrato\s+de\s+investimentos?/i.test(text)
  if (!isInvestment) return []

  const results: ParsedTransaction[] = []
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3)
  const currentYear = new Date().getFullYear()

  for (const line of lines) {
    if (/^(data|tipo|ativo|ticker|qtd|preço|valor|c[ód]|natureza|prazo|vencimento|saldo|total|taxa|corretagem|emolumento|liquidação|imposto|irrf|líquido)/i.test(line)) continue

    const dateM = line.match(/^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?/)
    if (!dateM) continue

    const [, d, mo, y] = dateM
    const yr = y ? (y.length === 2 ? `20${y}` : y) : String(currentYear)
    const date = `${yr}-${mo}-${d}`
    const rest = line.slice(dateM[0].length).trim()

    const opM = rest.match(/\b(C|V|COMPRA|VENDA)\b/i)
    const isBuy = opM ? /^(C|COMPRA)$/i.test(opM[1]) : true

    const amounts = [...rest.matchAll(/([\d.]+,\d{2})/g)]
    if (amounts.length === 0) continue
    const amount = parseBRLAmount(amounts[amounts.length - 1][1])
    if (!amount || amount < 1) continue

    const descM = rest.replace(/\b(C|V|COMPRA|VENDA)\b/i, '').match(/^([A-ZÀ-Ú][A-ZÀ-Ú0-9\s\.\-]{1,40}?)[\s\d]/)
    const description = descM ? niceCase(descM[1].trim()) : 'Operação'

    results.push({
      id: shortId(),
      date,
      merchant: `${isBuy ? 'Compra' : 'Venda'}: ${description}`,
      amount,
      type: 'expense',
      category: 'investimento',
      rawText: line,
      confidence: 0.80,
      sourcePage: 1,
      sourceLine: line,
      selected: true,
      account: defaultAccount,
    })
  }

  return dedup(results)
}

/**
 * Entry point for legacy parsers. Returns empty array if the document
 * is not a payslip or investment statement.
 */
export function parsePayslipText(rawText: string, defaultAccount: string): ParsedTransaction[] {
  const payslip = parsePayslip(rawText, defaultAccount)
  if (payslip.length > 0) return payslip

  const investment = parseInvestmentStatement(rawText, defaultAccount)
  if (investment.length > 0) return investment

  return []
}
