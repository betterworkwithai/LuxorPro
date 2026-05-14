/**
 * Evaluates simple math formulas (+, -, *, /) entered in number fields.
 * e.g. "1000*12/4" → 3000, "500+200" → 700
 * Comma is treated as decimal separator (BR locale).
 *
 * Uses a recursive descent parser instead of new Function() / eval.
 */

function parseMath(expr: string): number {
  let pos = 0

  function skipSpaces() {
    while (pos < expr.length && expr[pos] === ' ') pos++
  }

  function parseExpr(): number {
    let left = parseTerm()
    skipSpaces()
    while (pos < expr.length && (expr[pos] === '+' || expr[pos] === '-')) {
      const op = expr[pos++]
      const right = parseTerm()
      left = op === '+' ? left + right : left - right
      skipSpaces()
    }
    return left
  }

  function parseTerm(): number {
    let left = parsePrimary()
    skipSpaces()
    while (pos < expr.length && (expr[pos] === '*' || expr[pos] === '/')) {
      const op = expr[pos++]
      const right = parsePrimary()
      left = op === '*' ? left * right : right !== 0 ? left / right : 0
      skipSpaces()
    }
    return left
  }

  function parsePrimary(): number {
    skipSpaces()
    if (pos < expr.length && expr[pos] === '(') {
      pos++
      const val = parseExpr()
      skipSpaces()
      if (pos < expr.length && expr[pos] === ')') pos++
      return val
    }
    if (pos < expr.length && expr[pos] === '-') {
      pos++
      return -parsePrimary()
    }
    const start = pos
    while (pos < expr.length && /[\d.]/.test(expr[pos])) pos++
    const n = parseFloat(expr.slice(start, pos))
    return isNaN(n) ? 0 : n
  }

  const result = parseExpr()
  return isFinite(result) ? result : 0
}

export function evalFormula(raw: string): number {
  if (!raw) return 0
  const clean = raw.replace(/[R$\s]/g, '').replace(',', '.')
  if (!/^[\d+\-*/().\s]+$/.test(clean)) return parseFloat(clean) || 0
  try {
    return parseMath(clean)
  } catch {
    return parseFloat(clean) || 0
  }
}

export function isFormula(raw: string): boolean {
  // Exclude a plain negative number (single leading minus)
  return /[+\-*/()]/.test(raw.replace(/^-?\d*\.?\d*$/, ''))
}
