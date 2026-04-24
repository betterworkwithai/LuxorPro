import React, { useEffect, useState } from 'react'
import { Users, Copy, Check, Link2Off, UserPlus, Loader2, Heart } from 'lucide-react'
import { clsx } from 'clsx'
import { useStore } from '../../store/useStore'
import { Modal, ModalFooter } from '../ui/Modal'

export function SharingSettings() {
  const {
    partnership, partnerEmail, partnershipLoading,
    loadPartnership, createInviteCode, acceptInviteCode, stopSharing,
  } = useStore()

  const [inviteInput, setInviteInput]   = useState('')
  const [inviteError, setInviteError]   = useState('')
  const [copied, setCopied]             = useState(false)
  const [confirmStop, setConfirmStop]   = useState(false)
  const [actionError, setActionError]   = useState('')

  useEffect(() => { loadPartnership() }, [])

  async function handleGenerateCode() {
    setActionError('')
    try { await createInviteCode() } catch (e: any) { setActionError(e.message) }
  }

  async function handleAccept() {
    setInviteError('')
    if (inviteInput.trim().length !== 6) {
      setInviteError('O código deve ter 6 dígitos.')
      return
    }
    try {
      await acceptInviteCode(inviteInput.trim())
      setInviteInput('')
    } catch (e: any) {
      setInviteError(e.message ?? 'Código inválido.')
    }
  }

  async function handleStopSharing() {
    setConfirmStop(false)
    setActionError('')
    try { await stopSharing() } catch (e: any) { setActionError(e.message) }
  }

  function copyCode() {
    if (!partnership?.inviteCode) return
    navigator.clipboard.writeText(partnership.inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Active partnership ─────────────────────────────────────────────────────
  if (partnership?.status === 'active') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[#ff7a00]/5 border border-[#ff7a00]/20">
          <div className="w-10 h-10 rounded-xl bg-[#ff7a00]/15 border border-[#ff7a00]/30 flex items-center justify-center flex-shrink-0">
            <Heart className="w-5 h-5 text-[#ff7a00]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#e8e8f0]">Compartilhamento ativo</p>
            <p className="text-xs text-[#8888aa] truncate mt-0.5">
              Conectado com <span className="text-[#ff7a00] font-medium">{partnerEmail ?? 'seu parceiro(a)'}</span>
            </p>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#00ff88] flex-shrink-0" title="Ativo" />
        </div>

        <p className="text-xs text-[#55556a] leading-relaxed">
          Transações marcadas como <span className="text-[#ff7a00] font-medium">Compartilhadas</span> ficam visíveis para seu parceiro(a).
          Transações privadas permanecem apenas para você.
        </p>

        {actionError && (
          <p className="text-xs text-[#ff4466] bg-[#ff4466]/10 border border-[#ff4466]/20 rounded-lg px-3 py-2">{actionError}</p>
        )}

        <button
          onClick={() => setConfirmStop(true)}
          disabled={partnershipLoading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#ff4466]/30 text-[#ff4466] text-sm font-medium hover:bg-[#ff4466]/10 transition-colors disabled:opacity-50"
        >
          {partnershipLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2Off className="w-4 h-4" />}
          Parar compartilhamento
        </button>

        {/* Confirm stop modal */}
        <Modal open={confirmStop} onClose={() => setConfirmStop(false)} title="Parar compartilhamento?" size="sm">
          <div className="px-6 py-5 space-y-3">
            <p className="text-sm text-[#8888aa]">
              Todas as suas transações voltarão para <strong className="text-[#e8e8f0]">Privado</strong>.
              Seu parceiro(a) não poderá mais ver nenhum dado seu. Esta ação não pode ser desfeita.
            </p>
          </div>
          <ModalFooter>
            <button className="btn-ghost" onClick={() => setConfirmStop(false)}>Cancelar</button>
            <button className="btn-danger" onClick={handleStopSharing}>
              <Link2Off className="w-4 h-4 mr-1.5 inline" /> Confirmar
            </button>
          </ModalFooter>
        </Modal>
      </div>
    )
  }

  // ── Pending partnership (code generated, waiting for partner) ──────────────
  if (partnership?.status === 'pending') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[#00d4ff]/5 border border-[#00d4ff]/20">
          <div className="w-10 h-10 rounded-xl bg-[#00d4ff]/15 border border-[#00d4ff]/30 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-[#00d4ff]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#e8e8f0]">Aguardando parceiro(a)</p>
            <p className="text-xs text-[#8888aa] mt-0.5">Compartilhe o código abaixo</p>
          </div>
        </div>

        <div>
          <p className="text-xs text-[#8888aa] mb-2">Código de convite</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-[#111118] border border-[#2a2a3e] font-mono text-2xl font-bold tracking-[0.3em] text-[#e8e8f0]">
              {partnership.inviteCode}
            </div>
            <button
              onClick={copyCode}
              className={clsx(
                'w-12 h-12 rounded-xl border flex items-center justify-center transition-all flex-shrink-0',
                copied
                  ? 'border-[#00ff88]/30 bg-[#00ff88]/10 text-[#00ff88]'
                  : 'border-[#2a2a3e] bg-[#111118] text-[#8888aa] hover:border-[#ff7a00]/30 hover:text-[#ff7a00]'
              )}
              title="Copiar código"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-[#55556a] mt-1.5">
            Válido até ser utilizado. Gere um novo código para invalidar este.
          </p>
        </div>

        {actionError && (
          <p className="text-xs text-[#ff4466] bg-[#ff4466]/10 border border-[#ff4466]/20 rounded-lg px-3 py-2">{actionError}</p>
        )}

        <div className="h-px bg-[#1e1e2e]" />

        <button
          onClick={handleGenerateCode}
          disabled={partnershipLoading}
          className="text-xs text-[#55556a] hover:text-[#8888aa] underline transition-colors"
        >
          Gerar novo código
        </button>
      </div>
    )
  }

  // ── No partnership ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <p className="text-sm text-[#8888aa] leading-relaxed">
        Conecte sua conta à do seu parceiro(a) para compartilhar transações selecionadas.
        Cada transação pode ser marcada como <strong className="text-[#e8e8f0]">Privada</strong> ou{' '}
        <strong className="text-[#ff7a00]">Compartilhada</strong> — você tem total controle.
      </p>

      {actionError && (
        <p className="text-xs text-[#ff4466] bg-[#ff4466]/10 border border-[#ff4466]/20 rounded-lg px-3 py-2">{actionError}</p>
      )}

      {/* Generate code */}
      <div className="p-4 rounded-xl bg-[#0d0d14] border border-[#1e1e2e] space-y-3">
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-[#ff7a00]" />
          <p className="text-sm font-semibold text-[#e8e8f0]">Convidar parceiro(a)</p>
        </div>
        <p className="text-xs text-[#55556a]">Gere um código de 6 dígitos e envie para seu parceiro(a).</p>
        <button
          onClick={handleGenerateCode}
          disabled={partnershipLoading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#ff7a00] text-[#0a0a0f] text-sm font-bold hover:bg-[#e06500] transition-colors disabled:opacity-50"
        >
          {partnershipLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Gerar código de convite
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[#1e1e2e]" />
        <span className="text-xs text-[#55556a]">ou</span>
        <div className="flex-1 h-px bg-[#1e1e2e]" />
      </div>

      {/* Accept invite */}
      <div className="p-4 rounded-xl bg-[#0d0d14] border border-[#1e1e2e] space-y-3">
        <div className="flex items-center gap-2">
          <Link2Off className="w-4 h-4 text-[#00d4ff]" />
          <p className="text-sm font-semibold text-[#e8e8f0]">Aceitar convite</p>
        </div>
        <p className="text-xs text-[#55556a]">Digite o código de 6 dígitos enviado pelo seu parceiro(a).</p>
        <div className="flex gap-2">
          <input
            className="input-dark flex-1 font-mono text-center tracking-widest text-base"
            placeholder="000000"
            maxLength={6}
            value={inviteInput}
            onChange={e => { setInviteInput(e.target.value.replace(/\D/g, '')); setInviteError('') }}
            onKeyDown={e => e.key === 'Enter' && handleAccept()}
          />
          <button
            onClick={handleAccept}
            disabled={partnershipLoading || inviteInput.length !== 6}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#00d4ff]/15 border border-[#00d4ff]/30 text-[#00d4ff] text-sm font-bold hover:bg-[#00d4ff]/25 transition-colors disabled:opacity-50"
          >
            {partnershipLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aceitar'}
          </button>
        </div>
        {inviteError && <p className="text-xs text-[#ff4466]">{inviteError}</p>}
      </div>
    </div>
  )
}
