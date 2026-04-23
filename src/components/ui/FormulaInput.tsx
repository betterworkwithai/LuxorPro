import React, { useState } from 'react'
import { clsx } from 'clsx'
import { evalFormula, isFormula } from '../../lib/formulaEval'

interface FormulaInputProps {
  value: string
  onChange: (raw: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

/**
 * A number input that supports basic math formulas.
 * While focused it shows the raw formula; on blur it evaluates and commits.
 * A small "=" badge appears when a formula is active.
 */
export function FormulaInput({ value, onChange, placeholder = '0', className, disabled }: FormulaInputProps) {
  const [focused, setFocused] = useState(false)
  const hasFormula = isFormula(value)
  const displayValue = (!focused && hasFormula) ? String(evalFormula(value).toFixed(2)) : value

  return (
    <div className="relative">
      <input
        className={clsx('input-dark', hasFormula && 'pr-8', className)}
        placeholder={placeholder}
        value={displayValue}
        onChange={e => onChange(e.target.value)}
        onFocus={e => {
          setFocused(true)
          // Restore formula text on focus
          if (hasFormula) e.target.value = value
        }}
        onBlur={() => {
          setFocused(false)
          if (isFormula(value)) {
            const v = evalFormula(value)
            if (v > 0) onChange(v.toFixed(2))
          }
        }}
        disabled={disabled}
      />
      {hasFormula && !focused && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-[#ff7a00] bg-[#ff7a00]/10 px-1 py-0.5 rounded pointer-events-none">
          Æ’
        </span>
      )}
    </div>
  )
}
