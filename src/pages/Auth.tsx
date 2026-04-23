import React, { useState } from 'react'
import { Mail, Lock, User, Eye, EyeOff, ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { supabase, SUPABASE_CONFIGURED } from '../lib/supabase'
import { LOCAL_AUTH_KEY } from '../App'
import { markNewUser } from '../lib/stripe'
import { clsx } from 'clsx'
import luxorLogo from '../assets/logo.png'

type Tab = 'login' | 'signup' | 'reset'

// Luxor brand palette
const BRAND = '#ff7a00'
const BRAND_DARK = '#ff4500'
const BRAND_GRADIENT = 'linear-gradient(135deg, #ff7a00, #ff4500)'

function LuxorLogo() {
  return (
    <div className="flex flex-col items-center gap-3 mb-8">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
        style={{
          background: 'rgba(255,122,0,0.1)',
          border: '1px solid rgba(255,122,0,0.3)',
          boxShadow: '0 0 30px rgba(255,122,0,0.15)',
        }}
      >
        <img src={luxorLogo} alt="Luxor" className="w-9 h-9 object-contain" />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[#e8e8f0] tracking-tight">Luxor</h1>
        <p className="text-xs text-[#8888aa] mt-1 italic">Automação de Elite para o seu capital</p>
      </div>
    </div>
  )
}

// ─── Input field ─────────────────────────────
interface InputProps {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  disabled?: boolean
  icon?: React.ReactNode
  rightElement?: React.ReactNode
}

function Field({ label, type = 'text', value, onChange, placeholder, autoComplete, disabled, icon, rightElement }: InputProps) {
  return (
    <div>
      <label className="text-xs font-medium text-[#8888aa] block mb-1.5">{label}</label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#55556a]">{icon}</div>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          className={clsx(
            'w-full bg-[#111118] border border-[#1e1e2e] rounded-xl text-sm text-[#e8e8f0]',
            'placeholder:text-[#55556a] transition-all duration-150 outline-none',
            'focus:border-[#ff7a00]/60 focus:ring-1 focus:ring-[#ff7a00]/20',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'py-3 pr-4',
            icon ? 'pl-10' : 'pl-4',
          )}
        />
        {rightElement && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightElement}</div>
        )}
      </div>
    </div>
  )
}

// ─── Alert banner ────────────────────────────
function Alert({ type, message }: { type: 'error' | 'success'; message: string }) {
  return (
    <div className={clsx(
      'flex items-start gap-2.5 p-3 rounded-xl text-xs border',
      type === 'error'
        ? 'bg-[#ff4466]/5 border-[#ff4466]/20 text-[#ff4466]'
        : 'bg-[#00ff88]/5 border-[#00ff88]/20 text-[#00ff88]',
    )}>
      {type === 'error'
        ? <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        : <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />}
      <span>{message}</span>
    </div>
  )
}

// ─── Login form ───────────────────────────────
function LoginForm({ onForgot }: { onForgot: () => void }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Preencha e-mail e senha.'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) setError(translateError(err.message))
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      {error && <Alert type="error" message={error} />}

      <Field
        label="E-mail"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="voce@email.com"
        autoComplete="email"
        disabled={loading}
        icon={<Mail className="w-4 h-4" />}
      />
      <Field
        label="Senha"
        type={showPwd ? 'text' : 'password'}
        value={password}
        onChange={setPassword}
        placeholder="••••••••"
        autoComplete="current-password"
        disabled={loading}
        icon={<Lock className="w-4 h-4" />}
        rightElement={
          <button type="button" onClick={() => setShowPwd(s => !s)} className="text-[#55556a] hover:text-[#e8e8f0] transition-colors">
            {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
      />

      <div className="flex justify-end">
        <button type="button" onClick={onForgot} className="text-xs text-[#55556a] hover:text-[#ff7a00] transition-colors">
          Esqueceu a senha?
        </button>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:opacity-90 active:scale-[0.98]"
        style={{ background: BRAND_GRADIENT, boxShadow: '0 8px 24px rgba(255,122,0,0.25)' }}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}

// ─── Suitability options ──────────────────────
type Suitability = 'Conservador' | 'Moderado' | 'Arrojado' | 'Agressivo'
const SUITABILITY_OPTIONS: { value: Suitability; desc: string }[] = [
  { value: 'Conservador', desc: 'Renda fixa, baixo risco' },
  { value: 'Moderado',    desc: 'Mix balanceado' },
  { value: 'Arrojado',    desc: 'Maior exposição a variável' },
  { value: 'Agressivo',   desc: 'Alta concentração em risco' },
]

// ─── Sign-up form ─────────────────────────────
function SignupForm() {
  const [name,        setName]        = useState('')
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [suitability, setSuitability] = useState<Suitability>('Moderado')
  const [showPwd,     setShowPwd]     = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const trimmedName = name.trim()
    if (!trimmedName)         { setError('Informe seu nome.'); return }
    if (trimmedName.length < 2) { setError('O nome deve ter pelo menos 2 caracteres.'); return }
    if (!email || !password)  { setError('Preencha todos os campos.'); return }
    if (!/[a-z]/.test(password)) { setError('A senha deve conter pelo menos uma letra minúscula.'); return }
    if (!/[A-Z]/.test(password)) { setError('A senha deve conter pelo menos uma letra maiúscula.'); return }
    if (!/[0-9]/.test(password)) { setError('A senha deve conter pelo menos um número.'); return }
    if (!/[^a-zA-Z0-9]/.test(password)) { setError('A senha deve conter pelo menos um símbolo (!@#…).'); return }
    if (password.length < 8)  { setError('A senha deve ter pelo menos 8 caracteres.'); return }
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: trimmedName, name: trimmedName, suitability },
      },
    })
    setLoading(false)
    if (err) setError(translateError(err.message))
    else {
      // Persist locally so onboarding / settings can pre-fill
      try {
        localStorage.setItem('luxor_signup_name', trimmedName)
        localStorage.setItem('luxor_signup_suitability', suitability)
        markNewUser()
      } catch {}
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="text-center space-y-4 py-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
          style={{ background: 'rgba(255,122,0,0.1)', border: '1px solid rgba(255,122,0,0.3)' }}
        >
          <CheckCircle2 className="w-7 h-7" style={{ color: BRAND }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#e8e8f0]">Conta criada, {name.trim().split(' ')[0]}!</p>
          <p className="text-xs text-[#55556a] mt-1 leading-relaxed">
            Verifique seu e-mail <span style={{ color: BRAND }}>{email}</span> para confirmar o cadastro e então faça login.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSignup} className="space-y-4">
      {error && <Alert type="error" message={error} />}

      <Field
        label="Nome"
        type="text"
        value={name}
        onChange={setName}
        placeholder="Seu nome completo"
        autoComplete="name"
        disabled={loading}
        icon={<User className="w-4 h-4" />}
      />
      <Field
        label="E-mail"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="voce@email.com"
        autoComplete="email"
        disabled={loading}
        icon={<Mail className="w-4 h-4" />}
      />
      <Field
        label="Senha"
        type={showPwd ? 'text' : 'password'}
        value={password}
        onChange={setPassword}
        placeholder="Senha Forte Requerida"
        autoComplete="new-password"
        disabled={loading}
        icon={<Lock className="w-4 h-4" />}
        rightElement={
          <button type="button" onClick={() => setShowPwd(s => !s)} className="text-[#55556a] hover:text-[#e8e8f0] transition-colors">
            {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
      />
      <Field
        label="Confirmar Senha"
        type={showPwd ? 'text' : 'password'}
        value={confirm}
        onChange={setConfirm}
        placeholder="Repita a senha"
        autoComplete="new-password"
        disabled={loading}
        icon={<Lock className="w-4 h-4" />}
      />

      {/* Password match indicator */}
      {confirm.length > 0 && (
        <div className={clsx(
          'flex items-center gap-1.5 text-[11px] font-medium',
          password === confirm ? 'text-[#00ff88]' : 'text-[#ff4466]',
        )}>
          {password === confirm
            ? <CheckCircle2 className="w-3.5 h-3.5" />
            : <AlertCircle  className="w-3.5 h-3.5" />}
          {password === confirm ? 'Senhas coincidem' : 'Senhas não coincidem'}
        </div>
      )}

      {/* Password requirements checklist */}
      {password.length > 0 && (() => {
        const checks = [
          { ok: password.length >= 8,          label: 'Mínimo 8 caracteres' },
          { ok: /[A-Z]/.test(password),         label: 'Letra maiúscula (A-Z)' },
          { ok: /[a-z]/.test(password),         label: 'Letra minúscula (a-z)' },
          { ok: /[0-9]/.test(password),         label: 'Número (0–9)' },
          { ok: /[^a-zA-Z0-9]/.test(password),  label: 'Símbolo (!@#$…)' },
        ]
        const met = checks.filter(c => c.ok).length
        const barColor = met <= 1 ? '#ff4466' : met <= 3 ? '#f59e0b' : met === 4 ? '#ff7a00' : '#00ff88'
        return (
          <div className="space-y-2">
            {/* Progress bar */}
            <div className="flex gap-1">
              {checks.map((_, i) => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded-full transition-all duration-300"
                  style={{ background: i < met ? barColor : '#1e1e2e' }}
                />
              ))}
            </div>
            {/* Checklist */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 p-3 rounded-xl bg-[#0a0a10] border border-[#1a1a28]">
              {checks.map(({ ok, label }) => (
                <div key={label} className={clsx('flex items-center gap-1.5 text-[11px] transition-colors', ok ? 'text-[#00ff88]' : 'text-[#3a3a4e]')}>
                  {ok
                    ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                    : <AlertCircle  className="w-3 h-3 flex-shrink-0" />}
                  {label}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Suitability — investor profile */}
      <div>
        <label className="text-xs font-medium text-[#8888aa] block mb-1.5">Perfil de Investidor</label>
        <div className="grid grid-cols-2 gap-2">
          {SUITABILITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSuitability(opt.value)}
              disabled={loading}
              className={clsx(
                'flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all',
                suitability === opt.value
                  ? 'bg-[#ff7a00]/10 border-[#ff7a00]/40 text-[#ff7a00]'
                  : 'bg-[#111118] border-[#1e1e2e] text-[#8888aa] hover:border-[#ff7a00]/20 hover:text-[#e8e8f0]',
              )}
            >
              <span className="text-xs font-semibold">{opt.value}</span>
              <span className="text-[10px] leading-snug opacity-75">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:opacity-90 active:scale-[0.98]"
        style={{ background: BRAND_GRADIENT, boxShadow: '0 8px 24px rgba(255,122,0,0.25)' }}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Criando conta…' : 'Criar Conta'}
      </button>
    </form>
  )
}

// ─── Reset password form ──────────────────────
function ResetForm({ onBack }: { onBack: () => void }) {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [sent,    setSent]    = useState(false)

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email) { setError('Informe seu e-mail.'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (err) setError(translateError(err.message))
    else     setSent(true)
  }

  if (sent) {
    return (
      <div className="space-y-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-[#55556a] hover:text-[#e8e8f0] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
        </button>
        <div className="text-center space-y-3 py-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
            style={{ background: 'rgba(255,122,0,0.1)', border: '1px solid rgba(255,122,0,0.3)' }}
          >
            <Mail className="w-7 h-7" style={{ color: BRAND }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#e8e8f0]">Link enviado!</p>
            <p className="text-xs text-[#55556a] mt-1 leading-relaxed">
              Verifique <span style={{ color: BRAND }}>{email}</span> e clique no link para redefinir sua senha.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleReset} className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs text-[#55556a] hover:text-[#e8e8f0] transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
      </button>

      <div>
        <p className="text-sm text-[#8888aa] leading-relaxed">
          Informe o e-mail da sua conta e enviaremos um link para redefinir sua senha.
        </p>
      </div>

      {error && <Alert type="error" message={error} />}

      <Field
        label="E-mail"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="voce@email.com"
        autoComplete="email"
        disabled={loading}
        icon={<Mail className="w-4 h-4" />}
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 hover:opacity-90 active:scale-[0.98]"
        style={{ background: BRAND_GRADIENT, boxShadow: '0 8px 24px rgba(255,122,0,0.25)' }}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Enviando…' : 'Enviar Link de Redefinição'}
      </button>
    </form>
  )
}

// ─── Error translation ────────────────────────
function translateError(msg: string): string {
  if (/invalid login credentials|invalid_credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(msg))    return 'Confirme seu e-mail antes de fazer login.'
  if (/user already registered/i.test(msg)) return 'Este e-mail já possui uma conta. Faça login.'
  if (/password.*characters/i.test(msg))   return 'A senha deve ter pelo menos 6 caracteres.'
  if (/rate limit/i.test(msg))             return 'Muitas tentativas. Aguarde alguns minutos.'
  if (/network/i.test(msg))               return 'Sem conexão. Verifique sua internet.'
  if (/failed to fetch|load failed|networkerror/i.test(msg))
    return 'Não foi possível conectar ao servidor. Verifique se o VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estão configurados corretamente no arquivo .env e reinicie o servidor.'
  return msg
}

// ─── Local-only screen (no Supabase configured) ──
function LocalScreen() {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <p className="text-sm text-[#8888aa]">
          Acesse seus dados financeiros localmente.
        </p>
      </div>

      <button
        onClick={() => {
          localStorage.setItem(LOCAL_AUTH_KEY, '1')
          window.location.reload()
        }}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
        style={{ background: BRAND_GRADIENT, boxShadow: '0 8px 24px rgba(255,122,0,0.25)' }}
      >
        Entrar
      </button>

      <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 space-y-1.5">
        <p className="text-[11px] font-semibold text-[#8888aa]">Para ativar login com e-mail:</p>
        <ol className="text-[11px] text-[#55556a] space-y-1 list-decimal list-inside leading-relaxed">
          <li>Crie um projeto grátis em <span style={{ color: BRAND }}>supabase.com</span></li>
          <li>Copie a URL e a chave anon do projeto</li>
          <li>Cole no arquivo <span className="font-mono text-[#e8e8f0]">.env</span> e reinicie o servidor</li>
        </ol>
      </div>
    </div>
  )
}

// ─── Main Auth page ───────────────────────────
export default function Auth() {
  const [tab, setTab] = useState<Tab>('login')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'login',  label: 'Entrar' },
    { id: 'signup', label: 'Criar Conta' },
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(255,122,0,0.07)' }} />
        <div className="absolute bottom-1/4 right-1/3 w-64 h-64 rounded-full blur-3xl" style={{ background: 'rgba(255,69,0,0.06)' }} />
      </div>

      <div className="relative w-full max-w-md">
        <div
          className="bg-[#0d0d15] border border-[#1e1e2e] rounded-3xl p-8 shadow-2xl overflow-hidden"
          style={{ boxShadow: '0 0 60px rgba(255,122,0,0.06)' }}
        >
          <div className="h-1 -mx-8 -mt-8 mb-6" style={{ background: BRAND_GRADIENT }} />
          <LuxorLogo />

          {/* ── No Supabase: simple local entry ── */}
          {!SUPABASE_CONFIGURED ? (
            <LocalScreen />
          ) : tab === 'reset' ? (
            <>
              <h2 className="text-base font-semibold text-[#e8e8f0] mb-5">Redefinir Senha</h2>
              <ResetForm onBack={() => setTab('login')} />
            </>
          ) : (
            <>
              {/* Tab switcher */}
              <div className="flex gap-1 bg-[#111118] rounded-xl p-1 border border-[#1e1e2e] mb-6">
                {tabs.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={clsx(
                      'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                      tab === t.id
                        ? 'text-white'
                        : 'text-[#55556a] hover:text-[#8888aa]',
                    )}
                    style={tab === t.id ? { background: BRAND_GRADIENT } : undefined}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'login'  && <LoginForm onForgot={() => setTab('reset')} />}
              {tab === 'signup' && <SignupForm />}
            </>
          )}
        </div>

        <p className="text-center text-[10px] text-[#2a2a3e] mt-6">
          Luxor · Automação de Elite para o seu capital
        </p>
      </div>
    </div>
  )
}
