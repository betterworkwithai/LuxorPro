// ─────────────────────────────────────────────
//  Onboarding modal — 4-step activation flow
//  shown once after first login. Replaces the
//  previous feature-tour modal. Each step is
//  tracked in PostHog so we can see exactly
//  where users drop off.
// ─────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Target, ShieldCheck, TrendingDown, Home, Sun, MoreHorizontal,
  Shield, Wallet, Mountain, Flame, Sparkles, Link2, Database,
  ArrowRight, Loader2, CheckCircle2, ChevronLeft, FlaskConical,
  Plus, Minus,
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { supabase } from '../../lib/supabase'
import { todayISO, formatBRL } from '../../lib/formatters'
import { pfPath } from '../../constants'
import type { AppSettings, Transaction } from '../../lib/types'

const ONBOARDING_KEY = 'luxor_onboarding_v2_done'

// ── Step 1: goal options ──────────────────────
const GOALS: { id: NonNullable<AppSettings['primaryGoal']>; label: string; sub: string; icon: any; color: string }[] = [
  { id: 'reserva',       label: 'Construir reserva',        sub: 'Reserva de emergência primeiro', icon: ShieldCheck,     color: '#00ff88' },
  { id: 'dividas',       label: 'Sair das dívidas',          sub: 'Quitar pendências antes de investir', icon: TrendingDown, color: '#ff4466' },
  { id: 'independencia', label: 'Independência financeira',  sub: 'Patrimônio que sustenta meu padrão de vida', icon: Target,    color: '#ff7a00' },
  { id: 'imovel',        label: 'Comprar imóvel',            sub: 'Casa própria ou investimento em RE', icon: Home,         color: '#3b82f6' },
  { id: 'aposentadoria', label: 'Aposentadoria tranquila',   sub: 'Acumular para parar de trabalhar com tranquilidade', icon: Sun, color: '#f59e0b' },
  { id: 'outro',         label: 'Outro objetivo',             sub: 'Cadastro depois nas Metas',     icon: MoreHorizontal,  color: '#8888aa' },
]

// ── Step 2: suitability options ───────────────
const SUITABILITY = [
  { id: 'Conservador' as const, label: 'Conservador',  sub: 'Renda fixa, baixo risco',         icon: Shield,    color: '#00d4ff' },
  { id: 'Moderado'    as const, label: 'Moderado',     sub: 'Mix balanceado RF + ações',       icon: Wallet,    color: '#00ff88' },
  { id: 'Arrojado'    as const, label: 'Arrojado',     sub: 'Maior exposição a renda variável',icon: Mountain,  color: '#ff7a00' },
  { id: 'Agressivo'   as const, label: 'Agressivo',    sub: 'Alta concentração em risco',      icon: Flame,     color: '#ff4466' },
]

// Stable fire-and-forget tracker — never throws.
async function fireTrack(event: string, props: Record<string, unknown> = {}) {
  try {
    const { track } = await import('../../lib/analytics')
    track(event as any, props)
  } catch { /* analytics best-effort */ }
}

export function OnboardingModal() {
  const navigate = useNavigate()
  const {
    settings, saveSettings, enableDemoMode, addTransaction,
  } = useStore()

  const [open, setOpen] = useState(() => !localStorage.getItem(ONBOARDING_KEY))

  // Guard against fresh localStorage (Electron port change, cache cleared, new device):
  // if Supabase metadata says onboarding_done, close immediately without showing the modal.
  useEffect(() => {
    if (!open) return
    supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata as { onboarding_done?: boolean } | undefined
      if (meta?.onboarding_done) {
        try { localStorage.setItem(ONBOARDING_KEY, '1') } catch {}
        setOpen(false)
      }
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Step machine: -1 = name capture, 0..3 = the 4 activation steps, 4 = complete (closes)
  const [step, setStep] = useState(-1)

  // Step -1: name
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')

  // Step 0: goal
  const [goal, setGoal] = useState<AppSettings['primaryGoal'] | undefined>(settings.primaryGoal)

  // Step 1: suitability
  const [suit, setSuit] = useState<AppSettings['suitability']>(settings.suitability ?? 'Moderado')

  // Step 2: data source
  const [dataSourceLoading, setDataSourceLoading] = useState<'demo' | null>(null)
  const [dataSourceDone, setDataSourceDone] = useState<'demo' | 'pluggy' | null>(null)

  // Step 3: first transaction
  const [firstTx, setFirstTx] = useState({
    type: 'income' as 'income' | 'expense',
    description: '',
    amount: '',
  })
  const [firstTxSaving, setFirstTxSaving] = useState(false)
  const [firstTxSaved, setFirstTxSaved] = useState(false)

  // Pre-fill name from settings / signup metadata
  useEffect(() => {
    if (name) return
    if (settings?.name) { setName(settings.name); return }
    try {
      const stored = localStorage.getItem('luxor_signup_name')
      if (stored) { setName(stored); return }
    } catch {}
    supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata as { full_name?: string; name?: string } | undefined
      const metaName = meta?.full_name || meta?.name
      if (metaName) setName(metaName)
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.name])

  // Track the start once the user actually sees step -1
  useEffect(() => {
    if (open) fireTrack('onboarding_started')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ── Helpers ────────────────────────────────────
  const closeAndMarkDone = (reason: 'completed' | 'skipped' = 'completed') => {
    try { localStorage.setItem(ONBOARDING_KEY, '1') } catch {}
    // Persist in auth metadata so fresh localStorage (new device/port) never re-shows the modal
    supabase.auth.updateUser({ data: { onboarding_done: true } }).catch(() => {})
    fireTrack(reason === 'completed' ? 'onboarding_completed' : 'onboarding_skipped')
    setOpen(false)
  }

  const submitName = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 2) { setNameError('Digite seu nome (mínimo 2 caracteres).'); return }
    setNameError('')
    await saveSettings({ ...settings, name: trimmed })
    setStep(0)
  }

  const submitGoal = async () => {
    if (!goal) return
    await saveSettings({ ...settings, primaryGoal: goal })
    fireTrack('onboarding_step_completed', { step: 1, name: 'goal', value: goal })
    setStep(1)
  }

  const submitSuitability = async () => {
    await saveSettings({ ...settings, suitability: suit, primaryGoal: goal ?? settings.primaryGoal })
    fireTrack('onboarding_step_completed', { step: 2, name: 'suitability', value: suit })
    setStep(2)
  }

  const seedDemo = async () => {
    setDataSourceLoading('demo')
    try {
      await enableDemoMode()
      setDataSourceDone('demo')
      fireTrack('onboarding_step_completed', { step: 3, name: 'data_source', value: 'demo' })
    } finally {
      setDataSourceLoading(null)
    }
  }

  const goConnectPluggy = () => {
    fireTrack('onboarding_step_completed', { step: 3, name: 'data_source', value: 'pluggy' })
    closeAndMarkDone('completed')
    navigate(pfPath('/connections'))
  }

  const skipDataSource = () => {
    fireTrack('onboarding_step_completed', { step: 3, name: 'data_source', value: 'skipped' })
    setStep(3)
  }

  const submitFirstTx = async () => {
    const amt = parseFloat(firstTx.amount.replace('.', '').replace(',', '.'))
    if (!firstTx.description.trim() || !Number.isFinite(amt) || amt <= 0) return
    setFirstTxSaving(true)
    try {
      const tx: Omit<Transaction, 'id'> = {
        date: todayISO(),
        description: firstTx.description.trim(),
        category: firstTx.type === 'income' ? 'other_income' : 'outros',
        amount: amt,
        currency: 'BRL',
        type: firstTx.type,
        account: '',
      }
      await addTransaction(tx)
      setFirstTxSaved(true)
      fireTrack('onboarding_step_completed', { step: 4, name: 'first_tx', value: firstTx.type })
      // brief pause so user sees success state
      setTimeout(() => closeAndMarkDone('completed'), 700)
    } finally {
      setFirstTxSaving(false)
    }
  }

  if (!open) return null

  // ── Wrapper / shell ──────────────────────────
  const Shell: React.FC<{ children: React.ReactNode; width?: string }> = ({ children, width = 'max-w-xl' }) => (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 v2-root"
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.7)' }}
    >
      <div
        className={`relative w-full ${width} rounded-2xl border border-[#1e1e2e] bg-[#0d0d15] shadow-2xl`}
        style={{ boxShadow: '0 0 60px rgba(255,122,0,0.08)' }}
      >
        <div className="h-1 w-full rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #ff7a00, #ff4500)' }} />
        {children}
      </div>
    </div>
  )

  const StepIndicator = ({ active, total = 4 }: { active: number; total?: number }) => (
    <div className="flex justify-center gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="h-1.5 rounded-full transition-all"
          style={{
            width: i === active ? 28 : 8,
            background: i <= active ? '#ff7a00' : '#2a2a3e',
          }}
        />
      ))}
    </div>
  )

  const SkipBtn = ({ onClick, label = 'Pular tutorial' }: { onClick: () => void; label?: string }) => (
    <button
      onClick={onClick}
      className="text-xs text-[#55556a] hover:text-[#8888a0] transition-colors"
      style={{ background: 'none', border: 'none', cursor: 'pointer' }}
    >
      {label}
    </button>
  )

  const BackBtn = ({ onClick }: { onClick: () => void }) => (
    <button
      onClick={onClick}
      className="absolute top-4 left-4 w-8 h-8 rounded-lg flex items-center justify-center text-[#55556a] hover:text-[#e8e8f0] hover:bg-[#16161f] transition-colors"
      aria-label="Voltar"
    >
      <ChevronLeft className="w-4 h-4" />
    </button>
  )

  // ── Step -1: Name capture ────────────────────
  if (step === -1) {
    return (
      <Shell width="max-w-md">
        <div className="p-8">
          <div className="flex justify-center mb-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl"
              style={{ background: 'rgba(255,122,0,0.1)', border: '1px solid rgba(255,122,0,0.25)' }}>
              <Sparkles className="w-8 h-8" style={{ color: '#ff7a00' }} />
            </div>
          </div>
          <h2 className="text-center text-2xl font-bold text-[#e8e8f0] mb-1">Bem-vindo ao Luxor.Pro</h2>
          <p className="text-center text-sm text-[#8888a0] mb-6">4 passos rápidos pra deixar tudo configurado.</p>

          <label className="block text-xs font-semibold uppercase tracking-widest text-[#8888a0] mb-2">Como devemos te chamar?</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); if (nameError) setNameError('') }}
            onKeyDown={(e) => e.key === 'Enter' && submitName()}
            placeholder="Ex: João Silva"
            className="w-full rounded-xl border border-[#2a2a3e] bg-[#16161f] px-4 py-3 text-sm text-[#e8e8f0] placeholder-[#55556a] outline-none focus:border-[#ff7a00] transition-colors"
          />
          {nameError && <p className="mt-2 text-xs text-red-400">{nameError}</p>}

          <button
            onClick={submitName}
            className="mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #ff7a00, #ff4500)' }}
          >
            Continuar
          </button>
          <div className="mt-4 text-center">
            <SkipBtn onClick={() => closeAndMarkDone('skipped')} />
          </div>
        </div>
      </Shell>
    )
  }

  // ── Step 0: Goal ─────────────────────────────
  if (step === 0) {
    return (
      <Shell>
        <BackBtn onClick={() => setStep(-1)} />
        <div className="p-8">
          <StepIndicator active={0} />
          <p className="text-center text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#ff7a00' }}>
            Passo 1 de 4
          </p>
          <h2 className="text-center text-2xl font-bold text-[#e8e8f0] mb-1">
            Qual é seu objetivo {name ? `agora, ${name.split(' ')[0]}` : 'principal'}?
          </h2>
          <p className="text-center text-sm text-[#8888a0] mb-6">Escolha o mais importante. Você cria outras metas depois.</p>

          <div className="grid sm:grid-cols-2 gap-2 mb-6">
            {GOALS.map(g => {
              const selected = goal === g.id
              return (
                <button
                  key={g.id}
                  onClick={() => setGoal(g.id)}
                  className="text-left rounded-xl border p-3 transition-all"
                  style={{
                    borderColor: selected ? g.color : '#1e1e2e',
                    background: selected ? `${g.color}10` : '#0d0d15',
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${g.color}1f`, color: g.color }}>
                      <g.icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#e8e8f0] truncate">{g.label}</p>
                      <p className="text-[10px] text-[#8888aa] truncate">{g.sub}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="flex gap-3">
            <button
              onClick={submitGoal}
              disabled={!goal}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #ff7a00, #ff4500)' }}
            >
              Próximo
            </button>
          </div>
          <div className="mt-4 text-center">
            <SkipBtn onClick={() => closeAndMarkDone('skipped')} />
          </div>
        </div>
      </Shell>
    )
  }

  // ── Step 1: Suitability ──────────────────────
  if (step === 1) {
    return (
      <Shell>
        <BackBtn onClick={() => setStep(0)} />
        <div className="p-8">
          <StepIndicator active={1} />
          <p className="text-center text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#ff7a00' }}>
            Passo 2 de 4
          </p>
          <h2 className="text-center text-2xl font-bold text-[#e8e8f0] mb-1">Qual seu perfil de investidor?</h2>
          <p className="text-center text-sm text-[#8888a0] mb-6">Define as recomendações de alocação no painel.</p>

          <div className="grid sm:grid-cols-2 gap-2 mb-6">
            {SUITABILITY.map(s => {
              const selected = suit === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setSuit(s.id)}
                  className="text-left rounded-xl border p-3 transition-all"
                  style={{
                    borderColor: selected ? s.color : '#1e1e2e',
                    background: selected ? `${s.color}10` : '#0d0d15',
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${s.color}1f`, color: s.color }}>
                      <s.icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#e8e8f0] truncate">{s.label}</p>
                      <p className="text-[10px] text-[#8888aa] truncate">{s.sub}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <button
            onClick={submitSuitability}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #ff7a00, #ff4500)' }}
          >
            Próximo
          </button>
          <div className="mt-4 text-center">
            <SkipBtn onClick={() => closeAndMarkDone('skipped')} />
          </div>
        </div>
      </Shell>
    )
  }

  // ── Step 2: Data source (Pluggy or Demo) ─────
  if (step === 2) {
    return (
      <Shell>
        <BackBtn onClick={() => setStep(1)} />
        <div className="p-8">
          <StepIndicator active={2} />
          <p className="text-center text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#ff7a00' }}>
            Passo 3 de 4
          </p>
          <h2 className="text-center text-2xl font-bold text-[#e8e8f0] mb-1">Por onde começar?</h2>
          <p className="text-center text-sm text-[#8888a0] mb-6">Você pode mudar isso a qualquer momento.</p>

          <div className="space-y-3 mb-6">
            {/* Pluggy */}
            <button
              onClick={goConnectPluggy}
              className="w-full rounded-xl border border-[#1e1e2e] bg-[#0d0d15] hover:border-[#00d4ff]/40 hover:bg-[#0a0a14] transition-all p-4 text-left flex items-center gap-4"
            >
              <span className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff' }}>
                <Link2 className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#e8e8f0]">Conectar minha conta</p>
                <p className="text-[11px] text-[#8888aa] leading-relaxed mt-0.5">
                  Open Finance via Pluggy · puxa todas as transações + posições automaticamente.
                  Nubank, Itaú, Bradesco, XP, Avenue e mais.
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-[#55556a] flex-shrink-0" />
            </button>

            {/* Demo */}
            <button
              onClick={dataSourceDone === 'demo' ? () => setStep(3) : seedDemo}
              disabled={!!dataSourceLoading}
              className="w-full rounded-xl border border-[#1e1e2e] bg-[#0d0d15] hover:border-[#ff7a00]/40 hover:bg-[#14100a] transition-all p-4 text-left flex items-center gap-4 disabled:opacity-60"
            >
              <span className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: dataSourceDone === 'demo' ? 'rgba(0,255,136,0.12)' : 'rgba(255,122,0,0.1)', color: dataSourceDone === 'demo' ? '#00ff88' : '#ff7a00' }}>
                {dataSourceLoading === 'demo'
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : dataSourceDone === 'demo'
                  ? <CheckCircle2 className="w-5 h-5" />
                  : <FlaskConical className="w-5 h-5" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#e8e8f0]">
                  {dataSourceDone === 'demo' ? 'Dados demo carregados!' : 'Carregar dados de demonstração'}
                </p>
                <p className="text-[11px] text-[#8888aa] leading-relaxed mt-0.5">
                  {dataSourceDone === 'demo'
                    ? '6 meses de transações + 12 investimentos prontos pra explorar. Apague em 1 clique nas Configurações.'
                    : '6 meses de transações sintéticas + 12 investimentos diversificados. Pra explorar antes de cadastrar seus dados.'}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-[#55556a] flex-shrink-0" />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep(3)}
              className="flex-1 rounded-xl border border-[#1e1e2e] bg-[#0d0d15] hover:border-[#2a2a3e] px-4 py-2.5 text-sm font-medium text-[#8888a0] transition-all"
            >
              Pular este passo
            </button>
            {dataSourceDone === 'demo' && (
              <button
                onClick={() => setStep(3)}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #ff7a00, #ff4500)' }}
              >
                Continuar
              </button>
            )}
          </div>
          <div className="mt-4 text-center">
            <SkipBtn onClick={() => closeAndMarkDone('skipped')} />
          </div>
        </div>
      </Shell>
    )
  }

  // ── Step 3: First transaction ────────────────
  if (step === 3) {
    const amtNum = parseFloat(firstTx.amount.replace('.', '').replace(',', '.'))
    const canSubmit = firstTx.description.trim().length > 0 && Number.isFinite(amtNum) && amtNum > 0
    return (
      <Shell>
        <BackBtn onClick={() => setStep(2)} />
        <div className="p-8">
          <StepIndicator active={3} />
          <p className="text-center text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#ff7a00' }}>
            Passo 4 de 4
          </p>
          <h2 className="text-center text-2xl font-bold text-[#e8e8f0] mb-1">Seu primeiro lançamento</h2>
          <p className="text-center text-sm text-[#8888a0] mb-6">
            Cadastre uma receita ou despesa real pra dar partida no app.
          </p>

          {firstTxSaved ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0,255,136,.12)', border: '1px solid rgba(0,255,136,.25)' }}>
                <CheckCircle2 className="w-7 h-7 text-[#00ff88]" />
              </div>
              <p className="text-sm font-semibold text-[#00ff88]">Lançamento criado!</p>
              <p className="text-xs text-[#8888aa]">Bem-vindo ao Luxor.Pro. Carregando seu painel…</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setFirstTx(f => ({ ...f, type: 'income' }))}
                  className="flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-1.5"
                  style={{
                    borderColor: firstTx.type === 'income' ? '#00ff88' : '#1e1e2e',
                    background: firstTx.type === 'income' ? 'rgba(0,255,136,.08)' : '#0d0d15',
                    color: firstTx.type === 'income' ? '#00ff88' : '#8888aa',
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> Receita
                </button>
                <button
                  onClick={() => setFirstTx(f => ({ ...f, type: 'expense' }))}
                  className="flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-1.5"
                  style={{
                    borderColor: firstTx.type === 'expense' ? '#ff4466' : '#1e1e2e',
                    background: firstTx.type === 'expense' ? 'rgba(255,68,102,.08)' : '#0d0d15',
                    color: firstTx.type === 'expense' ? '#ff4466' : '#8888aa',
                  }}
                >
                  <Minus className="w-3.5 h-3.5" /> Despesa
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-[#8888a0] mb-1.5">Descrição</label>
                <input
                  autoFocus
                  type="text"
                  value={firstTx.description}
                  onChange={(e) => setFirstTx(f => ({ ...f, description: e.target.value }))}
                  placeholder={firstTx.type === 'income' ? 'Ex: Salário · Empresa X' : 'Ex: Aluguel · Apto Centro'}
                  className="w-full rounded-xl border border-[#2a2a3e] bg-[#16161f] px-4 py-2.5 text-sm text-[#e8e8f0] placeholder-[#55556a] outline-none focus:border-[#ff7a00]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-[#8888a0] mb-1.5">Valor (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={firstTx.amount}
                  onChange={(e) => setFirstTx(f => ({ ...f, amount: e.target.value.replace(/[^0-9.,]/g, '') }))}
                  onKeyDown={(e) => e.key === 'Enter' && canSubmit && submitFirstTx()}
                  placeholder="Ex: 1500,00"
                  className="w-full rounded-xl border border-[#2a2a3e] bg-[#16161f] px-4 py-2.5 text-sm text-[#e8e8f0] placeholder-[#55556a] outline-none focus:border-[#ff7a00]"
                />
                {Number.isFinite(amtNum) && amtNum > 0 && (
                  <p className="mt-1 text-[11px] text-[#8888aa]">
                    Será lançado como <span className="font-semibold" style={{ color: firstTx.type === 'income' ? '#00ff88' : '#ff4466' }}>
                      {firstTx.type === 'income' ? '+' : '−'}{formatBRL(amtNum)}
                    </span> em {todayISO().split('-').reverse().join('/')}.
                  </p>
                )}
              </div>

              <button
                onClick={submitFirstTx}
                disabled={!canSubmit || firstTxSaving}
                className="w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #ff7a00, #ff4500)' }}
              >
                {firstTxSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {firstTxSaving ? 'Salvando…' : 'Criar lançamento e começar'}
              </button>
            </div>
          )}
          <div className="mt-4 text-center">
            <SkipBtn onClick={() => closeAndMarkDone('completed')} label="Pular e ir pro painel" />
          </div>
        </div>
      </Shell>
    )
  }

  return null
}
