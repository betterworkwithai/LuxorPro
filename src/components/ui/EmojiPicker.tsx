// ─── EmojiPicker — curated emoji grid for category icons ────────────────────
import React, { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Dinheiro & Trabalho', emojis: ['💰','💵','💸','💳','🏦','📊','📈','📉','💼','🖥','📱','📞','📧','📌','📎','✏️','📝','🧾','📑','📒','📓','📔','📕','📗','📘','📙','📚'] },
  { label: 'Casa & Moradia',      emojis: ['🏠','🏡','🏘️','🛋','🛏','🪑','🚪','🪟','🧹','🧺','🧼','🧽','🚿','🛁','🚽','🪣','🔑','🔧','🔨','🪛','🪚','🧰','💡','🕯','🛒','📦'] },
  { label: 'Comida & Bebida',     emojis: ['🍔','🍕','🌮','🌯','🥗','🥘','🍝','🍜','🍱','🍣','🍤','🍰','🍪','🍩','🍦','☕','🍵','🍺','🍷','🥂','🍾','🥤','🧃','🥛','🍎','🍌','🥑'] },
  { label: 'Transporte',          emojis: ['🚗','🚙','🚕','🚌','🚎','🏎','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍','🛵','🚲','🛴','✈️','🚁','🚀','🛳','⛵','🚢','⛴','🚆','🚇'] },
  { label: 'Saúde & Esporte',     emojis: ['🏥','💊','💉','🩺','🩹','🦷','👓','🧘','🏋️','🏃','🚴','🏊','⚽','🏀','🏈','⚾','🎾','🏐','🥋','🥊','⛹️','🤸','🧗','🏄','🤽','🤾','🤺'] },
  { label: 'Lazer & Hobbies',     emojis: ['🎮','🕹','🎲','🎯','🎳','🎰','🃏','🧩','🎨','🎭','🎬','🎤','🎧','🎵','🎶','🎸','🎹','🥁','🎺','🎻','📺','📻','📽','🎥','📷','🎟','🎪'] },
  { label: 'Viagem',              emojis: ['✈️','🏖','🏝','🏔','🗺','🧳','🪪','🎫','🎟','🏨','⛺','🎒','🩴','🕶','🌍','🌎','🌏','🌐','🗽','🗼','🏰','🗻','⛩','🕌','⛪','🕍','🕋'] },
  { label: 'Educação',            emojis: ['📚','📖','📕','📗','📘','📙','✏️','🖊','🖌','🖍','📐','📏','🧮','🎓','🏫','🎒','🔬','🔭','🧪','🧬','🧫','📝','💡','🧠','📜','🗒','📔'] },
  { label: 'Pets & Natureza',     emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗'] },
  { label: 'Outros',              emojis: ['📦','🎁','🛍','💎','👑','🎀','🌟','⭐','✨','🔥','💯','⚡','💫','🎉','🎊','🎈','🪅','📍','🚩','🏁','🎌','🪧','🎯','🛡','⚔️','🗝','🔒'] },
]

const ALL_EMOJIS = EMOJI_GROUPS.flatMap(g => g.emojis)

interface Props {
  value: string
  onChange: (emoji: string) => void
  className?: string
}

export function EmojiPicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const filtered: { label: string; emojis: string[] }[] = query.trim()
    ? [{ label: 'Resultados', emojis: ALL_EMOJIS.filter(e => e.includes(query.trim())) }]
    : EMOJI_GROUPS

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="input-dark w-16 h-12 flex items-center justify-center text-2xl hover:bg-[#16161f] transition-colors"
        aria-label="Escolher emoji"
        aria-expanded={open}
      >
        {value || '📦'}
      </button>

      {open && (
        <div className="absolute z-50 mt-2 left-0 w-[320px] max-h-[360px] bg-[#0d0d14] border border-[#1e1e2e] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-fade-in">
          {/* Search */}
          <div className="p-2 border-b border-[#1e1e2e]">
            <input
              autoFocus
              type="text"
              placeholder="Buscar emoji…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="input-dark w-full text-xs py-1.5 px-2"
            />
          </div>
          {/* Grid */}
          <div className="overflow-y-auto p-2 space-y-3">
            {filtered.map(group => (
              <div key={group.label}>
                <p className="text-[10px] uppercase tracking-widest text-[#55556a] font-semibold mb-1.5 px-1">
                  {group.label}
                </p>
                <div className="grid grid-cols-9 gap-0.5">
                  {group.emojis.map((emo, i) => (
                    <button
                      key={`${group.label}-${i}`}
                      type="button"
                      onClick={() => { onChange(emo); setOpen(false); setQuery('') }}
                      className={clsx(
                        'w-7 h-7 flex items-center justify-center text-lg rounded transition-colors',
                        emo === value
                          ? 'bg-[#ff7a00]/20 ring-1 ring-[#ff7a00]/40'
                          : 'hover:bg-[#16161f]',
                      )}
                    >
                      {emo}
                    </button>
                  ))}
                </div>
                {filtered.length === 1 && group.emojis.length === 0 && (
                  <p className="text-xs text-[#55556a] py-3 text-center">Nenhum emoji encontrado</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
