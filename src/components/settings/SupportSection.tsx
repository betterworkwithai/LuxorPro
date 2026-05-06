import React, { useEffect, useState } from 'react'
import {
  LifeBuoy, Send, Bug, HelpCircle, Sparkles, MessageSquare, Loader2,
  CheckCircle2, AlertTriangle, Clock, Image as ImageIcon, X, Pencil, Trash2,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card'
import { Modal, ModalFooter } from '../ui/Modal'
import { supabase } from '../../lib/supabase'
import { isAdmin } from '../../lib/admin'

type Severity = 'low' | 'medium' | 'high' | 'critical'
type Status   = 'open' | 'in_progress' | 'resolved' | 'closed'
type Category = 'bug' | 'question' | 'feature' | 'other'

interface SupportTicket {
  id:              string
  user_id:         string
  user_email:      string | null
  title:           string
  description:     string
  severity:        Severity
  status:          Status
  category:        Category
  attachment_url:  string | null
  user_agent:      string | null
  app_version:     string | null
  admin_notes:     string | null
  admin_response:  string | null
  created_at:      string
  updated_at:      string
}

const SEVERITY_OPTS: { v: Severity; label: string; color: string }[] = [
  { v: 'low',      label: 'Baixa',    color: '#55556a' },
  { v: 'medium',   label: 'Média',    color: '#00d4ff' },
  { v: 'high',     label: 'Alta',     color: '#f59e0b' },
  { v: 'critical', label: 'Crítica',  color: '#ff4466' },
]

const CATEGORY_OPTS: { v: Category; label: string; Icon: React.ElementType }[] = [
  { v: 'bug',      label: 'Bug',         Icon: Bug },
  { v: 'question', label: 'Dúvida',      Icon: HelpCircle },
  { v: 'feature',  label: 'Sugestão',    Icon: Sparkles },
  { v: 'other',    label: 'Outro',       Icon: MessageSquare },
]

const STATUS_META: Record<Status, { label: string; color: string }> = {
  open:        { label: 'Aberto',         color: '#00d4ff' },
  in_progress: { label: 'Em andamento',   color: '#f59e0b' },
  resolved:    { label: 'Resolvido',      color: '#00ff88' },
  closed:      { label: 'Fechado',        color: '#55556a' },
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Main section ────────────────────────────────────────────────────────────

export function SupportSection({ userEmail }: { userEmail: string | null }) {
  const admin = isAdmin(userEmail)
  const [tickets, setTickets]     = useState<SupportTicket[]>([])
  const [loading, setLoading]     = useState(true)
  const [composeOpen, setCompose] = useState(false)
  const [editing, setEditing]     = useState<SupportTicket | null>(null)

  const reload = async () => {
    setLoading(true)
    try {
      const q = supabase.from('support_tickets').select('*').order('created_at', { ascending: false })
      const { data, error } = await q
      if (error) throw error
      setTickets((data ?? []) as SupportTicket[])
    } catch (e) {
      console.error('[SupportSection] load failed:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <LifeBuoy className="w-4 h-4 text-[#ff7a00]" />
            <CardTitle>Suporte e Bugs</CardTitle>
            {admin && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#ff7a00]/10 text-[#ff7a00] border border-[#ff7a00]/25 font-bold uppercase tracking-wider">
                Admin
              </span>
            )}
          </div>
          <button
            onClick={() => { setEditing(null); setCompose(true) }}
            className="btn-primary flex items-center gap-1.5 text-xs px-3 py-2"
          >
            <Send className="w-3.5 h-3.5" />
            Reportar
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-xs text-[#8888aa] leading-relaxed">
          {admin
            ? 'Você está vendo todos os chamados de todos os usuários. Use os controles para gerenciar o status, adicionar notas internas e responder.'
            : 'Encontrou um bug, tem uma dúvida ou quer sugerir algo? Abra um chamado e a equipe responde por aqui mesmo.'}
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 text-[#55556a] animate-spin" />
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState onCompose={() => { setEditing(null); setCompose(true) }} admin={admin} />
        ) : (
          <>
            {admin && <TicketStats tickets={tickets} />}
            <div className="space-y-2">
              {tickets.map(t => (
                <TicketCard
                  key={t.id}
                  ticket={t}
                  isAdmin={admin}
                  onChanged={reload}
                  onEdit={() => { setEditing(t); setCompose(true) }}
                />
              ))}
            </div>
          </>
        )}
      </CardContent>

      <ComposeModal
        open={composeOpen}
        onClose={() => { setCompose(false); setEditing(null) }}
        userEmail={userEmail}
        editing={editing}
        onSubmitted={reload}
      />
    </Card>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onCompose, admin }: { onCompose: () => void; admin: boolean }) {
  return (
    <div className="flex flex-col items-center text-center py-10 gap-3">
      <div className="w-12 h-12 rounded-2xl bg-[#16161f] border border-[#1e1e2e] flex items-center justify-center">
        <LifeBuoy className="w-6 h-6 text-[#55556a]" />
      </div>
      <div>
        <p className="text-sm font-semibold text-[#e8e8f0]">
          {admin ? 'Nenhum chamado por enquanto' : 'Nenhum chamado aberto'}
        </p>
        <p className="text-xs text-[#55556a] mt-1 max-w-sm">
          {admin
            ? 'Quando usuários reportarem bugs ou enviarem dúvidas, elas aparecerão aqui.'
            : 'Reporte um bug ou faça uma pergunta — a equipe responde direto pelo aplicativo.'}
        </p>
      </div>
      {!admin && (
        <button onClick={onCompose} className="btn-primary text-xs px-4 py-2 mt-1">
          Abrir primeiro chamado
        </button>
      )}
    </div>
  )
}

// ─── Admin stats summary ─────────────────────────────────────────────────────

function TicketStats({ tickets }: { tickets: SupportTicket[] }) {
  const open = tickets.filter(t => t.status === 'open').length
  const inProgress = tickets.filter(t => t.status === 'in_progress').length
  const critical = tickets.filter(t => t.severity === 'critical' && t.status !== 'resolved' && t.status !== 'closed').length
  return (
    <div className="grid grid-cols-3 gap-2 text-xs">
      <Stat label="Abertos" value={open} color="#00d4ff" />
      <Stat label="Em andamento" value={inProgress} color="#f59e0b" />
      <Stat label="Críticos ativos" value={critical} color="#ff4466" />
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-[#0d0d14] border border-[#1e1e2e] px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-[#55556a] font-semibold">{label}</p>
      <p className="text-base font-bold mt-0.5" style={{ color }}>{value}</p>
    </div>
  )
}

// ─── Single ticket card ──────────────────────────────────────────────────────

function TicketCard({
  ticket, isAdmin, onChanged, onEdit,
}: {
  ticket:    SupportTicket
  isAdmin:   boolean
  onChanged: () => void
  onEdit:    () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy]         = useState(false)
  const [notes, setNotes]       = useState(ticket.admin_notes ?? '')
  const [response, setResp]     = useState(ticket.admin_response ?? '')

  const sev = SEVERITY_OPTS.find(s => s.v === ticket.severity)
  const cat = CATEGORY_OPTS.find(c => c.v === ticket.category)
  const sm  = STATUS_META[ticket.status]

  const updateStatus = async (status: Status) => {
    setBusy(true)
    try {
      const { error } = await supabase.from('support_tickets').update({ status }).eq('id', ticket.id)
      if (error) throw error
      onChanged()
    } finally { setBusy(false) }
  }

  const saveAdminFields = async () => {
    setBusy(true)
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ admin_notes: notes, admin_response: response })
        .eq('id', ticket.id)
      if (error) throw error
      onChanged()
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!window.confirm('Excluir este chamado? Esta ação não pode ser desfeita.')) return
    setBusy(true)
    try {
      const { error } = await supabase.from('support_tickets').delete().eq('id', ticket.id)
      if (error) throw error
      onChanged()
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-[#1e1e2e] bg-[#0d0d14] overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-3 px-3 py-3 text-left hover:bg-[#16161f]/40 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {cat && <cat.Icon className="w-3.5 h-3.5 text-[#8888aa] flex-shrink-0" />}
            <p className="text-sm font-semibold text-[#e8e8f0] truncate">{ticket.title}</p>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider"
              style={{ background: `${sm.color}18`, color: sm.color, border: `1px solid ${sm.color}30` }}
            >
              {sm.label}
            </span>
            {sev && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider"
                    style={{ color: sev.color, border: `1px solid ${sev.color}30` }}>
                {sev.label}
              </span>
            )}
            <span className="text-[10px] text-[#55556a]">{fmtDate(ticket.created_at)}</span>
            {isAdmin && ticket.user_email && (
              <span className="text-[10px] text-[#8888aa] font-mono truncate">{ticket.user_email}</span>
            )}
          </div>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-[#1e1e2e] pt-3">
          <p className="text-xs text-[#c8c8d8] whitespace-pre-wrap leading-relaxed">{ticket.description}</p>

          {ticket.attachment_url && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#55556a] mb-1.5">Anexo</p>
              <a href={ticket.attachment_url} target="_blank" rel="noreferrer">
                <img src={ticket.attachment_url} alt="Anexo" className="max-h-64 rounded-lg border border-[#1e1e2e]" />
              </a>
            </div>
          )}

          {ticket.user_agent && (
            <details className="text-[10px] text-[#55556a]">
              <summary className="cursor-pointer hover:text-[#8888aa]">Detalhes técnicos</summary>
              <p className="mt-1 font-mono break-all">UA: {ticket.user_agent}</p>
              {ticket.app_version && <p className="font-mono">v{ticket.app_version}</p>}
            </details>
          )}

          {/* Public response (visible to user always) */}
          {!isAdmin && ticket.admin_response && (
            <div className="rounded-lg bg-[#00ff88]/8 border border-[#00ff88]/20 p-3">
              <p className="text-[10px] uppercase tracking-widest text-[#00ff88] font-bold mb-1.5">Resposta da equipe</p>
              <p className="text-xs text-[#c8c8d8] whitespace-pre-wrap leading-relaxed">{ticket.admin_response}</p>
            </div>
          )}

          {/* Admin controls */}
          {isAdmin && (
            <div className="space-y-3 pt-2 border-t border-[#1e1e2e]">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-[#55556a] font-semibold">Status</label>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {(Object.keys(STATUS_META) as Status[]).map(s => (
                    <button
                      key={s}
                      onClick={() => updateStatus(s)}
                      disabled={busy || ticket.status === s}
                      className={clsx(
                        'text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider border transition-colors',
                        ticket.status === s ? 'opacity-100' : 'opacity-50 hover:opacity-100',
                      )}
                      style={{
                        color: STATUS_META[s].color,
                        borderColor: `${STATUS_META[s].color}40`,
                        background: ticket.status === s ? `${STATUS_META[s].color}15` : 'transparent',
                      }}
                    >
                      {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-[#55556a] font-semibold">
                  Notas internas (apenas admins)
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="input-dark w-full text-xs mt-1.5"
                  placeholder="Notas que o usuário não vê…"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-[#00ff88] font-semibold">
                  Resposta ao usuário (visível)
                </label>
                <textarea
                  value={response}
                  onChange={e => setResp(e.target.value)}
                  rows={3}
                  className="input-dark w-full text-xs mt-1.5"
                  placeholder="Mensagem que o usuário vê dentro do app…"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={remove}
                  disabled={busy}
                  className="text-xs text-[#55556a] hover:text-[#ff4466] flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Excluir
                </button>
                <button
                  onClick={saveAdminFields}
                  disabled={busy}
                  className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Salvar
                </button>
              </div>
            </div>
          )}

          {/* Owner edit/delete */}
          {!isAdmin && ticket.status === 'open' && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1e1e2e]">
              <button
                onClick={remove}
                disabled={busy}
                className="text-xs text-[#55556a] hover:text-[#ff4466] flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Excluir
              </button>
              <button
                onClick={onEdit}
                disabled={busy}
                className="text-xs text-[#8888aa] hover:text-[#00d4ff] flex items-center gap-1"
              >
                <Pencil className="w-3 h-3" /> Editar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Compose / edit modal ────────────────────────────────────────────────────

function ComposeModal({
  open, onClose, userEmail, editing, onSubmitted,
}: {
  open:        boolean
  onClose:     () => void
  userEmail:   string | null
  editing:     SupportTicket | null
  onSubmitted: () => void
}) {
  const [title, setTitle]         = useState('')
  const [description, setDesc]    = useState('')
  const [severity, setSeverity]   = useState<Severity>('medium')
  const [category, setCategory]   = useState<Category>('bug')
  const [attachment, setAttach]   = useState<string | null>(null)
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? '')
      setDesc(editing?.description ?? '')
      setSeverity(editing?.severity ?? 'medium')
      setCategory(editing?.category ?? 'bug')
      setAttach(editing?.attachment_url ?? null)
      setError(null)
    }
  }, [open, editing])

  const onPickFile = (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setError('Imagem muito grande — limite 2 MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setAttach(reader.result as string)
    reader.readAsDataURL(file)
  }

  const submit = async () => {
    setError(null)
    if (title.trim().length < 3)        { setError('Título precisa ter pelo menos 3 caracteres'); return }
    if (description.trim().length < 10) { setError('Descrição precisa ter pelo menos 10 caracteres'); return }

    setBusy(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Não autenticado')

      const payload = {
        title:          title.trim(),
        description:    description.trim(),
        severity,
        category,
        attachment_url: attachment,
        user_email:     userEmail,
        user_agent:     navigator.userAgent.slice(0, 500),
        app_version:    (import.meta.env?.VITE_APP_VERSION as string | undefined) ?? null,
      }

      if (editing) {
        const { error } = await supabase
          .from('support_tickets')
          .update(payload)
          .eq('id', editing.id)
          .eq('user_id', user.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('support_tickets')
          .insert({ ...payload, user_id: user.id })
        if (error) throw error
      }

      onSubmitted()
      onClose()
    } catch (e) {
      setError((e as Error).message ?? 'Falha ao enviar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar chamado' : 'Reportar bug ou dúvida'} size="md">
      <div className="px-6 py-5 space-y-4">

        {/* Category */}
        <div>
          <label className="text-xs text-[#8888aa] mb-1.5 block">Tipo</label>
          <div className="grid grid-cols-4 gap-1.5">
            {CATEGORY_OPTS.map(({ v, label, Icon }) => (
              <button
                key={v}
                onClick={() => setCategory(v)}
                aria-pressed={category === v}
                className={clsx(
                  'flex flex-col items-center gap-1 py-2 px-2 rounded-lg border transition-colors text-[11px]',
                  category === v
                    ? 'bg-[#ff7a00]/10 border-[#ff7a00]/30 text-[#ff7a00]'
                    : 'bg-[#16161f] border-[#1e1e2e] text-[#55556a] hover:text-[#e8e8f0]',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="text-xs text-[#8888aa] mb-1.5 block" htmlFor="ticket-title">
            Título <span className="text-[#ff4466]">*</span>
          </label>
          <input
            id="ticket-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Resumo curto do problema…"
            maxLength={200}
            className="input-dark w-full"
            autoFocus
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-[#8888aa] mb-1.5 block" htmlFor="ticket-desc">
            Descrição <span className="text-[#ff4466]">*</span>
          </label>
          <textarea
            id="ticket-desc"
            value={description}
            onChange={e => setDesc(e.target.value)}
            rows={6}
            maxLength={5000}
            placeholder="O que aconteceu? O que você esperava? Como reproduzir?"
            className="input-dark w-full text-sm leading-relaxed"
          />
          <p className="text-[10px] text-[#55556a] mt-1 text-right">{description.length} / 5000</p>
        </div>

        {/* Severity (only relevant for bugs) */}
        {category === 'bug' && (
          <div>
            <label className="text-xs text-[#8888aa] mb-1.5 block">Severidade</label>
            <div className="flex gap-1.5">
              {SEVERITY_OPTS.map(({ v, label, color }) => (
                <button
                  key={v}
                  onClick={() => setSeverity(v)}
                  aria-pressed={severity === v}
                  className={clsx(
                    'flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-colors',
                  )}
                  style={severity === v
                    ? { background: `${color}15`, borderColor: `${color}40`, color }
                    : { background: '#16161f', borderColor: '#1e1e2e', color: '#55556a' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Attachment */}
        <div>
          <label className="text-xs text-[#8888aa] mb-1.5 block">Anexo (imagem, opcional)</label>
          {attachment ? (
            <div className="relative">
              <img src={attachment} alt="Pré-visualização" className="max-h-48 rounded-lg border border-[#1e1e2e]" />
              <button
                onClick={() => setAttach(null)}
                aria-label="Remover anexo"
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 py-3 px-3 rounded-lg border border-dashed border-[#2a2a3e] text-xs text-[#8888aa] hover:border-[#ff7a00]/40 hover:text-[#e8e8f0] cursor-pointer transition-colors">
              <ImageIcon className="w-4 h-4" />
              Selecionar imagem (até 2 MB)
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) onPickFile(f)
                }}
              />
            </label>
          )}
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 p-2.5 rounded-lg bg-[#ff4466]/10 border border-[#ff4466]/25 text-xs text-[#ff4466]">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <ModalFooter>
        <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
        <button
          className="btn-primary inline-flex items-center gap-1.5"
          onClick={submit}
          disabled={busy || title.trim().length < 3 || description.trim().length < 10}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {editing ? 'Salvar' : 'Enviar chamado'}
        </button>
      </ModalFooter>
    </Modal>
  )
}

// helper kept for parity with status timeline (future)
export { Clock }
