// ─────────────────────────────────────────────
//  Brazilian number / date formatters
// ─────────────────────────────────────────────

/**
 * Format currency as R$ 1.234,56
 */
export function formatBRL(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `R$ ${(value / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`
  }
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
}

/**
 * Format USD currency
 */
export function formatUSD(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  })
}

/**
 * Format date as DD/MM/YYYY
 */
export function formatDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/**
 * Format date as "Abr 2025"
 */
export function formatMonthYear(iso: string): string {
  if (!iso) return '—'
  const date = new Date(iso + 'T12:00:00')
  return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
}

/**
 * Today as YYYY-MM-DD
 */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Returns current month (1-12) and year
 */
export function currentMonthYear() {
  const d = new Date()
  return { month: d.getMonth() + 1, year: d.getFullYear() }
}

/**
 * Parse a DD/MM/YYYY string to YYYY-MM-DD
 */
export function parseBrDate(br: string): string | null {
  const m = br.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/**
 * Parse a BRL string like "R$ 1.234,56" or "1.234,56" into a number
 */
export function parseBRL(str: string): number | null {
  const clean = str.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(clean)
  return isNaN(n) ? null : n
}

/**
 * Format a percentage
 */
export function formatPct(value: number, decimals = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

/**
 * Format number with thousands separator
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR')
}

/**
 * Month name in Portuguese
 */
export const PT_MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

export function monthName(month: number): string {
  return PT_MONTHS[month - 1] ?? '—'
}
