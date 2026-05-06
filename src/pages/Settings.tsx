import React, { useState, useEffect, useRef } from 'react'
import { Save, Database, AlertTriangle, Trash2, Plus, Tag, X, Download, Upload, KeyRound, Mail, CreditCard, ExternalLink, Loader2, Crown, CalendarX, RefreshCw, Heart, Pencil } from 'lucide-react'
import { SharingSettings } from '../components/settings/SharingSettings'
import { createPortalSession, cancelSubscription } from '../lib/stripe'
import { useSubscription } from '../hooks/useSubscription'
import { useStore } from '../store/useStore'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { Modal, ModalFooter } from '../components/ui/Modal'
import { formatBRL } from '../lib/formatters'
import { SUGGESTED_CATEGORIES } from '../lib/types'
import { AccountSelect } from '../components/ui/AccountSelect'
import type { Category } from '../lib/types'
import type { LuxorBackup } from '../lib/db'
import { useAllCategories } from '../lib/useCategories'
import { clsx } from 'clsx'
import { supabase, SUPABASE_CONFIGURED } from '../lib/supabase'
import emailjs from '@emailjs/browser'
import { NewCategoryModal } from '../components/modals/NewCategoryModal'
import { SettingsNav } from '../components/settings/SettingsNav'
import { SupportSection } from '../components/settings/SupportSection'

const EMAILJS_SERVICE_ID  = 'service_e2vgo4k'
const EMAILJS_TEMPLATE_ID = 'template_7uofibw'
const EMAILJS_PUBLIC_KEY  = 'Oqb04iMJa-XWLLBr7'

// ─── Confirm clear modal ──────────────────────
function ClearDataModal({ open, onClose, onConfirm }: {
  open: boolean; onClose: () => void; onConfirm: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="⚠ Apagar Todos os Dados" size="sm">
      <div className="px-6 py-5 space-y-4">
        <div className="p-4 bg-[#ff4466]/5 border border-[#ff4466]/20 rounded-xl">
          <p className="text-sm text-[#ff4466] font-semibold mb-1">Esta ação é irreversível!</p>
          <p className="text-xs text-[#8888aa]">
            Todas as transações, investimentos, declarações de imposto, documentos e configurações
            serão permanentemente apagados do seu navegador.
          </p>
        </div>
      </div>
      <ModalFooter>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-danger" onClick={onConfirm}>
          <Trash2 className="w-4 h-4 mr-1.5 inline" /> Confirmar e Apagar Tudo
        </button>
      </ModalFooter>
    </Modal>
  )
}

// ─── Confirm delete-account modal ─────────────
function DeleteAccountModal({ open, onClose, onConfirm }: {
  open: boolean; onClose: () => void; onConfirm: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="⚠ Apagar Conta Permanentemente" size="sm">
      <div className="px-6 py-5 space-y-4">
        <div className="p-4 bg-[#ff4466]/5 border border-[#ff4466]/20 rounded-xl">
          <p className="text-sm text-[#ff4466] font-semibold mb-1">Esta ação é definitiva!</p>
          <p className="text-xs text-[#8888aa]">
            Sua conta, login, e-mail e todos os dados financeiros associados serão removidos
            permanentemente dos nossos servidores. Você não poderá recuperá-los.
          </p>
        </div>
      </div>
      <ModalFooter>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-danger" onClick={onConfirm}>
          <Trash2 className="w-4 h-4 mr-1.5 inline" /> Confirmar e Apagar Conta
        </button>
      </ModalFooter>
    </Modal>
  )
}
// NewCategoryModal moved to ../components/modals/NewCategoryModal.tsx (shared)

// ─── Suitability profiles ─────────────────────
const SUITABILITY_OPTIONS = [
  { value: 'Conservador' as const, desc: 'Renda fixa, baixo risco' },
  { value: 'Moderado'    as const, desc: 'Mix balanceado' },
  { value: 'Arrojado'    as const, desc: 'Maior exposição a variável' },
  { value: 'Agressivo'   as const, desc: 'Alta concentração em risco' },
]

// ─── Main settings page ───────────────────────
export default function Settings() {
  const {
    settings, saveSettings, transactions, investments, attachments,
    clearAllData, addCustomCategory, deleteCustomCategory,
    exportData, importData, subscriptions,
  } = useStore()
  const allCategories    = useAllCategories()
  const customCategories = settings.customCategories ?? []

  const [form,           setForm]           = useState(settings)
  const [saved,          setSaved]          = useState(false)
  const [showClearModal, setShowClearModal] = useState(false)
  const [showNewCat,     setShowNewCat]     = useState(false)
  const [activeTab,      setActiveTab]      = useState<string>('perfil')
  const [user,           setUser]           = useState<{ email: string | null } | null>(null)

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUser(data.user ? { email: data.user.email ?? null } : null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (mounted) setUser(session?.user ? { email: session.user.email ?? null } : null)
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])
  const [editCat,        setEditCat]        = useState<Category | null>(null)
  const [clearing,       setClearing]       = useState(false)
  const [importing,      setImporting]      = useState(false)
  const [importStatus,   setImportStatus]   = useState<'idle' | 'ok' | 'error'>('idle')
  const importRef = useRef<HTMLInputElement>(null)

  // Subscription management
  const subscription = useSubscription()
  const [portalLoading,      setPortalLoading]      = useState(false)
  const [portalFallback,     setPortalFallback]     = useState(false)
  const [portalError,        setPortalError]        = useState('')
  const [showCancelModal,    setShowCancelModal]    = useState(false)
  const [cancelLoading,      setCancelLoading]      = useState(false)
  const [cancelError,        setCancelError]        = useState('')

  const handleManageSubscription = async () => {
    setPortalLoading(true)
    setPortalFallback(false)
    setPortalError('')
    try {
      const result = await createPortalSession()
      if ('url' in result && result.url) {
        window.location.href = result.url
        return
      }
      setPortalFallback(true)
    } catch {
      setPortalFallback(true)
    } finally {
      setPortalLoading(false)
    }
  }

  const handleCancelRenewal = async () => {
    setCancelLoading(true)
    setCancelError('')
    try {
      const result = await cancelSubscription()
      if ('error' in result) {
        setCancelError(result.error)
        return
      }
      setShowCancelModal(false)
      subscription.refresh()
    } catch {
      setCancelError('Erro ao cancelar. Tente novamente.')
    } finally {
      setCancelLoading(false)
    }
  }

  // Feature suggestion state
  const [suggestion,        setSuggestion]        = useState('')
  const [suggestionSent,    setSuggestionSent]    = useState(false)
  const [suggestionSending, setSuggestionSending] = useState(false)
  const [suggestionError,   setSuggestionError]   = useState('')

  // Account (email / password) state — only used when Supabase is configured
  const [newEmail,         setNewEmail]         = useState('')
  const [emailSaving,      setEmailSaving]      = useState(false)
  const [emailStatus,      setEmailStatus]      = useState<'idle' | 'ok' | 'error'>('idle')
  const [currentPasswordInput, setCurrentPasswordInput] = useState('')
  const [newPassword,      setNewPassword]      = useState('')
  const [confirmPassword,  setConfirmPassword]  = useState('')
  const [passSaving,       setPassSaving]       = useState(false)
  const [passStatus,       setPassStatus]       = useState<'idle' | 'ok' | 'error'>('idle')

  // Delete account state
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false)
  const [deletingAccount,        setDeletingAccount]        = useState(false)
  const [deleteAccountStatus,    setDeleteAccountStatus]    = useState<'idle' | 'error'>('idle')

  useEffect(() => { setForm(settings) }, [settings])

  const upd = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    await saveSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClearAll = async () => {
    setShowClearModal(false)
    setClearing(true)
    await clearAllData()
    setClearing(false)
  }

  const handleDeleteAccount = async () => {
    setShowDeleteAccountModal(false)
    setDeletingAccount(true)
    setDeleteAccountStatus('idle')
    try {
      // Clear local data first so nothing lingers in the browser
      await clearAllData()
      try { localStorage.removeItem('luxor_signup_name') } catch {}
      try { localStorage.removeItem('luxor_signup_suitability') } catch {}
      try { localStorage.removeItem('luxor_onboarding_done_v1') } catch {}

      if (SUPABASE_CONFIGURED) {
        const { error } = await supabase.functions.invoke('delete-account')
        if (error) throw error
        await supabase.auth.signOut()
      } else {
        try { localStorage.removeItem('luxorpro_local_auth') } catch {}
      }
      // Hard reload back to auth screen
      window.location.href = '/app'
    } catch (e) {
      console.error('delete-account failed', e)
      setDeleteAccountStatus('error')
      setDeletingAccount(false)
      setTimeout(() => setDeleteAccountStatus('idle'), 6000)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportStatus('idle')
    try {
      const text   = await file.text()
      const backup = JSON.parse(text) as LuxorBackup
      if (!backup.version || !Array.isArray(backup.transactions)) throw new Error('Arquivo inválido')
      await importData(backup)
      setImportStatus('ok')
    } catch {
      setImportStatus('error')
    } finally {
      setImporting(false)
      // Reset file input so same file can be re-selected
      if (importRef.current) importRef.current.value = ''
      setTimeout(() => setImportStatus('idle'), 4000)
    }
  }

  const handleEmailChange = async () => {
    if (!newEmail.trim()) return
    setEmailSaving(true)
    setEmailStatus('idle')
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
      if (error) throw error
      setEmailStatus('ok')
      setNewEmail('')
    } catch {
      setEmailStatus('error')
    } finally {
      setEmailSaving(false)
      setTimeout(() => setEmailStatus('idle'), 5000)
    }
  }

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword !== confirmPassword || newPassword.length < 6) return
    setPassSaving(true)
    setPassStatus('idle')
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPassStatus('ok')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      setPassStatus('error')
    } finally {
      setPassSaving(false)
      setTimeout(() => setPassStatus('idle'), 5000)
    }
  }

  const handleSendSuggestion = async () => {
    const message = suggestion.trim()
    if (!message || suggestionSending) return
    setSuggestionSending(true)
    setSuggestionError('')
    try {
      // Resolve user name + email from auth (fallback to settings)
      let userName  = ''
      let userEmail = ''
      try {
        const { data } = await supabase.auth.getUser()
        const u = data.user
        if (u) {
          userEmail = u.email ?? ''
          const meta = (u.user_metadata ?? {}) as { full_name?: string; name?: string }
          userName = userName || meta.full_name || meta.name || (userEmail ? userEmail.split('@')[0] : '')
        }
      } catch {}

      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          // Cover the most common EmailJS template variable names so
          // name + message always arrive regardless of template setup.
          nome: userName || 'Usuário Luxor',
          name: userName || 'Usuário Luxor',
          user_name: userName || 'Usuário Luxor',
          from_name: userName || 'Usuário Luxor',
          email: userEmail || 'no-email@luxor.app',
          user_email: userEmail || 'no-email@luxor.app',
          reply_to: userEmail || 'no-email@luxor.app',
          mensagem: message,
          message: message,
          sugestao: message,
          suggestion: message,
        },
        { publicKey: EMAILJS_PUBLIC_KEY },
      )

      setSuggestionSent(true)
      setSuggestion('')
      setTimeout(() => setSuggestionSent(false), 5000)
    } catch (err) {
      console.error('Failed to send suggestion via EmailJS:', err)
      setSuggestionError('Não foi possível enviar sua sugestão. Tente novamente.')
      setTimeout(() => setSuggestionError(''), 6000)
    } finally {
      setSuggestionSending(false)
    }
  }

  // Unique institutions from investments + subscriptions
  const portfolioInstitutions = Array.from(new Set([
    ...investments.map(i => i.institution),
    ...subscriptions.map(s => s.account),
  ].filter(Boolean))).sort()

  // Suggestions: only show ones not already added
  const existingNames = new Set(allCategories.map(c => c.name.toLowerCase()))
  const suggestions   = SUGGESTED_CATEGORIES.filter(s => !existingNames.has(s.name.toLowerCase()))

  const storageStats = {
    Transações:    transactions.length,
    Investimentos: investments.length,
    Documentos:    attachments.length,
    Tamanho:       `~${((JSON.stringify(transactions).length + JSON.stringify(investments).length) / 1024).toFixed(0)} KB`,
  }

  return (
    <div className="min-h-screen animate-fade-in">
      <PageHeader
        title="Configurações"
        subtitle="Preferências, categorias e gerenciamento de dados"
        actions={
          <button onClick={handleSave} className="btn-primary flex items-center gap-1.5 px-3">
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">{saved ? 'Salvo ✓' : 'Salvar Alterações'}</span>
            <span className="sm:hidden">{saved ? '✓' : 'Salvar'}</span>
          </button>
        }
      />

      <div className="p-4 sm:p-6 max-w-7xl mx-auto lg:flex lg:gap-8">

        <SettingsNav active={activeTab} onChange={setActiveTab} />

        <div className="flex-1 min-w-0 space-y-6 lg:max-w-3xl">

        {/* ── Perfil ── */}
        {activeTab === 'perfil' && (
        <section id="perfil" aria-labelledby="perfil-heading">
        <Card>
          <CardHeader><CardTitle>Perfil</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs text-[#8888aa] mb-1.5 block">Seu Nome</label>
              <input className="input-dark" placeholder="Seu nome" value={form.name} onChange={e => upd('name', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        </section>
        )}

        {/* ── Assinatura ── */}
        {activeTab === 'assinatura' && (
        <section id="assinatura" aria-labelledby="assinatura-heading">
        {SUPABASE_CONFIGURED && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#55556a]" />
                <CardTitle>Assinatura</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscription.loading ? (
                <div className="flex items-center gap-2 text-xs text-[#55556a]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Carregando status…
                </div>
              ) : (
                <>
                  {/* Status + renewal row */}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: subscription.isActive ? 'rgba(0,255,136,0.08)' : 'rgba(255,122,0,0.08)',
                        border:     subscription.isActive ? '1px solid rgba(0,255,136,0.2)' : '1px solid rgba(255,122,0,0.2)',
                      }}
                    >
                      <Crown className="w-4 h-4" style={{ color: subscription.isActive ? '#00ff88' : '#ff7a00' }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#e8e8f0]">
                        {subscription.status === 'active'   && !subscription.cancelAtPeriodEnd && `Plano ${subscription.plan ?? ''} — Ativo`}
                        {subscription.status === 'active'   && subscription.cancelAtPeriodEnd  && `Plano ${subscription.plan ?? ''} — Cancelamento agendado`}
                        {subscription.status === 'trialing' && !subscription.cancelAtPeriodEnd && `Trial gratuito — Plano ${subscription.plan ?? ''}`}
                        {subscription.status === 'trialing' && subscription.cancelAtPeriodEnd  && `Trial — Cancelamento agendado`}
                        {subscription.status === 'past_due' && 'Pagamento pendente'}
                        {subscription.status === 'canceled' && 'Assinatura cancelada'}
                        {subscription.status === 'none'     && 'Sem assinatura ativa'}
                      </p>
                      <p className="text-xs text-[#55556a]">
                        {subscription.status === 'trialing' && subscription.trialEnd &&
                          `Trial até ${subscription.trialEnd.toLocaleDateString('pt-BR')}`}
                        {subscription.status === 'active' && !subscription.cancelAtPeriodEnd && subscription.periodEnd &&
                          `Renova em ${subscription.periodEnd.toLocaleDateString('pt-BR')}`}
                        {subscription.status === 'active' && subscription.cancelAtPeriodEnd && subscription.periodEnd &&
                          `Acesso garantido até ${subscription.periodEnd.toLocaleDateString('pt-BR')}`}
                        {subscription.status === 'canceled' && subscription.periodEnd &&
                          `Acesso até ${subscription.periodEnd.toLocaleDateString('pt-BR')}`}
                        {subscription.status === 'past_due' &&
                          'Atualize seu método de pagamento para restaurar o acesso'}
                        {subscription.status === 'none' &&
                          'Assine para desbloquear todos os recursos'}
                      </p>
                    </div>
                  </div>

                  {/* Renewal date highlight — active recurring plans only */}
                  {subscription.isActive && subscription.plan !== 'lifetime' && subscription.periodEnd && !subscription.cancelAtPeriodEnd && (
                    <div
                      className="flex items-center justify-between px-4 py-3 rounded-xl"
                      style={{ background: 'rgba(255,122,0,0.05)', border: '1px solid rgba(255,122,0,0.12)' }}
                    >
                      <div>
                        <p className="text-[11px] text-[#55556a] uppercase tracking-wider mb-0.5">Próxima renovação</p>
                        <p className="text-sm font-semibold text-[#e8e8f0]">
                          {subscription.periodEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                      <RefreshCw className="w-4 h-4 text-[#ff7a00]" />
                    </div>
                  )}

                  {/* Cancellation scheduled notice */}
                  {subscription.cancelAtPeriodEnd && subscription.periodEnd && (
                    <div
                      className="flex items-center gap-3 px-4 py-3 rounded-xl"
                      style={{ background: 'rgba(255,68,102,0.05)', border: '1px solid rgba(255,68,102,0.15)' }}
                    >
                      <CalendarX className="w-4 h-4 text-[#ff4466] flex-shrink-0" />
                      <p className="text-xs text-[#ff4466]">
                        Renovação cancelada. Seu acesso continua até <strong>{subscription.periodEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>.
                      </p>
                    </div>
                  )}

                  {/* Cancel renewal button — active recurring plans that haven't been canceled yet */}
                  {subscription.isActive && subscription.plan !== 'lifetime' && !subscription.cancelAtPeriodEnd && (
                    <div className="space-y-2">
                      <button
                        onClick={() => setShowCancelModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-[#1e1e2e] text-[#8888aa] hover:border-[#ff4466]/40 hover:text-[#ff4466] transition-all"
                      >
                        <CalendarX className="w-4 h-4" />
                        Cancelar Renovação
                      </button>
                      <p className="text-[11px] text-[#3a3a4e]">
                        Você mantém acesso até o fim do período atual.
                      </p>
                      {cancelError && <p className="text-xs text-[#ff4466]">{cancelError}</p>}
                    </div>
                  )}

                  {/* Upgrade prompt for no-subscription users */}
                  {subscription.status === 'none' && (
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('luxor:show-subscription'))}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                      style={{ background: 'linear-gradient(135deg, #ff7a00, #ff4500)', boxShadow: '0 6px 20px rgba(255,122,0,0.3)' }}
                    >
                      <Crown className="w-4 h-4" />
                      Ver planos — 7 dias grátis
                    </button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        </section>
        )}

        {/* ── Segurança da Conta ── */}
        {activeTab === 'seguranca' && (
        <section id="seguranca" aria-labelledby="seguranca-heading">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#55556a]" />
              <CardTitle>Segurança da Conta</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Alterar E-mail */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Mail className="w-3.5 h-3.5 text-[#55556a]" />
                <p className="text-sm font-medium text-[#e8e8f0]">Alterar E-mail</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">Novo E-mail</label>
                  <div className="flex gap-3">
                    <input
                      className="input-dark flex-1"
                      type="email"
                      placeholder="novo@email.com"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (SUPABASE_CONFIGURED) handleEmailChange()
                          else { alert('Para alterar seu e-mail, entre em contato com suporte@luxorpro.com.br'); setNewEmail('') }
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (SUPABASE_CONFIGURED) {
                          handleEmailChange()
                        } else {
                          alert('Para alterar seu e-mail, entre em contato com suporte@luxorpro.com.br')
                          setNewEmail('')
                        }
                      }}
                      disabled={!newEmail.trim()}
                      className="btn-primary whitespace-nowrap"
                    >
                      Atualizar E-mail
                    </button>
                  </div>
                </div>
                {emailStatus === 'ok' && (
                  <p className="text-xs text-[#00ff88]">✓ Verifique seu e-mail para confirmar a alteração.</p>
                )}
                {emailStatus === 'error' && (
                  <p className="text-xs text-[#ff4466]">✗ Erro ao alterar e-mail. Tente novamente.</p>
                )}
              </div>
            </div>

            <div className="h-px bg-[#1e1e2e]" />

            {/* Alterar Senha */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <KeyRound className="w-3.5 h-3.5 text-[#55556a]" />
                <p className="text-sm font-medium text-[#e8e8f0]">Alterar Senha</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">Senha Atual</label>
                  <input
                    className="input-dark"
                    type="password"
                    placeholder="••••••••"
                    value={currentPasswordInput}
                    onChange={e => setCurrentPasswordInput(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Nova Senha</label>
                    <input
                      className="input-dark"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Confirmar Nova Senha</label>
                    <input
                      className="input-dark"
                      type="password"
                      placeholder="Repita a senha"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-[#ff4466]">As senhas não coincidem</p>
                )}
                <button
                  onClick={() => {
                    if (!newPassword || newPassword !== confirmPassword) return
                    if (SUPABASE_CONFIGURED) {
                      handlePasswordChange()
                    } else {
                      alert('Para alterar sua senha, entre em contato com suporte@luxorpro.com.br')
                      setCurrentPasswordInput('')
                      setNewPassword('')
                      setConfirmPassword('')
                    }
                  }}
                  disabled={!newPassword || newPassword !== confirmPassword || newPassword.length < 6}
                  className="btn-primary w-full"
                >
                  Atualizar Senha
                </button>
                {passStatus === 'ok' && (
                  <p className="text-xs text-[#00ff88]">✓ Senha alterada com sucesso.</p>
                )}
                {passStatus === 'error' && (
                  <p className="text-xs text-[#ff4466]">✗ Erro ao alterar senha. Tente novamente.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        </section>
        )}

        {/* ── Perfil de Investidor (Task 16) ── */}
        {activeTab === 'investidor' && (
        <section id="investidor" aria-labelledby="investidor-heading">
        <Card>
          <CardHeader><CardTitle>Perfil de Investidor</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SUITABILITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => upd('suitability', opt.value)}
                  className={clsx(
                    'flex flex-col items-center gap-1 px-3 py-4 rounded-xl border text-center transition-all',
                    form.suitability === opt.value
                      ? 'bg-[#ff7a00]/10 border-[#ff7a00]/40 text-[#ff7a00]'
                      : 'bg-[#16161f] border-[#1e1e2e] text-[#8888aa] hover:border-[#ff7a00]/20 hover:text-[#e8e8f0]',
                  )}
                >
                  <span className="text-sm font-semibold">{opt.value}</span>
                  <span className="text-[10px] leading-snug opacity-75">{opt.desc}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        </section>
        )}

        {/* ── Moeda e Câmbio ── */}
        {activeTab === 'moeda' && (
        <section id="moeda" aria-labelledby="moeda-heading">
        <Card>
          <CardHeader><CardTitle>Moeda e Câmbio</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">Moeda Preferida</label>
                <select className="input-dark" value={form.preferredCurrency} onChange={e => upd('preferredCurrency', e.target.value)}>
                  <option value="BRL">BRL (R$)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">Taxa USD → BRL</label>
                <input className="input-dark" type="number" step="0.01" placeholder="5.70" value={form.usdToBrl} onChange={e => upd('usdToBrl', parseFloat(e.target.value))} />
              </div>
              <div>
                <label className="text-xs text-[#8888aa] mb-1.5 block">Taxa EUR → BRL</label>
                <input className="input-dark" type="number" step="0.01" placeholder="5.90" value={form.eurToBrl ?? 5.90} onChange={e => upd('eurToBrl', parseFloat(e.target.value))} />
              </div>
            </div>
            <p className="text-xs text-[#55556a]">
              Taxas manuais — atualize periodicamente para valuações precisas.
              1 USD = {formatBRL(form.usdToBrl)} · 1 EUR = {formatBRL(form.eurToBrl ?? 5.90)}
            </p>
          </CardContent>
        </Card>

        </section>
        )}

        {/* ── Modo Casal ── */}
        {activeTab === 'compartilhamento' && (
        <section id="compartilhamento" aria-labelledby="compartilhamento-heading">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-[#ff7a00]" />
                Modo Casal — Compartilhamento
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SharingSettings />
          </CardContent>
        </Card>

        </section>
        )}

        {/* ── Instituições (Tasks 17 + 18) ── */}
        {activeTab === 'instituicoes' && (
        <section id="instituicoes" aria-labelledby="instituicoes-heading">
        <Card>
          <CardHeader><CardTitle>Instituições</CardTitle></CardHeader>
          <CardContent className="space-y-5">

            {/* Task 17 — read-only pills */}
            <div>
              <p className="text-xs text-[#55556a] mb-2">Estas são as instituições cadastradas em seu portfólio.</p>
              {portfolioInstitutions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {portfolioInstitutions.map(inst => (
                    <span
                      key={inst}
                      className="px-3 py-1 rounded-full text-xs font-medium bg-[#ff7a00]/10 border border-[#ff7a00]/20 text-[#ff7a00]"
                    >
                      {inst}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#55556a] italic">Nenhuma instituição encontrada no portfólio.</p>
              )}
            </div>

            <div className="h-px bg-[#1e1e2e]" />

            {/* Task 18 — default institution per currency */}
            <div>
              <p className="text-sm font-medium text-[#e8e8f0] mb-3">Padrão por Moeda</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">BRL</label>
                  <AccountSelect
                    value={form.defaultInstitutionBRL ?? ''}
                    onChange={v => upd('defaultInstitutionBRL', v)}
                    placeholder="Selecionar…"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">USD</label>
                  <AccountSelect
                    value={form.defaultInstitutionUSD ?? ''}
                    onChange={v => upd('defaultInstitutionUSD', v)}
                    placeholder="Selecionar…"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8888aa] mb-1.5 block">EUR</label>
                  <AccountSelect
                    value={form.defaultInstitutionEUR ?? ''}
                    onChange={v => upd('defaultInstitutionEUR', v)}
                    placeholder="Selecionar…"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        </section>
        )}

        {/* ── Categorias Personalizadas ── */}
        {activeTab === 'categorias' && (
        <section id="categorias" aria-labelledby="categorias-heading">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#55556a]" />
                <CardTitle>Categorias</CardTitle>
              </div>
              <button
                onClick={() => setShowNewCat(true)}
                className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Nova
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Custom categories list — sorted A→Z */}
            {customCategories.length > 0 ? (
              <div>
                <p className="text-xs text-[#55556a] mb-2">Suas categorias personalizadas</p>
                <div className="space-y-1">
                  {[...customCategories]
                    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                    .map(cat => (
                    <div key={cat.id} className="flex items-center justify-between px-3 py-2 bg-[#16161f] rounded-xl border border-[#1e1e2e]">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{cat.icon}</span>
                        <span className="text-sm font-medium" style={{ color: cat.color }}>{cat.name}</span>
                        <span className="text-[10px] text-[#55556a]">
                          {cat.type === 'expense' ? 'Despesa' : cat.type === 'income' ? 'Receita' : 'Ambos'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditCat(cat)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#55556a] hover:text-[#00d4ff] hover:bg-[#00d4ff]/10 transition-all"
                          title="Editar categoria"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteCustomCategory(cat.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#55556a] hover:text-[#ff4466] hover:bg-[#ff4466]/10 transition-all"
                          title="Remover categoria"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#55556a]">Nenhuma categoria personalizada ainda. Use os atalhos abaixo ou clique em Nova.</p>
            )}

            {/* Quick-add suggestions — sorted A→Z, excluding already added */}
            {suggestions.length > 0 && (
              <div>
                <p className="text-xs text-[#55556a] mb-2">Adicionar rapidamente</p>
                <div className="flex flex-wrap gap-2">
                  {[...suggestions]
                    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                    .map(s => (
                    <button
                      key={s.name}
                      onClick={() => addCustomCategory(s)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-[#2a2a3e] text-xs text-[#8888aa] hover:border-[#ff7a00]/40 hover:text-[#ff7a00] hover:bg-[#ff7a00]/5 transition-all"
                    >
                      <span>{s.icon}</span>
                      <span>{s.name}</span>
                      <Plus className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Built-in categories info — sorted A→Z */}
            <details>
              <summary className="text-xs text-[#55556a] cursor-pointer hover:text-[#8888aa] transition-colors select-none">
                Ver categorias padrão ({allCategories.length - customCategories.length})
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {allCategories
                  .filter(c => !customCategories.find(cc => cc.id === c.id))
                  .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                  .map(c => (
                  <span key={c.id} className="flex items-center gap-1 px-2 py-1 bg-[#16161f] rounded-lg text-xs text-[#55556a]">
                    <span>{c.icon}</span>{c.name}
                  </span>
                ))}
              </div>
            </details>
          </CardContent>
        </Card>

        </section>
        )}

        {/* ── Backup e Restauração ── */}
        {activeTab === 'backup' && (
        <section id="backup" aria-labelledby="backup-heading">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-[#55556a]" />
              <CardTitle>Backup e Restauração</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Export */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#e8e8f0]">Exportar Dados</p>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  Baixa um arquivo <span className="font-mono text-[#ff7a00]">.json</span> com todas as suas transações, investimentos, metas e configurações.
                </p>
              </div>
              <button
                onClick={exportData}
                className="btn-primary flex items-center gap-2 whitespace-nowrap flex-shrink-0"
              >
                <Download className="w-4 h-4" />
                Exportar
              </button>
            </div>

            <div className="h-px bg-[#1e1e2e]" />

            {/* Import */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#e8e8f0]">Importar Dados</p>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  Restaura um backup exportado anteriormente. <span className="text-[#ff4466]">Substitui todos os dados atuais.</span>
                </p>
                {importStatus === 'ok' && (
                  <p className="text-xs text-[#00ff88] mt-1">✓ Dados restaurados com sucesso!</p>
                )}
                {importStatus === 'error' && (
                  <p className="text-xs text-[#ff4466] mt-1">✗ Arquivo inválido ou corrompido.</p>
                )}
              </div>
              <div className="flex-shrink-0">
                <input
                  ref={importRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImport}
                />
                <button
                  onClick={() => importRef.current?.click()}
                  disabled={importing}
                  className="btn-primary flex items-center gap-2 whitespace-nowrap"
                >
                  <Upload className="w-4 h-4" />
                  {importing ? 'Importando…' : 'Importar'}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        </section>
        )}

        {/* ── Conta (email/senha) — só com Supabase ── */}
        {activeTab === 'conta' && (
        <section id="conta" aria-labelledby="conta-heading">
        {SUPABASE_CONFIGURED && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#55556a]" />
                <CardTitle>Conta</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Change email */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="w-3.5 h-3.5 text-[#55556a]" />
                  <p className="text-sm font-medium text-[#e8e8f0]">Alterar E-mail</p>
                </div>
                <div className="flex gap-3">
                  <input
                    className="input-dark flex-1"
                    type="email"
                    placeholder="novo@email.com"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleEmailChange()}
                  />
                  <button
                    onClick={handleEmailChange}
                    disabled={emailSaving || !newEmail.trim()}
                    className="btn-primary whitespace-nowrap"
                  >
                    {emailSaving ? 'Enviando…' : 'Alterar'}
                  </button>
                </div>
                {emailStatus === 'ok' && (
                  <p className="text-xs text-[#00ff88] mt-2">✓ Verifique seu e-mail para confirmar a alteração.</p>
                )}
                {emailStatus === 'error' && (
                  <p className="text-xs text-[#ff4466] mt-2">✗ Erro ao alterar e-mail. Tente novamente.</p>
                )}
              </div>

              <div className="h-px bg-[#1e1e2e]" />

              {/* Change password */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <KeyRound className="w-3.5 h-3.5 text-[#55556a]" />
                  <p className="text-sm font-medium text-[#e8e8f0]">Alterar Senha</p>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Nova Senha</label>
                    <input
                      className="input-dark"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#8888aa] mb-1.5 block">Confirmar Senha</label>
                    <input
                      className="input-dark"
                      type="password"
                      placeholder="Repita a senha"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-[#ff4466] mb-2">As senhas não coincidem.</p>
                )}
                <button
                  onClick={handlePasswordChange}
                  disabled={passSaving || !newPassword || newPassword !== confirmPassword || newPassword.length < 6}
                  className="btn-primary w-full"
                >
                  {passSaving ? 'Alterando…' : 'Alterar Senha'}
                </button>
                {passStatus === 'ok' && (
                  <p className="text-xs text-[#00ff88] mt-2">✓ Senha alterada com sucesso.</p>
                )}
                {passStatus === 'error' && (
                  <p className="text-xs text-[#ff4466] mt-2">✗ Erro ao alterar senha. Tente novamente.</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        </section>
        )}

        {/* ── Sugerir Funcionalidade (Task 19) ── */}
        {activeTab === 'sugerir' && (
        <section id="sugerir" aria-labelledby="sugerir-heading">
        <Card>
          <CardHeader><CardTitle>Sugerir Funcionalidade</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-[#55556a]">Suas ideias nos ajudam a melhorar o Luxor.</p>
            <textarea
              className="input-dark w-full min-h-[100px] resize-y"
              placeholder="Descreva sua sugestão…"
              value={suggestion}
              onChange={e => setSuggestion(e.target.value)}
            />
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleSendSuggestion}
                disabled={!suggestion.trim() || suggestionSending}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                <Mail className="w-4 h-4" />
                {suggestionSending ? 'Enviando…' : 'Enviar Sugestão'}
              </button>
              {suggestionSent && (
                <p className="text-xs text-[#00ff88]">✓ Obrigado! Sua sugestão foi enviada.</p>
              )}
              {suggestionError && (
                <p className="text-xs text-[#ff4466]">{suggestionError}</p>
              )}
            </div>
          </CardContent>
        </Card>

        </section>
        )}

        {/* ── Suporte e Bugs ── */}
        {activeTab === 'suporte' && (
        <section id="suporte" aria-labelledby="suporte-heading">
          <SupportSection userEmail={user?.email ?? null} />
        </section>
        )}

        {/* ── Apagar Dados e Conta ── */}
        {activeTab === 'apagar' && (
        <section id="apagar" aria-labelledby="apagar-heading">
        <Card className="border-[#ff4466]/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#ff4466]" />
              <CardTitle className="text-[#ff4466]">Apagar Dados e Conta</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#e8e8f0]">Apagar Todos os Dados</p>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  Remove permanentemente todas as transações, investimentos, impostos, documentos e configurações.
                  Suas categorias personalizadas serão mantidas.
                </p>
              </div>
              <button
                onClick={() => setShowClearModal(true)}
                disabled={clearing}
                className="btn-danger flex items-center gap-2 whitespace-nowrap flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                {clearing ? 'Apagando…' : 'Apagar Tudo'}
              </button>
            </div>

            <div className="h-px bg-[#ff4466]/10" />

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#e8e8f0]">Apagar Conta</p>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  Exclui permanentemente sua conta, login e todos os dados associados. Esta ação é
                  <span className="text-[#ff4466]"> irreversível</span> e você será desconectado imediatamente.
                </p>
                {deleteAccountStatus === 'error' && (
                  <p className="text-xs text-[#ff4466] mt-2">✗ Erro ao apagar conta. Tente novamente.</p>
                )}
              </div>
              <button
                onClick={() => setShowDeleteAccountModal(true)}
                disabled={deletingAccount}
                className="btn-danger flex items-center gap-2 whitespace-nowrap flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                {deletingAccount ? 'Apagando…' : 'Apagar Conta'}
              </button>
            </div>
          </CardContent>
        </Card>
        </section>
        )}

        </div>
      </div>

      <ClearDataModal
        open={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={handleClearAll}
      />
      <DeleteAccountModal
        open={showDeleteAccountModal}
        onClose={() => setShowDeleteAccountModal(false)}
        onConfirm={handleDeleteAccount}
      />
      <NewCategoryModal
        open={showNewCat}
        onClose={() => setShowNewCat(false)}
      />
      <NewCategoryModal
        open={!!editCat}
        editCategory={editCat}
        onClose={() => setEditCat(null)}
      />

      {/* Cancel renewal confirmation modal */}
      <Modal open={showCancelModal} onClose={() => { setShowCancelModal(false); setCancelError('') }} title="Cancelar Renovação" size="sm">
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-[#8888aa] leading-relaxed">
            Sua assinatura <strong className="text-[#e8e8f0]">não será renovada</strong> ao fim do período atual.
            {subscription.periodEnd && (
              <> Você mantém acesso completo até <strong className="text-[#e8e8f0]">{subscription.periodEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>.</>
            )}
          </p>
          <p className="text-xs text-[#55556a]">
            Pode reativar quando quiser antes dessa data.
          </p>
          {cancelError && (
            <p className="text-xs text-[#ff4466] font-medium">{cancelError}</p>
          )}
        </div>
        <ModalFooter>
          <button className="btn-ghost" onClick={() => { setShowCancelModal(false); setCancelError('') }} disabled={cancelLoading}>
            Manter assinatura
          </button>
          <button
            className="btn-danger"
            onClick={handleCancelRenewal}
            disabled={cancelLoading}
          >
            {cancelLoading ? <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> : <CalendarX className="w-4 h-4 inline mr-1.5" />}
            Confirmar cancelamento
          </button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
