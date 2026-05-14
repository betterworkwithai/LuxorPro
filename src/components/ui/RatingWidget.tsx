import React, { useEffect, useState } from 'react'
import { Star, Loader2, CheckCircle } from 'lucide-react'
import { supabase, SUPABASE_CONFIGURED } from '../../lib/supabase'

const LABELS = ['', 'Muito ruim', 'Ruim', 'Ok', 'Bom', 'Excelente!']

export function RatingWidget() {
  const [savedRating,   setSavedRating]   = useState(0)
  const [savedComment,  setSavedComment]  = useState('')
  const [selected,      setSelected]      = useState(0)
  const [comment,       setComment]       = useState('')
  const [hovered,       setHovered]       = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [justSaved,     setJustSaved]     = useState(false)

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) { setLoading(false); return }

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { setLoading(false); return }

      supabase
        .from('app_ratings')
        .select('rating, comment')
        .eq('user_id', data.session.user.id)
        .maybeSingle()
        .then(({ data: row }) => {
          if (row) {
            setSavedRating(row.rating)
            setSelected(row.rating)
            const c = row.comment ?? ''
            setSavedComment(c)
            setComment(c)
          }
          setLoading(false)
        })
    })
  }, [])

  const isDirty = selected > 0 && (selected !== savedRating || comment.trim() !== savedComment)

  const handleSave = async () => {
    if (!selected || saving) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { error } = await supabase
        .from('app_ratings')
        .upsert(
          { user_id: session.user.id, rating: selected, comment: comment.trim() || null, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        )

      if (!error) {
        setSavedRating(selected)
        setSavedComment(comment.trim())
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  const display = hovered || selected

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-[#55556a]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#55556a]">Como você avalia o Luxor Pro até agora?</p>

      {/* Star selector */}
      <div
        className="flex items-center gap-2"
        onMouseLeave={() => setHovered(0)}
      >
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onMouseEnter={() => setHovered(star)}
            onClick={() => setSelected(star)}
            className="transition-transform hover:scale-110 active:scale-95 focus:outline-none"
            aria-label={`${star} estrela${star > 1 ? 's' : ''}`}
          >
            <Star
              className="w-8 h-8"
              fill={star <= display ? '#ff7a00' : 'transparent'}
              stroke={star <= display ? '#ff7a00' : '#2a2a3e'}
              strokeWidth={1.5}
            />
          </button>
        ))}

        {display > 0 && (
          <span className="ml-1 text-sm font-semibold text-[#ff7a00]">
            {LABELS[display]}
          </span>
        )}
      </div>

      {/* Comment textarea — only shown after a star is selected */}
      {selected > 0 && (
        <div>
          <label className="text-xs text-[#8888aa] mb-1.5 block">
            Comentário <span className="text-[#3a3a4e]">(opcional)</span>
          </label>
          <textarea
            className="input-dark w-full min-h-[80px] resize-y"
            placeholder="O que achou? O que podemos melhorar?"
            value={comment}
            maxLength={500}
            onChange={e => setComment(e.target.value)}
          />
          <p className="text-[11px] text-[#3a3a4e] mt-1 text-right">{comment.length}/500</p>
        </div>
      )}

      {/* CTA row */}
      <div className="flex items-center gap-3 flex-wrap">
        {SUPABASE_CONFIGURED ? (
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="btn-primary flex items-center gap-2 disabled:opacity-40"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</>
            ) : justSaved ? (
              <><CheckCircle className="w-4 h-4" /> Avaliação salva!</>
            ) : (
              savedRating > 0 ? 'Atualizar Avaliação' : 'Enviar Avaliação'
            )}
          </button>
        ) : (
          <p className="text-xs text-[#55556a]">Avaliações disponíveis após login com sua conta.</p>
        )}

        {justSaved && (
          <p className="text-xs text-[#00ff88]">Obrigado pelo feedback! ⭐</p>
        )}
      </div>

      {savedRating > 0 && !justSaved && (
        <p className="text-[11px] text-[#3a3a4e]">
          Sua avaliação atual: {'⭐'.repeat(savedRating)} — você pode atualizá-la a qualquer momento.
        </p>
      )}
    </div>
  )
}
