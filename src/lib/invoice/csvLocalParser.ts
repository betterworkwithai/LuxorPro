// ─── Local CSV/TSV parser ────────────────────────────────────────────────────
// Parses pasted CSV text (date, description, value) into ParsedTransaction[]
// without calling any AI. Used as a free alternative to the AI pipeline.

import { nanoid } from 'nanoid'
import { autoCategorize } from './autoCategorize'
import type { ParsedTransaction } from './types'

interface ParseResult {
  transactions: ParsedTransaction[]
  warnings: string[]
}

const HEADER_HINTS = {
  date:   ['data', 'date', 'dt', 'dia'],
  desc:   ['lançamento', 'lancamento', 'descrição', 'descricao', 'description', 'descrição do lançamento', 'histórico', 'historico', 'name', 'merchant'],
  amount: ['valor', 'amount', 'value', 'montante', 'quantia'],
}

function detectDelimiter(line: string): string {
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestCount = 0
  for (const c of candidates) {
    const count = (line.match(new RegExp(`\\${c}`, 'g')) ?? []).length
    if (count > bestCount) { bestCount = count; best = c }
  }
  return best
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === delim && !inQuotes) {
      out.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map(s => s.trim().replace(/^"|"$/g, ''))
}

function findColumnIndex(headers: string[], hints: string[]): number {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const hint of hints) {
    const idx = lower.indexOf(hint)
    if (idx >= 0) return idx
  }
  // Fuzzy: contains
  for (const hint of hints) {
    const idx = lower.findIndex(h => h.includes(hint))
    if (idx >= 0) return idx
  }
  return -1
}

function parseDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // BR: DD/MM/YYYY
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  // BR short: DD/MM/YY
  const brShort = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (brShort) {
    const yr = parseInt(brShort[3], 10)
    const fullYr = yr < 50 ? 2000 + yr : 1900 + yr
    return `${fullYr}-${brShort[2].padStart(2, '0')}-${brShort[1].padStart(2, '0')}`
  }
  // US: MM/DD/YYYY (heuristic — month must be ≤12, day ≤31)
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) {
    const m = parseInt(us[1], 10)
    const d = parseInt(us[2], 10)
    if (m <= 12 && d <= 31) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
  }
  // Native parse fallback
  const dt = new Date(s)
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)
  return null
}

function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/[R$\s]/g, '')
  if (!s) return null
  // Detect format: "1.234,56" (BR) vs "1,234.56" (US) vs "1234.56" or "-1234.56"
  const hasComma = s.includes(',')
  const hasDot   = s.includes('.')
  let normalized: string

  if (hasComma && hasDot) {
    // Mixed → assume BR if comma is last (1.234,56), US if dot is last (1,234.56)
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      normalized = s.replace(/\./g, '').replace(',', '.')
    } else {
      normalized = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    // Only comma — treat as decimal separator (BR style)
    normalized = s.replace(',', '.')
  } else {
    normalized = s
  }
  const n = parseFloat(normalized)
  return isNaN(n) ? null : n
}

export function parseLocalCSV(text: string, defaultAccount = 'Cartão'): ParseResult {
  const warnings: string[] = []
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return { transactions: [], warnings: ['Texto vazio'] }
  }

  const delim = detectDelimiter(lines[0])
  const headerCells = splitCsvLine(lines[0], delim)

  const dateIdx   = findColumnIndex(headerCells, HEADER_HINTS.date)
  const descIdx   = findColumnIndex(headerCells, HEADER_HINTS.desc)
  const amountIdx = findColumnIndex(headerCells, HEADER_HINTS.amount)

  // Decide if the first line is a header (matched ≥2 columns) or data
  const hasHeader = [dateIdx, descIdx, amountIdx].filter(i => i >= 0).length >= 2

  // Final column positions — fall back to convention 0/1/2 if no header
  const dCol = hasHeader && dateIdx   >= 0 ? dateIdx   : 0
  const nCol = hasHeader && descIdx   >= 0 ? descIdx   : 1
  const vCol = hasHeader && amountIdx >= 0 ? amountIdx : 2

  if (!hasHeader) {
    warnings.push('Cabeçalho não detectado — assumindo ordem: data, descrição, valor')
  }

  const dataLines = hasHeader ? lines.slice(1) : lines
  const transactions: ParsedTransaction[] = []

  for (const [i, line] of dataLines.entries()) {
    const cells = splitCsvLine(line, delim)
    if (cells.length < 2) {
      warnings.push(`Linha ${i + (hasHeader ? 2 : 1)} ignorada — poucas colunas`)
      continue
    }

    const dateStr   = cells[dCol] ?? ''
    const descStr   = (cells[nCol] ?? '').trim()
    const amountStr = cells[vCol] ?? ''

    const date   = parseDate(dateStr)
    const amount = parseAmount(amountStr)

    if (!date || !descStr || amount === null) {
      warnings.push(`Linha ${i + (hasHeader ? 2 : 1)} ignorada — dados incompletos`)
      continue
    }

    // Sign convention: positive = expense, negative = income (use absolute value)
    const type: 'expense' | 'income' = amount < 0 ? 'income' : 'expense'
    const absAmount = Math.abs(amount)

    if (absAmount === 0) {
      warnings.push(`Linha ${i + (hasHeader ? 2 : 1)} ignorada — valor zero`)
      continue
    }

    const auto = autoCategorize(descStr)
    const category = auto.type === type
      ? auto.category
      : (type === 'income' ? 'other_income' : 'outros')

    transactions.push({
      id:           nanoid(),
      date,
      merchant:     descStr,
      amount:       absAmount,
      type,
      category,
      rawText:      line,
      confidence:   1,
      sourcePage:   1,
      sourceLine:   line,
      selected:     true,
      account:      defaultAccount,
    })
  }

  return { transactions, warnings }
}
