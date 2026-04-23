import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus, Check } from 'lucide-react'
import { useStore } from '../../store/useStore'

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
  /** Optional first "all" option (for filters) */
  allLabel?: string
  placeholder?: string
}

/**
 * Custom account/institution dropdown.
 * Lists only user-added institutions. The "Personalizado…" action
 * reveals an inline text input to type and save a new institution.
 */
export function AccountSelect({ value, onChange, className = 'input-dark', allLabel, placeholder = 'Selecionar…' }: Props) {
  const { settings, saveCustomInstitution } = useStore()
  const institutions = [...(settings.customInstitutions ?? [])].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open && !adding) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        if (adding && !draft.trim()) setAdding(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, adding, draft])

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  const startAdding = () => {
    setDraft('')
    setAdding(true)
    setOpen(false)
  }

  const commit = async () => {
    const name = draft.trim()
    if (!name) {
      setAdding(false)
      return
    }
    await saveCustomInstitution(name)
    onChange(name)
    setAdding(false)
    setDraft('')
  }

  const cancel = () => {
    setAdding(false)
    setDraft('')
  }

  const select = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  if (adding) {
    return (
      <div className="flex gap-1">
        <input
          ref={inputRef}
          type="text"
          className={className}
          placeholder="Nome da nova instituição"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { e.preventDefault(); cancel() }
          }}
          onBlur={commit}
        />
        <button
          type="button"
          onClick={cancel}
          className="px-2 text-xs text-[#8a8aa0] hover:text-[#e8e8f0]"
          aria-label="Cancelar"
        >
          ✕
        </button>
      </div>
    )
  }

  const displayLabel = value || (allLabel ?? placeholder)
  const isPlaceholder = !value

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${className} flex items-center justify-between text-left w-full`}
      >
        <span className={isPlaceholder ? 'text-[#55556a]' : ''}>{displayLabel}</span>
        <ChevronDown className="w-4 h-4 text-[#55556a] shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 bg-[#16161f] border border-[#1e1e2e] rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {allLabel !== undefined && (
            <button
              type="button"
              onClick={() => select('')}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#8888aa] hover:bg-[#1e1e2e] hover:text-[#e8e8f0] text-left"
            >
              <span>{allLabel}</span>
              {value === '' && <Check className="w-3.5 h-3.5 text-[#00d4ff]" />}
            </button>
          )}
          {institutions.length === 0 && allLabel === undefined && (
            <div className="px-3 py-2 text-xs text-[#55556a] italic">Nenhuma instituição adicionada</div>
          )}
          {institutions.map(a => (
            <button
              key={a}
              type="button"
              onClick={() => select(a)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#e8e8f0] hover:bg-[#1e1e2e] text-left"
            >
              <span>{a}</span>
              {value === a && <Check className="w-3.5 h-3.5 text-[#00d4ff]" />}
            </button>
          ))}
          <button
            type="button"
            onClick={startAdding}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#ff7a00] hover:bg-[#ff7a00]/10 border-t border-[#1e1e2e] text-left"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar nova instituição</span>
          </button>
        </div>
      )}
    </div>
  )
}
