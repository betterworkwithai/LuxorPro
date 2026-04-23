/**
 * Evaluates simple math formulas (+, -, *, /) entered in number fields.
 * e.g. "1000*12/4" â†’ 3000, "500+200" â†’ 700
 * Comma is treated as decimal separator (BR locale).
 */
export function evalFormula(raw: string): number {
  if (!raw) return 0
  const clean = raw.replace(/[R$\s]/g, '').replace(',', '.')
  if (!/^[\d+\-*/().\s]+$/.test(clean)) return parseFloat(clean) || 0
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${clean})`)()
    return typeof result === 'number' && isFinite(result) ? result : 0
  } catch {
    return parseFloat(clean) || 0
  }
}

export function isFormula(raw: string): boolean {
  // Exclude a plain negative number (single leading minus)
  return /[+\-*/()]/.test(raw.replace(/^-?\d*\.?\d*$/, ''))
}
