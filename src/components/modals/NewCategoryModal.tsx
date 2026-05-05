import React, { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { Modal, ModalFooter } from '../ui/Modal'
import { EmojiPicker } from '../ui/EmojiPicker'
import { useStore } from '../../store/useStore'
import type { Category } from '../../lib/types'

const EMPTY_CAT = { name: '', icon: '📦', color: '#ff7a00', type: 'expense' as Category['type'] }

interface Props {
  open: boolean
  onClose: () => void
  /** Pre-fills the form. Useful when opening from "Nova categoria" inside a typed dropdown. */
  defaultType?: Category['type']
  /** Called after a successful create with the newly assigned category id. */
  onCreated?: (categoryId: string) => void
  /** When provided, the modal edits an existing custom category instead of creating one. */
  editCategory?: Category | null
}

export function NewCategoryModal({ open, onClose, defaultType, onCreated, editCategory }: Props) {
  const { addCustomCategory, updateCustomCategory } = useStore()
  const isEdit = !!editCategory
  const [form, setForm] = useState({ ...EMPTY_CAT, type: defaultType ?? EMPTY_CAT.type })
  const upd = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!open) return
    if (editCategory) {
      setForm({
        name:  editCategory.name,
        icon:  editCategory.icon,
        color: editCategory.color,
        type:  editCategory.type,
      })
    } else {
      setForm({ ...EMPTY_CAT, type: defaultType ?? EMPTY_CAT.type })
    }
  }, [open, defaultType, editCategory])

  const handleSave = async () => {
    if (!form.name.trim()) return
    if (isEdit && editCategory) {
      await updateCustomCategory(editCategory.id, { ...form, name: form.name.trim() })
      onCreated?.(editCategory.id)
    } else {
      const id = await addCustomCategory({ ...form, name: form.name.trim() })
      onCreated?.(id)
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar Categoria' : 'Nova Categoria'} size="sm">
      <div className="px-6 py-5 space-y-4">
        {/* Emoji + Name */}
        <div className="flex gap-3 items-end">
          <div>
            <label className="text-xs text-[#8888aa] mb-1.5 block">Emoji</label>
            <EmojiPicker value={form.icon} onChange={v => upd('icon', v)} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-[#8888aa] mb-1.5 block">Nome</label>
            <input
              className="input-dark"
              placeholder="Ex: Pet, Vestuário…"
              value={form.name}
              onChange={e => upd('name', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
        </div>

        {/* Type */}
        <div>
          <label className="text-xs text-[#8888aa] mb-1.5 block">Tipo</label>
          <div className="flex gap-2">
            {([
              { v: 'expense', l: '↓ Despesa' },
              { v: 'income',  l: '↑ Receita' },
              { v: 'both',    l: '↕ Ambos'   },
            ] as const).map(({ v, l }) => (
              <button
                key={v}
                onClick={() => upd('type', v)}
                className={clsx(
                  'flex-1 py-2 rounded-xl text-xs font-medium border transition-all',
                  form.type === v
                    ? 'bg-[#ff7a00]/10 border-[#ff7a00]/30 text-[#ff7a00]'
                    : 'bg-[#16161f] border-[#1e1e2e] text-[#55556a] hover:text-[#e8e8f0]',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div>
          <label className="text-xs text-[#8888aa] mb-1.5 block">Cor</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
              value={form.color}
              onChange={e => upd('color', e.target.value)}
            />
            <div className="flex gap-1.5 flex-wrap">
              {['#ff7a00','#00ff88','#ff4466','#8b5cf6','#f59e0b','#3b82f6','#ec4899','#10b981'].map(c => (
                <button
                  key={c}
                  onClick={() => upd('color', c)}
                  className={clsx(
                    'w-5 h-5 rounded-full border-2 transition-all',
                    form.color === c ? 'border-white scale-125' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="flex items-center gap-2 p-3 bg-[#16161f] rounded-xl border border-[#1e1e2e]">
          <span className="text-lg">{form.icon || '📦'}</span>
          <span className="text-sm font-medium" style={{ color: form.color }}>{form.name || 'Pré-visualização'}</span>
          <span className="text-[10px] text-[#55556a] ml-auto">
            {form.type === 'expense' ? 'Despesa' : form.type === 'income' ? 'Receita' : 'Ambos'}
          </span>
        </div>
      </div>
      <ModalFooter>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={!form.name.trim()}>
          {isEdit ? 'Salvar' : 'Criar Categoria'}
        </button>
      </ModalFooter>
    </Modal>
  )
}
