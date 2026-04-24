import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { supabase } from '../../lib/supabase'

const STEPS = [
  {
    emoji: '',
    title: 'Bem-vindo ao Luxor',
    subtitle: '',
    bullets: [
      'Todos os dados ficam no seu navegador, 100% privado',
      'Sem cadastro obrigatório — comece agora mesmo',
      'Criado para investidores sérios que querem controle total',
    ],
  },
  {
    emoji: '📊',
    title: 'Painel Principal',
    subtitle: 'Sua visão geral financeira',
    bullets: [
      'Acompanhe receitas, despesas e saldo por período (Mensal/YTD/Anual)',
      'Score de saúde financeira calculado automaticamente',
      'Categorias expansíveis para ver cada lançamento',
    ],
  },
  {
    emoji: '💸',
    title: 'Fluxo de Caixa',
    subtitle: 'Controle total das suas movimentações',
    bullets: [
      'Adicione receitas e despesas com forma de pagamento (PIX, Cartão, Boleto…)',
      'Configure transações recorrentes (mensais ou semanais)',
      'Use fórmulas nos campos de valor: ex: \'1500*12/4\'',
    ],
  },
  {
    emoji: '📈',
    title: 'Patrimônio',
    subtitle: 'Seu portfólio completo em um lugar',
    bullets: [
      'Cadastre investimentos em BRL, USD e EUR com conversão automática',
      'Visualize por classe de ativo, benchmark e tratamento fiscal',
      'Acompanhe ganho de capital, dividendos e resultado total',
    ],
  },
  {
    emoji: '🎯',
    title: 'Metas Financeiras',
    subtitle: 'Planeje e projete seu futuro',
    bullets: [
      'Crie metas de poupança, gastos pontuais ou receitas futuras',
      'Projeção de patrimônio em 10 anos com taxa de crescimento ajustável',
      'Metas recorrentes para gastos que se repetem (ex: seguro do carro)',
    ],
  },
  {
    emoji: '⚙',
    title: 'Configurações & Dicas',
    subtitle: 'Personalize o Luxor para você',
    bullets: [
      'Defina sua taxa USD/BRL e EUR/BRL para conversão precisa',
      'Configure seu perfil de investidor (Conservador a Agressivo)',
      'Use o campo de fórmulas em qualquer campo numérico: \'500+200\', \'1000*12\'',
    ],
  },
]

const ONBOARDING_KEY = 'luxor_onboarding_done'

export function OnboardingModal() {
  const { settings, saveSettings } = useStore()
  const [open, setOpen] = useState(() => !localStorage.getItem(ONBOARDING_KEY))
  // -1 represents the name-capture step shown first
  const [step, setStep] = useState(-1)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')

  // Pre-fill the name from existing settings, signup metadata, or auth user data
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
  }, [settings?.name])

  const handleFinish = () => {
    localStorage.setItem(ONBOARDING_KEY, '1')
    setOpen(false)
  }

  const handlePrev = () => setStep((s) => Math.max(-1, s - 1))
  const handleNext = () => setStep((s) => Math.min(STEPS.length - 1, s + 1))

  const handleSubmitName = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setNameError('Digite seu nome (mínimo 2 caracteres).')
      return
    }
    setNameError('')
    await saveSettings({ ...settings, name: trimmed })
    setStep(0)
  }

  if (!open) return null

  // ── Name capture step (first-time only) ──
  if (step === -1) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.7)' }}
      >
        <div
          className="relative w-full max-w-md rounded-2xl border border-[#1e1e2e] bg-[#0d0d15] shadow-2xl"
          style={{ boxShadow: '0 0 60px rgba(255,122,0,0.08)' }}
        >
          <div className="h-1 w-full rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #ff7a00, #ff4500)' }} />
          <div className="p-8">
            <div className="flex justify-center mb-6">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-2xl text-4xl"
                style={{ background: 'rgba(255,122,0,0.1)', border: '1px solid rgba(255,122,0,0.25)' }}
              >
                👤
              </div>
            </div>
            <h2 className="text-center text-2xl font-bold text-[#e8e8f0] mb-1">
              Como devemos te chamar?
            </h2>
            <p className="text-center text-sm text-[#8888a0] mb-6">
              Personalize sua experiência no Luxor
            </p>

            <label className="block text-xs font-semibold uppercase tracking-widest text-[#8888a0] mb-2">
              Seu nome
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); if (nameError) setNameError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitName() }}
              placeholder="Ex: João Silva"
              className="w-full rounded-xl border border-[#2a2a3e] bg-[#16161f] px-4 py-3 text-sm text-[#e8e8f0] placeholder-[#55556a] outline-none focus:border-[#ff7a00] transition-colors"
            />
            {nameError && (
              <p className="mt-2 text-xs text-red-400">{nameError}</p>
            )}

            <button
              onClick={handleSubmitName}
              className="mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:opacity-90 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #ff7a00, #ff4500)' }}
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    )
  }

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const isFirst = step === 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.7)' }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-[#1e1e2e] bg-[#0d0d15] shadow-2xl"
        style={{ boxShadow: '0 0 60px rgba(255,122,0,0.08)' }}
      >
        <div className="h-1 w-full rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #ff7a00, #ff4500)' }} />

        <div className="p-8">
          <div className="flex justify-center mb-6">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl text-4xl"
              style={{ background: 'rgba(255,122,0,0.1)', border: '1px solid rgba(255,122,0,0.25)' }}
            >
              {current.emoji}
            </div>
          </div>

          <p className="text-center text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#ff7a00' }}>
            Passo {step + 1} de {STEPS.length}
          </p>

          <h2 className="text-center text-2xl font-bold text-[#e8e8f0] mb-1">
            {current.title}
          </h2>

          <p className="text-center text-sm text-[#8888a0] mb-8">
            {current.subtitle}
          </p>

          <ul className="space-y-3 mb-8">
            {current.bullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: 'rgba(255,122,0,0.15)', color: '#ff7a00' }}
                >
                  {i + 1}
                </span>
                <span className="text-sm text-[#b0b0c8] leading-relaxed">{bullet}</span>
              </li>
            ))}
          </ul>

          <div className="flex justify-center gap-2 mb-8">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className="rounded-full transition-all duration-200"
                style={{
                  width: i === step ? '24px' : '8px',
                  height: '8px',
                  background: i === step ? '#ff7a00' : '#2a2a3e',
                  border: 'none',
                  cursor: 'pointer',
                }}
                aria-label={`Ir para passo ${i + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              onClick={handlePrev}
              disabled={isFirst}
              className="flex-1 rounded-xl border border-[#2a2a3e] px-4 py-2.5 text-sm font-medium text-[#8888a0] transition-all duration-200 hover:border-[#3a3a4e] hover:text-[#b0b0c8] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Anterior
            </button>

            {isLast ? (
              <button
                onClick={handleFinish}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:opacity-90 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #ff7a00, #ff4500)' }}
              >
                Começar agora
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:opacity-90 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #ff7a00, #ff4500)' }}
              >
                Próximo
              </button>
            )}
          </div>

          <div className="mt-4 text-center">
            <button
              onClick={handleFinish}
              className="text-xs text-[#55556a] underline-offset-2 hover:text-[#8888a0] transition-colors"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Pular tutorial
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
