import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, SUPABASE_CONFIGURED } from '../lib/supabase'

// ── Fonts injected once ───────────────────────────────────────────────────────
const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=IBM+Plex+Mono:wght@400;500;600&family=DM+Sans:wght@300;400;500;600&display=swap'

// ── Floor definitions ─────────────────────────────────────────────────────────
interface Andar {
  n: number; label: string; sub: string; desc: string
  color: string; shadow: string; minX: number; maxX: number; pop: string
}

const ANDARES: Andar[] = [
  { n: 1, label: 'Fragilidade',  sub: 'Sem estrutura financeira',
    desc: 'Sem reserva de emergência. Um imprevisto pode colapsar suas finanças. É o ponto de partida de quase metade dos brasileiros.',
    color: '#ff4466', shadow: 'rgba(255,68,102,.55)',   minX: 0,   maxX: 3,   pop: '~42%' },
  { n: 2, label: 'Sobrevivência', sub: 'Reserva inicial formada',
    desc: 'Você tem alguma reserva, mas ainda está vulnerável a crises de médio prazo. Foco: eliminar dívidas e ampliar a proteção.',
    color: '#ff7a00', shadow: 'rgba(255,122,0,.55)',    minX: 3,   maxX: 12,  pop: '~24%' },
  { n: 3, label: 'Estabilidade',  sub: 'Reserva de emergência consolidada',
    desc: 'Reserva de 6–12 meses coberta. Início da construção de patrimônio real com investimentos diversificados.',
    color: '#f59e0b', shadow: 'rgba(245,158,11,.55)',   minX: 12,  maxX: 36,  pop: '~17%' },
  { n: 4, label: 'Acumulação',   sub: 'Patrimônio em crescimento consistente',
    desc: 'Diversificação entre classes de ativos em andamento. Rendimentos passivos já contribuem para o crescimento patrimonial.',
    color: '#84cc16', shadow: 'rgba(132,204,22,.55)',   minX: 36,  maxX: 84,  pop: '~10%' },
  { n: 5, label: 'Solidez',      sub: 'Renda passiva emergente',
    desc: 'Patrimônio relevante gerando rendimentos passivos. Você está entre os 7% mais ricos do Brasil.',
    color: '#00d4ff', shadow: 'rgba(0,212,255,.55)',    minX: 84,  maxX: 180, pop: '~5%'  },
  { n: 6, label: 'Liberdade',    sub: 'Independência financeira',
    desc: 'Seus investimentos cobrem seus gastos. Você pode escolher como e quando trabalhar — liberdade real.',
    color: '#a78bfa', shadow: 'rgba(167,139,250,.55)',  minX: 180, maxX: 480, pop: '~2%'  },
  { n: 7, label: 'Legado',       sub: 'Riqueza geracional',
    desc: 'Seu patrimônio transcende sua própria vida. Você constrói riqueza que beneficiará gerações futuras.',
    color: '#ffd700', shadow: 'rgba(255,215,0,.65)',    minX: 480, maxX: Infinity, pop: '~0,3%' },
]

// ── Calc helpers ──────────────────────────────────────────────────────────────
const getAndar = (p: number, r: number) => {
  const m = r > 0 ? p / r : 0
  for (let i = ANDARES.length - 1; i >= 0; i--)
    if (m >= ANDARES[i].minX) return ANDARES[i]
  return ANDARES[0]
}

const getPercentil = (p: number, r: number) => {
  const m = r > 0 ? p / r : 0
  const map: [number, number][] = [[0, 8],[0.5,14],[1,20],[3,28],[6,36],[12,44],[24,54],[36,62],[60,70],[84,76],[120,82],[180,88],[300,93],[480,96],[960,98]]
  for (let i = map.length - 1; i >= 0; i--)
    if (m >= map[i][0]) return map[i][1]
  return 4
}

const getDistProx = (p: number, r: number, a: Andar): number | null => {
  if (a.n === 7) return null
  return ANDARES[a.n].minX * r - p
}

const getProgressoNoAndar = (p: number, r: number, a: Andar): number => {
  if (a.n === 7) return 100
  const lo = a.minX * r, hi = a.maxX * r
  return Math.min(100, Math.max(0, ((p - lo) / (hi - lo)) * 100))
}

const getContextoIdade = (p: number, r: number, age: number): { msg: string; ok: boolean } => {
  const rA = r * 12
  const exp = Math.max(0, ((age - 20) / 10) * rA * 0.9)
  if (exp === 0) return { msg: 'Você está no início da jornada financeira', ok: true }
  const ratio = p / exp
  if (ratio >= 3) {
    const y = Math.round((ratio - 1) * 9)
    return { msg: `${y} anos à frente da média para ${age} anos`, ok: true }
  }
  if (ratio >= 1.6) return { msg: `Bem acima da média para ${age} anos`, ok: true }
  if (ratio >= 0.75) return { msg: `Alinhado com a média para ${age} anos`, ok: true }
  const y = Math.round((1 - ratio) * 9)
  return { msg: `~${y} anos abaixo da média para ${age} anos`, ok: false }
}

const fmtBRL = (n: number) => {
  if (n >= 1e6) return `R$ ${(n/1e6).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}M`
  if (n >= 1e3) return `R$ ${(n/1e3).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}k`
  return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0})
}

// ── SVG pyramid geometry ──────────────────────────────────────────────────────
const SVG_W = 360, SVG_H = 308
const CX = SVG_W / 2
const FH = 44
const BASE_HW = 168, TOP_HW = 22

function pts(n: number) {
  const row = 7 - n
  const hwT = TOP_HW + row * (BASE_HW - TOP_HW) / 6
  const hwB = n === 1 ? hwT : TOP_HW + (row + 1) * (BASE_HW - TOP_HW) / 6
  const yT = row * FH, yB = (row + 1) * FH
  return `${CX-hwT},${yT} ${CX+hwT},${yT} ${CX+hwB},${yB} ${CX-hwB},${yB}`
}
function midY(n: number) { return (7 - n) * FH + FH / 2 }
function midHW(n: number) {
  const row = 7 - n
  return (TOP_HW + row * (BASE_HW - TOP_HW) / 6 + (n === 1 ? TOP_HW + row * (BASE_HW - TOP_HW) / 6 : TOP_HW + (row+1) * (BASE_HW - TOP_HW) / 6)) / 2
}

// ── Animated counter ──────────────────────────────────────────────────────────
function useCounter(target: number, active: boolean, duration = 900) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!active) { setVal(0); return }
    const start = Date.now()
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / duration)
      const ease = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(target * ease))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target, active, duration])
  return val
}

// ─────────────────────────────────────────────────────────────────────────────
interface Resultado {
  andar: Andar; percentil: number; distProx: number | null
  progresso: number; contexto: { msg: string; ok: boolean }
  patrimonio: number; renda: number; idade: number
}

export default function Calculadora() {
  const navigate = useNavigate()

  // Form
  const [idade,  setIdade]  = useState('')
  const [patrim, setPatrim] = useState('')
  const [renda,  setRenda]  = useState('')
  const [err,    setErr]    = useState('')
  const [calc,   setCalc]   = useState(false) // calculating animation

  // Result
  const [res, setRes] = useState<Resultado | null>(null)
  const [pyramidReady, setPyramidReady] = useState(false)

  // Email gate
  const [showGate, setShowGate] = useState(false)
  const [nome,     setNome]     = useState('')
  const [email,    setEmail]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)

  const resultRef = useRef<HTMLDivElement>(null)
  const gateRef   = useRef<HTMLDivElement>(null)

  const percentilCount = useCounter(res?.percentil ?? 0, pyramidReady)

  // Inject fonts
  useEffect(() => {
    if (document.getElementById('calc-fonts')) return
    const link = document.createElement('link')
    link.id = 'calc-fonts'; link.rel = 'stylesheet'; link.href = FONT_LINK
    document.head.appendChild(link)
  }, [])

  // Page-level SEO: own title, description, OG tags, canonical, FAQ schema.
  // We mutate the document head so search engines that render JS (and our future
  // prerender step) capture page-specific metadata instead of inheriting the
  // landing's defaults.
  useEffect(() => {
    const PAGE_TITLE = 'Calculadora da Pirâmide Financeira — Em qual andar você está? · Luxor Pro'
    const PAGE_DESC  = 'Descubra seu andar na Pirâmide Financeira Brasileira e seu percentil de riqueza. Calculadora gratuita de liberdade financeira: 7 níveis, da fragilidade ao legado geracional.'
    const PAGE_URL   = 'https://www.luxorpro.com.br/calculadora'

    const prevTitle = document.title
    document.title = PAGE_TITLE

    const setMeta = (selector: string, attr: 'name' | 'property', key: string, value: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(selector)
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, key)
        document.head.appendChild(el)
      }
      const prev = el.getAttribute('content')
      el.setAttribute('content', value)
      return () => { if (prev !== null) el!.setAttribute('content', prev) }
    }

    const setCanonical = (href: string) => {
      let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
      const prev = el?.getAttribute('href') ?? null
      if (!el) { el = document.createElement('link'); el.setAttribute('rel', 'canonical'); document.head.appendChild(el) }
      el.setAttribute('href', href)
      return () => { if (prev !== null) el!.setAttribute('href', prev) }
    }

    const restoreFns = [
      setMeta('meta[name="description"]',          'name',     'description',     PAGE_DESC),
      setMeta('meta[property="og:title"]',         'property', 'og:title',        PAGE_TITLE),
      setMeta('meta[property="og:description"]',   'property', 'og:description',  PAGE_DESC),
      setMeta('meta[property="og:url"]',           'property', 'og:url',          PAGE_URL),
      setMeta('meta[name="twitter:title"]',        'name',     'twitter:title',   PAGE_TITLE),
      setMeta('meta[name="twitter:description"]',  'name',     'twitter:description', PAGE_DESC),
      setMeta('meta[name="twitter:url"]',          'name',     'twitter:url',     PAGE_URL),
      setCanonical(PAGE_URL),
    ]

    // FAQPage JSON-LD — content mirrors the visible FAQ section below.
    const faqSchema = document.createElement('script')
    faqSchema.type = 'application/ld+json'
    faqSchema.id   = 'calc-faq-schema'
    faqSchema.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'O que é a Pirâmide Financeira Brasileira?',
          acceptedAnswer: { '@type': 'Answer', text: 'É um modelo de 7 andares que descreve a jornada do investidor brasileiro — da Fragilidade (sem reserva de emergência) até o Legado (riqueza geracional). Cada andar representa um múltiplo da sua renda mensal acumulado em patrimônio líquido.' } },
        { '@type': 'Question', name: 'Como a calculadora calcula meu andar?',
          acceptedAnswer: { '@type': 'Answer', text: 'A calculadora divide seu patrimônio total pela sua renda mensal e mapeia o resultado em um dos 7 andares. É uma estimativa educacional baseada em padrões observados no Brasil; não substitui assessoria financeira profissional.' } },
        { '@type': 'Question', name: 'Como sair do 1º andar (Fragilidade)?',
          acceptedAnswer: { '@type': 'Answer', text: 'Foque em construir uma reserva de emergência de pelo menos 3 meses da sua renda em um investimento de liquidez diária, como Tesouro Selic ou CDB com liquidez imediata. Antes disso, qualquer alocação em renda variável é prematura.' } },
        { '@type': 'Question', name: 'Quantos anos demora para chegar à Liberdade Financeira (6º andar)?',
          acceptedAnswer: { '@type': 'Answer', text: 'Depende da sua taxa de poupança e do retorno real dos seus investimentos. Com taxa de poupança de 25% da renda e retorno real de 5% ao ano, o caminho típico é 18 a 22 anos. Use o Luxor Pro para projetar seu cenário específico.' } },
        { '@type': 'Question', name: 'Meus dados ficam salvos?',
          acceptedAnswer: { '@type': 'Answer', text: 'Não. Os cálculos são feitos 100% no seu navegador. Se você optar por receber o resultado por e-mail, registramos apenas seu nome e endereço de e-mail — nunca os valores de patrimônio ou renda.' } },
      ],
    })
    document.head.appendChild(faqSchema)

    return () => {
      document.title = prevTitle
      restoreFns.forEach(fn => fn())
      faqSchema.remove()
    }
  }, [])

  const handleCalc = useCallback(() => {
    const age = parseInt(idade)
    const p   = parseFloat(patrim.replace(/\./g, '').replace(',', '.'))
    const r   = parseFloat(renda.replace(/\./g, '').replace(',', '.'))
    if (!idade || isNaN(age) || age < 18 || age > 90) { setErr('Informe uma idade válida (18–90).'); return }
    if (!patrim || isNaN(p) || p < 0) { setErr('Informe seu patrimônio (pode ser 0).'); return }
    if (!renda  || isNaN(r) || r <= 0) { setErr('Informe sua renda mensal.'); return }
    setErr(''); setCalc(true)

    setTimeout(() => {
      const andar = getAndar(p, r)
      setRes({
        andar,
        percentil:  getPercentil(p, r),
        distProx:   getDistProx(p, r, andar),
        progresso:  getProgressoNoAndar(p, r, andar),
        contexto:   getContextoIdade(p, r, age),
        patrimonio: p, renda: r, idade: age,
      })
      setCalc(false)
      setTimeout(() => {
        setPyramidReady(true)
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 60)
      setTimeout(() => setShowGate(true), 2800)
    }, 800)
  }, [idade, patrim, renda])

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    if (SUPABASE_CONFIGURED) {
      try {
        await supabase.from('calc_leads').insert({
          nome: nome.trim(), email: email.trim(),
          andar: res?.andar.n, percentil: res?.percentil,
          patrimonio: res?.patrimonio, renda: res?.renda, idade: res?.idade,
        })
      } catch { /* graceful */ }
    }
    setSending(false); setSent(true)
    setTimeout(() => navigate(`/app?source=calculadora&email=${encodeURIComponent(email)}`), 1400)
  }

  // ── Styles (inline for portability) ────────────────────────────────────────
  const font = {
    display: "'Cormorant Garamond', Georgia, serif",
    mono:    "'IBM Plex Mono', 'Courier New', monospace",
    body:    "'DM Sans', system-ui, sans-serif",
  }

  const numFmt = (n: number) => n.toLocaleString('pt-BR')

  return (
    <>
      {/* Global page styles */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: #07080e; }
        .calc-root { min-height: 100vh; background: #07080e; color: #e8e8f0;
          font-family: 'DM Sans', system-ui, sans-serif; overflow-x: hidden; }

        /* Grid texture */
        .calc-root::before {
          content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background-image:
            linear-gradient(rgba(0,212,255,.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,212,255,.025) 1px, transparent 1px);
          background-size: 40px 40px;
        }

        .calc-input {
          width: 100%; background: rgba(255,255,255,.04);
          border: 1px solid rgba(255,255,255,.1); border-radius: 10px;
          color: #e8e8f0; outline: none; transition: border-color .2s, box-shadow .2s;
          font-family: 'IBM Plex Mono', monospace; font-size: 15px;
          padding: 14px 16px;
        }
        .calc-input:focus {
          border-color: rgba(0,212,255,.5);
          box-shadow: 0 0 0 3px rgba(0,212,255,.08), inset 0 0 20px rgba(0,212,255,.03);
        }
        .calc-input::placeholder { color: rgba(255,255,255,.25); }

        .calc-btn {
          width: 100%; padding: 16px; border-radius: 12px; border: none;
          font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 600;
          letter-spacing: .04em; cursor: pointer; position: relative; overflow: hidden;
          background: linear-gradient(135deg, #ff7a00, #ff9c30);
          color: #07080e; transition: transform .15s, box-shadow .15s;
        }
        .calc-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 32px rgba(255,122,0,.4);
        }
        .calc-btn:active:not(:disabled) { transform: translateY(0); }
        .calc-btn:disabled { opacity: .6; cursor: not-allowed; }
        .calc-btn::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(135deg, transparent 40%, rgba(255,255,255,.15));
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes floorPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: .8; }
        }
        @keyframes glow-in {
          from { filter: brightness(0.3); }
          to   { filter: brightness(1); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .gate-card {
          animation: slideUp .5s cubic-bezier(.16,1,.3,1) both;
        }
      `}</style>

      <div className="calc-root" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Nav bar ─────────────────────────────────────────────────── */}
        <nav style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'rgba(7,8,14,.85)', backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,.06)',
          padding: '0 24px', height: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: font.display, fontSize: 20, fontWeight: 700, color: '#e8e8f0', letterSpacing: '-.01em' }}>
              Luxor<span style={{ color: '#ff7a00' }}>.Pro</span>
            </span>
          </a>
          <a href="/app" style={{
            fontFamily: font.body, fontSize: 13, fontWeight: 600, color: '#00d4ff',
            textDecoration: 'none', letterSpacing: '.04em',
            border: '1px solid rgba(0,212,255,.3)', borderRadius: 8, padding: '7px 16px',
            transition: 'background .2s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,212,255,.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            Entrar no App →
          </a>
        </nav>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <header style={{ textAlign: 'center', padding: '72px 24px 56px', animation: 'fadeUp .7s ease both' }}>
          <div style={{
            display: 'inline-block', fontFamily: font.mono, fontSize: 11, fontWeight: 500,
            color: '#00d4ff', letterSpacing: '.18em', textTransform: 'uppercase',
            background: 'rgba(0,212,255,.08)', border: '1px solid rgba(0,212,255,.2)',
            padding: '6px 16px', borderRadius: 100, marginBottom: 24,
          }}>
            Calculadora · Pirâmide Financeira
          </div>
          <h1 style={{
            fontFamily: font.display, fontSize: 'clamp(38px, 6vw, 68px)',
            fontWeight: 300, lineHeight: 1.1, letterSpacing: '-.02em',
            color: '#f0eee8', marginBottom: 16,
          }}>
            <span style={{
              position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
              overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
            }}>
              Calculadora da Pirâmide Financeira Brasileira —{' '}
            </span>
            Em qual andar você<br />
            <em style={{ fontStyle: 'italic', color: '#ff7a00', fontWeight: 400 }}>realmente está?</em>
          </h1>
          <p style={{
            fontFamily: font.body, fontSize: 17, color: 'rgba(232,232,240,.55)',
            maxWidth: 480, margin: '0 auto', lineHeight: 1.7, fontWeight: 300,
          }}>
            Descubra seu andar na Pirâmide Financeira Brasileira, seu percentil de riqueza e o que falta para subir ao próximo nível.
          </p>
        </header>

        {/* ── Main section: form + pyramid ──────────────────────────────── */}
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'clamp(320px,42%,480px) 1fr',
            gap: 48, alignItems: 'start',
          }}
            className="calc-main-grid"
          >
            {/* Left: Form */}
            <div style={{ animation: 'fadeUp .7s .1s ease both' }}>
              <div style={{
                background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 20, padding: 32, backdropFilter: 'blur(8px)',
              }}>
                <h2 style={{
                  fontFamily: font.display, fontSize: 22, fontWeight: 600,
                  color: '#e8e8f0', marginBottom: 6, letterSpacing: '-.01em',
                }}>Seus dados</h2>
                <p style={{ fontFamily: font.body, fontSize: 13, color: 'rgba(232,232,240,.4)', marginBottom: 28 }}>
                  Não armazenamos nada antes do seu OK.
                </p>

                {/* Inputs */}
                {[
                  { label: 'Sua Idade', id: 'idade', val: idade, set: setIdade,
                    placeholder: 'Ex: 32', hint: 'em anos' },
                  { label: 'Patrimônio Líquido', id: 'patrimonio', val: patrim, set: setPatrim,
                    placeholder: 'Ex: 150000', hint: 'R$ total em ativos' },
                  { label: 'Renda Mensal Bruta', id: 'renda', val: renda, set: setRenda,
                    placeholder: 'Ex: 8000', hint: 'R$ por mês' },
                ].map(({ label, id, val, set, placeholder, hint }) => (
                  <div key={id} style={{ marginBottom: 20 }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      marginBottom: 8,
                    }}>
                      <label htmlFor={id} style={{
                        fontFamily: font.body, fontSize: 12, fontWeight: 600,
                        color: 'rgba(232,232,240,.7)', textTransform: 'uppercase', letterSpacing: '.08em',
                      }}>{label}</label>
                      <span style={{ fontFamily: font.mono, fontSize: 10, color: 'rgba(0,212,255,.5)' }}>{hint}</span>
                    </div>
                    <input
                      id={id} type="text" inputMode="numeric"
                      className="calc-input"
                      value={val}
                      onChange={e => { set(e.target.value); setErr('') }}
                      placeholder={placeholder}
                      onKeyDown={e => e.key === 'Enter' && handleCalc()}
                    />
                  </div>
                ))}

                {err && (
                  <p style={{
                    fontFamily: font.body, fontSize: 12, color: '#ff4466',
                    marginBottom: 16, background: 'rgba(255,68,102,.08)',
                    border: '1px solid rgba(255,68,102,.2)', borderRadius: 8,
                    padding: '8px 12px',
                  }}>{err}</p>
                )}

                <button className="calc-btn" disabled={calc} onClick={handleCalc}>
                  {calc
                    ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                        Calculando...
                      </span>
                    : 'Calcular meu andar →'
                  }
                </button>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>

              {/* Age context callout if result available */}
              {res && pyramidReady && (
                <div style={{
                  marginTop: 20,
                  background: res.contexto.ok ? 'rgba(0,212,255,.07)' : 'rgba(255,122,0,.07)',
                  border: `1px solid ${res.contexto.ok ? 'rgba(0,212,255,.2)' : 'rgba(255,122,0,.2)'}`,
                  borderRadius: 12, padding: '14px 18px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  animation: 'fadeUp .5s .3s ease both',
                }}>
                  <span style={{ fontSize: 20 }}>{res.contexto.ok ? '📈' : '⏰'}</span>
                  <span style={{
                    fontFamily: font.body, fontSize: 13,
                    color: res.contexto.ok ? '#00d4ff' : '#ff7a00',
                    fontWeight: 500, lineHeight: 1.4,
                  }}>{res.contexto.msg}</span>
                </div>
              )}
            </div>

            {/* Right: Pyramid */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'fadeUp .7s .2s ease both' }}>
              <p style={{
                fontFamily: font.mono, fontSize: 10, letterSpacing: '.16em',
                color: 'rgba(232,232,240,.3)', textTransform: 'uppercase',
                marginBottom: 20, textAlign: 'center',
              }}>
                PIRÂMIDE FINANCEIRA BRASILEIRA
              </p>

              <svg viewBox={`0 0 ${SVG_W} ${SVG_H + 20}`} width="100%" style={{ maxWidth: 380 }}>
                <defs>
                  {ANDARES.map(a => (
                    <filter key={a.n} id={`glow-${a.n}`} x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                      <feColorMatrix in="blur" type="matrix"
                        values={`0 0 0 0 ${parseInt(a.color.slice(1,3),16)/255} 0 0 0 0 ${parseInt(a.color.slice(3,5),16)/255} 0 0 0 0 ${parseInt(a.color.slice(5,7),16)/255} 0 0 0 1.5 0`}
                        result="coloredBlur" />
                      <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  ))}
                </defs>

                {/* Thin dividers */}
                {ANDARES.map(a => {
                  const row = 7 - a.n
                  const yDiv = row * FH
                  const hwDiv = TOP_HW + row * (BASE_HW - TOP_HW) / 6
                  return a.n < 7 ? (
                    <line key={a.n} x1={CX - hwDiv} y1={yDiv} x2={CX + hwDiv} y2={yDiv}
                      stroke="rgba(255,255,255,.06)" strokeWidth="1" />
                  ) : null
                })}

                {/* Floor fills */}
                {ANDARES.map(a => {
                  const isActive = res?.andar.n === a.n && pyramidReady
                  const isBelowActive = res && pyramidReady && a.n < res.andar.n
                  const isAboveActive = res && pyramidReady && a.n > res.andar.n
                  const noResult = !res || !pyramidReady

                  const opacity = noResult ? 0.18
                    : isActive ? 1
                    : isBelowActive ? 0.32
                    : 0.08

                  return (
                    <polygon
                      key={a.n}
                      points={pts(a.n)}
                      fill={a.color}
                      fillOpacity={opacity}
                      filter={isActive ? `url(#glow-${a.n})` : undefined}
                      style={{
                        transition: 'fill-opacity .6s ease, filter .6s ease',
                        animation: isActive ? 'floorPulse 3s ease-in-out infinite' : undefined,
                      }}
                    />
                  )
                })}

                {/* Border strokes */}
                {ANDARES.map(a => (
                  <polygon key={a.n} points={pts(a.n)}
                    fill="none"
                    stroke={res?.andar.n === a.n && pyramidReady ? a.color : 'rgba(255,255,255,.1)'}
                    strokeWidth={res?.andar.n === a.n && pyramidReady ? 1.5 : 0.5}
                    style={{ transition: 'stroke .6s ease' }}
                  />
                ))}

                {/* Floor labels */}
                {ANDARES.map(a => {
                  const isActive = res?.andar.n === a.n && pyramidReady
                  const hw = midHW(a.n)
                  const maxChars = Math.floor(hw * 1.7 / 7)
                  const label = a.label.length > maxChars ? a.n.toString() : a.label
                  return (
                    <text
                      key={a.n}
                      x={CX} y={midY(a.n) + 1}
                      textAnchor="middle" dominantBaseline="middle"
                      fontFamily="'IBM Plex Mono', monospace"
                      fontSize={isActive ? 11 : 9.5}
                      fontWeight={isActive ? '600' : '400'}
                      fill={isActive ? a.color : 'rgba(232,232,240,.35)'}
                      style={{ transition: 'fill .6s, font-size .3s' }}
                    >
                      {a.n < 4 ? `${a.n} · ${label}` : label}
                    </text>
                  )
                })}

                {/* Population labels on the right */}
                {ANDARES.map(a => {
                  const row = 7 - a.n
                  const hwB = a.n === 1 ? BASE_HW : TOP_HW + (row + 1) * (BASE_HW - TOP_HW) / 6
                  const yM = midY(a.n)
                  return (
                    <text key={a.n}
                      x={CX + hwB + 8} y={yM + 1}
                      textAnchor="start" dominantBaseline="middle"
                      fontFamily="'IBM Plex Mono', monospace" fontSize="8"
                      fill={res?.andar.n === a.n && pyramidReady ? 'rgba(232,232,240,.5)' : 'rgba(232,232,240,.2)'}
                      style={{ transition: 'fill .6s' }}
                    >
                      {a.pop}
                    </text>
                  )
                })}
              </svg>

              {/* Legend note */}
              <p style={{
                fontFamily: font.mono, fontSize: 9.5, color: 'rgba(232,232,240,.25)',
                marginTop: 8, letterSpacing: '.06em', textAlign: 'center',
              }}>
                % da população brasileira adulta por andar
              </p>
            </div>
          </div>

          {/* ── Results section ─────────────────────────────────────────── */}
          {res && (
            <div ref={resultRef} style={{ marginTop: 64, animation: 'fadeUp .6s ease both' }}>

              {/* Section label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.07)' }}/>
                <span style={{
                  fontFamily: font.mono, fontSize: 10, letterSpacing: '.18em',
                  color: 'rgba(232,232,240,.35)', textTransform: 'uppercase',
                }}>SEU RESULTADO</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.07)' }}/>
              </div>

              {/* Main result card */}
              <div style={{
                background: `linear-gradient(135deg, rgba(${res.andar.color === '#ff4466' ? '255,68,102' : res.andar.color === '#ff7a00' ? '255,122,0' : res.andar.color === '#f59e0b' ? '245,158,11' : res.andar.color === '#84cc16' ? '132,204,22' : res.andar.color === '#00d4ff' ? '0,212,255' : res.andar.color === '#a78bfa' ? '167,139,250' : '255,215,0'},.10) 0%, rgba(7,8,14,0) 60%)`,
                border: `1px solid ${res.andar.color}30`,
                borderRadius: 24, padding: 40,
                position: 'relative', overflow: 'hidden',
              }}>
                {/* Accent bar */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, width: 4, height: '100%',
                  background: res.andar.color, borderRadius: '24px 0 0 24px',
                }}/>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32 }}>

                  {/* Andar */}
                  <div>
                    <p style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: '.14em', color: 'rgba(232,232,240,.4)', textTransform: 'uppercase', marginBottom: 12 }}>Seu Andar</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                      <span style={{
                        fontFamily: font.display, fontSize: 72, fontWeight: 300,
                        lineHeight: 1, color: res.andar.color,
                        textShadow: `0 0 40px ${res.andar.shadow}`,
                      }}>{res.andar.n}</span>
                      <span style={{ fontFamily: font.body, fontSize: 13, color: 'rgba(232,232,240,.5)' }}>/ 7</span>
                    </div>
                    <p style={{
                      fontFamily: font.display, fontSize: 22, fontWeight: 600,
                      color: res.andar.color, marginBottom: 4, letterSpacing: '-.01em',
                    }}>{res.andar.label}</p>
                    <p style={{ fontFamily: font.body, fontSize: 13, color: 'rgba(232,232,240,.5)', lineHeight: 1.4 }}>
                      {res.andar.sub}
                    </p>
                  </div>

                  {/* Percentil */}
                  <div>
                    <p style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: '.14em', color: 'rgba(232,232,240,.4)', textTransform: 'uppercase', marginBottom: 12 }}>Percentil Brasil</p>
                    <div style={{ marginBottom: 16 }}>
                      <span style={{
                        fontFamily: font.display, fontSize: 72, fontWeight: 300,
                        lineHeight: 1, color: '#e8e8f0',
                      }}>{pyramidReady ? percentilCount : 0}</span>
                      <span style={{ fontFamily: font.display, fontSize: 32, color: 'rgba(232,232,240,.5)' }}>º</span>
                    </div>
                    <p style={{ fontFamily: font.body, fontSize: 13, color: 'rgba(232,232,240,.45)', lineHeight: 1.5 }}>
                      Você tem mais patrimônio que <strong style={{ color: '#e8e8f0' }}>{percentilCount}%</strong> dos brasileiros adultos.
                    </p>
                  </div>

                  {/* Próximo andar */}
                  <div>
                    <p style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: '.14em', color: 'rgba(232,232,240,.4)', textTransform: 'uppercase', marginBottom: 12 }}>
                      {res.distProx !== null ? 'Para o próximo andar' : 'Conquista Máxima'}
                    </p>
                    {res.distProx !== null ? (
                      <>
                        <p style={{
                          fontFamily: font.display, fontSize: 38, fontWeight: 300,
                          color: '#00d4ff', lineHeight: 1.1, marginBottom: 8,
                          letterSpacing: '-.02em',
                        }}>{fmtBRL(res.distProx)}</p>
                        <p style={{ fontFamily: font.body, fontSize: 13, color: 'rgba(232,232,240,.45)', lineHeight: 1.5, marginBottom: 16 }}>
                          faltam para atingir o Andar {res.andar.n + 1} · <span style={{ color: ANDARES[res.andar.n].color }}>{ANDARES[res.andar.n].label}</span>
                        </p>
                        {/* Progress within current floor */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontFamily: font.mono, fontSize: 9, color: 'rgba(232,232,240,.3)', letterSpacing: '.1em' }}>PROGRESSO NO ANDAR {res.andar.n}</span>
                            <span style={{ fontFamily: font.mono, fontSize: 9, color: res.andar.color }}>{Math.round(res.progresso)}%</span>
                          </div>
                          <div style={{ height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 4,
                              background: `linear-gradient(90deg, ${res.andar.color}, ${ANDARES[res.andar.n]?.color ?? res.andar.color})`,
                              width: pyramidReady ? `${res.progresso}%` : '0%',
                              transition: 'width 1.2s cubic-bezier(.16,1,.3,1)',
                            }}/>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div>
                        <p style={{ fontFamily: font.display, fontSize: 38, fontWeight: 300, color: '#ffd700', lineHeight: 1.1, marginBottom: 8 }}>
                          Legado
                        </p>
                        <p style={{ fontFamily: font.body, fontSize: 13, color: 'rgba(232,232,240,.45)', lineHeight: 1.5 }}>
                          Você está no topo da pirâmide. Parte dos 0,3% mais ricos do Brasil.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div style={{
                  marginTop: 32, paddingTop: 28,
                  borderTop: '1px solid rgba(255,255,255,.07)',
                }}>
                  <p style={{
                    fontFamily: font.body, fontSize: 15, color: 'rgba(232,232,240,.6)',
                    lineHeight: 1.75, maxWidth: 680, fontWeight: 300,
                  }}>
                    {res.andar.desc}
                  </p>
                </div>
              </div>

              {/* Stats row */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12, marginTop: 16,
              }}>
                {[
                  { label: 'Seu patrimônio', value: fmtBRL(res.patrimonio), mono: true },
                  { label: 'Múltiplo de renda', value: `${(res.patrimonio / res.renda).toFixed(1)}×`, mono: true },
                  { label: 'Neste andar', value: `${res.andar.pop} da população`, mono: false },
                ].map(({ label, value, mono }) => (
                  <div key={label} style={{
                    background: 'rgba(255,255,255,.025)',
                    border: '1px solid rgba(255,255,255,.07)',
                    borderRadius: 14, padding: '18px 20px',
                    textAlign: 'center',
                  }}>
                    <p style={{ fontFamily: font.mono, fontSize: 9.5, color: 'rgba(232,232,240,.35)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</p>
                    <p style={{ fontFamily: mono ? font.mono : font.display, fontSize: mono ? 18 : 18, fontWeight: 500, color: '#e8e8f0' }}>{value}</p>
                  </div>
                ))}
              </div>

            </div>
          )}
        </main>

        {/* ── Email gate (slides up after result) ───────────────────────── */}
        {showGate && !sent && (
          <div ref={gateRef} style={{
            position: 'relative', zIndex: 40,
            background: 'linear-gradient(180deg, rgba(7,8,14,0) 0%, #07080e 8%)',
            padding: '0 24px 80px',
          }}>
            <div className="gate-card" style={{
              maxWidth: 680, margin: '0 auto',
              background: 'linear-gradient(135deg, rgba(255,122,0,.08) 0%, rgba(0,212,255,.05) 100%)',
              border: '1px solid rgba(255,122,0,.25)',
              borderRadius: 24, padding: '40px 40px 40px',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Decorative blur */}
              <div style={{
                position: 'absolute', top: -60, right: -60, width: 200, height: 200,
                background: 'radial-gradient(circle, rgba(255,122,0,.15) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}/>
              <div style={{
                position: 'absolute', bottom: -40, left: -40, width: 160, height: 160,
                background: 'radial-gradient(circle, rgba(0,212,255,.1) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}/>

              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
                  <div>
                    <p style={{
                      fontFamily: font.mono, fontSize: 10, letterSpacing: '.16em',
                      color: '#ff7a00', textTransform: 'uppercase', marginBottom: 10,
                    }}>Próximo passo</p>
                    <h3 style={{
                      fontFamily: font.display, fontSize: 28, fontWeight: 600,
                      color: '#f0eee8', lineHeight: 1.15, letterSpacing: '-.01em',
                    }}>
                      Receba seu plano de<br/>
                      <em style={{ color: '#ff7a00', fontStyle: 'italic' }}>aceleração personalizado</em>
                    </h3>
                    {res && (
                      <p style={{ fontFamily: font.body, fontSize: 14, color: 'rgba(232,232,240,.5)', marginTop: 10, lineHeight: 1.6 }}>
                        Com base no seu Andar {res.andar.n} · {res.andar.label}, montamos uma estratégia concreta para você chegar ao Andar {Math.min(res.andar.n + 1, 7)}.
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setShowGate(false)}
                    style={{ color: 'rgba(232,232,240,.3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4, lineHeight: 1, flexShrink: 0, marginLeft: 16 }}
                  >×</button>
                </div>

                <form onSubmit={handleEmailSubmit}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontFamily: font.body, fontSize: 11, fontWeight: 600, color: 'rgba(232,232,240,.5)', letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Seu nome</label>
                      <input
                        type="text"
                        className="calc-input"
                        value={nome}
                        onChange={e => setNome(e.target.value)}
                        placeholder="Como prefere ser chamado?"
                        style={{ fontFamily: font.body }}
                      />
                    </div>
                    <div>
                      <label style={{ fontFamily: font.body, fontSize: 11, fontWeight: 600, color: 'rgba(232,232,240,.5)', letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Seu melhor e-mail</label>
                      <input
                        type="email"
                        className="calc-input"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="email@exemplo.com"
                        required
                        style={{ fontFamily: font.body }}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="calc-btn"
                    disabled={sending || !email.trim()}
                    style={{ marginTop: 4 }}
                  >
                    {sending
                      ? 'Processando...'
                      : `Acelerar com Luxor Pro →`}
                  </button>
                  <p style={{ fontFamily: font.body, fontSize: 11, color: 'rgba(232,232,240,.25)', marginTop: 12, textAlign: 'center' }}>
                    Sem spam. Cancele quando quiser. Seus dados ficam só com você.
                  </p>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Sent confirmation */}
        {sent && (
          <div style={{
            textAlign: 'center', padding: '0 24px 80px',
            animation: 'fadeUp .5s ease both',
          }}>
            <div style={{
              maxWidth: 480, margin: '0 auto',
              background: 'rgba(0,255,136,.06)', border: '1px solid rgba(0,255,136,.2)',
              borderRadius: 20, padding: '32px 36px',
            }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
              <p style={{ fontFamily: font.display, fontSize: 22, fontWeight: 600, color: '#00ff88', marginBottom: 8 }}>
                Tudo pronto!
              </p>
              <p style={{ fontFamily: font.body, fontSize: 14, color: 'rgba(232,232,240,.5)' }}>
                Redirecionando para o Luxor Pro...
              </p>
            </div>
          </div>
        )}

        {/* ── FAQ section (mirrors FAQPage JSON-LD in <head>) ───────────── */}
        <section style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 60px' }}>
          <h2 style={{
            fontFamily: font.display, fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 400, color: '#f0eee8', textAlign: 'center', marginBottom: 32,
            letterSpacing: '-.01em',
          }}>
            Perguntas <em style={{ fontStyle: 'italic', color: '#ff7a00' }}>frequentes</em>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { q: 'O que é a Pirâmide Financeira Brasileira?',
                a: 'É um modelo de 7 andares que descreve a jornada do investidor brasileiro — da Fragilidade (sem reserva de emergência) até o Legado (riqueza geracional). Cada andar representa um múltiplo da sua renda mensal acumulado em patrimônio líquido.' },
              { q: 'Como a calculadora calcula meu andar?',
                a: 'A calculadora divide seu patrimônio total pela sua renda mensal e mapeia o resultado em um dos 7 andares. É uma estimativa educacional baseada em padrões observados no Brasil; não substitui assessoria financeira profissional.' },
              { q: 'Como sair do 1º andar (Fragilidade)?',
                a: 'Foque em construir uma reserva de emergência de pelo menos 3 meses da sua renda em um investimento de liquidez diária, como Tesouro Selic ou CDB com liquidez imediata. Antes disso, qualquer alocação em renda variável é prematura.' },
              { q: 'Quantos anos demora para chegar à Liberdade Financeira (6º andar)?',
                a: 'Depende da sua taxa de poupança e do retorno real dos seus investimentos. Com taxa de poupança de 25% da renda e retorno real de 5% ao ano, o caminho típico é 18 a 22 anos. Use o Luxor Pro para projetar seu cenário específico.' },
              { q: 'Meus dados ficam salvos?',
                a: 'Não. Os cálculos são feitos 100% no seu navegador. Se você optar por receber o resultado por e-mail, registramos apenas seu nome e endereço de e-mail — nunca os valores de patrimônio ou renda.' },
            ].map(({ q, a }) => (
              <details key={q} style={{
                background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 12, padding: '16px 20px',
              }}>
                <summary style={{
                  cursor: 'pointer', fontFamily: font.body, fontSize: 15, fontWeight: 600,
                  color: '#e8e8f0', listStyle: 'none', outline: 'none',
                }}>
                  {q}
                </summary>
                <p style={{
                  fontFamily: font.body, fontSize: 14, color: 'rgba(232,232,240,.7)',
                  lineHeight: 1.7, marginTop: 12,
                }}>
                  {a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <footer style={{
          borderTop: '1px solid rgba(255,255,255,.06)',
          padding: '28px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 24,
          flexWrap: 'wrap',
        }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: font.display, fontSize: 16, fontWeight: 700, color: '#e8e8f0' }}>
              Luxor<span style={{ color: '#ff7a00' }}>.Pro</span>
            </span>
          </a>
          <a href="/" style={{ fontFamily: font.body, fontSize: 12, color: 'rgba(232,232,240,.5)', textDecoration: 'none' }}>
            Página inicial
          </a>
          <a href="/#planos" style={{ fontFamily: font.body, fontSize: 12, color: 'rgba(232,232,240,.5)', textDecoration: 'none' }}>
            Planos
          </a>
          <a href="/signup" style={{ fontFamily: font.body, fontSize: 12, color: 'rgba(232,232,240,.5)', textDecoration: 'none' }}>
            Começar grátis
          </a>
          <span style={{ fontFamily: font.body, fontSize: 12, color: 'rgba(232,232,240,.25)' }}>
            Calculadora educacional · Não constitui assessoria financeira.
          </span>
        </footer>

      </div>

      {/* Responsive overrides */}
      <style>{`
        @media (max-width: 768px) {
          .calc-main-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  )
}
