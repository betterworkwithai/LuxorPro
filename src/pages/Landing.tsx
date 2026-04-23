import React, { useState, useEffect, useRef } from 'react'
import {
  Check, ChevronDown, TrendingUp, Target, FileSearch,
  Calculator, Zap, Shield, ArrowRight, Lock,
  BarChart3, Wallet, Globe, Users,
} from 'lucide-react'

const STRIPE_MONTHLY  = 'https://buy.stripe.com/eVqbIV9EAa91c4navC3wQ03'
const STRIPE_ANNUAL   = 'https://buy.stripe.com/fZu3cp3gc0yrb0j47e3wQ02'
const STRIPE_LIFETIME = 'https://buy.stripe.com/8x23cp6sodld3xR5bi3wQ01'

// ── Scroll-triggered fade-in ──────────────────────────────────────────────────
function useFadeIn(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true) },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

// ── Dashboard Mockup (hero visual) ────────────────────────────────────────────
function DashboardMockup() {
  const bars = [30, 48, 38, 62, 55, 75, 65, 82, 72, 90, 85, 100]
  return (
    <div className="relative w-full max-w-md mx-auto select-none pointer-events-none">
      <div className="absolute -inset-8 rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(255,122,0,0.18) 0%, transparent 70%)' }} />
      <div className="relative bg-[#0d0d14] border border-[#2a2a3e] rounded-2xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
        {/* Browser chrome */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[#1e1e2e] bg-[#080810]">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff4466]/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#00ff88]/50" />
          <div className="flex-1 mx-3 h-4 bg-[#1a1a2e] rounded-md flex items-center px-2">
            <span className="text-[9px] text-[#55556a]">luxorpro.com.br/app</span>
          </div>
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[9px] text-[#55556a] uppercase tracking-widest mb-0.5">Patrimônio Total</p>
              <p className="text-[22px] font-bold text-[#e8e8f0] leading-none">R$ 1.247.830</p>
              <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-[#00ff88]">
                ↑ +12,4% <span className="text-[#55556a] font-normal">este ano</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[['Mês', '+2,1%', '#00ff88'], ['Ativos', '23', '#ff7a00'], ['TIR', '14,3%', '#00d4ff'], ['Meta', '87%', '#8b5cf6']].map(([l, v, c]) => (
                <div key={l} className="bg-[#111118] rounded-lg p-1.5 text-center min-w-[42px]">
                  <p className="text-[9px] text-[#55556a]">{l}</p>
                  <p className="text-[11px] font-bold" style={{ color: c as string }}>{v}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-[3px] h-10 mb-4">
            {bars.map((h, i) => (
              <div key={i} className="flex-1 rounded-t-[2px]" style={{
                height: `${h}%`,
                background: i === bars.length - 1 ? '#ff7a00' : `rgba(255,122,0,${0.08 + (i / bars.length) * 0.42})`
              }} />
            ))}
          </div>
          <div className="space-y-2">
            {[
              { label: 'Renda Variável', pct: '45%', val: 'R$ 561k', color: '#3b82f6', w: '45%' },
              { label: 'Renda Fixa',     pct: '32%', val: 'R$ 399k', color: '#00ff88', w: '32%' },
              { label: 'Internacional',  pct: '23%', val: 'R$ 287k', color: '#ff7a00', w: '23%' },
            ].map(({ label, pct, val, color, w }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    <span className="text-[10px] text-[#8888aa]">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#55556a]">{val}</span>
                    <span className="text-[10px] font-bold" style={{ color }}>{pct}</span>
                  </div>
                </div>
                <div className="h-[3px] bg-[#1e1e2e] rounded-full">
                  <div className="h-full rounded-full" style={{ width: w, background: color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating card: AI */}
      <div className="absolute -right-6 top-16 bg-[#0d0d14] border border-[#00d4ff]/40 rounded-xl p-3 shadow-2xl w-44"
        style={{ animation: 'lxFloat 3.2s ease-in-out infinite' }}>
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-4 h-4 rounded bg-[#00d4ff]/15 flex items-center justify-center">
            <Zap className="w-2.5 h-2.5 text-[#00d4ff]" />
          </div>
          <span className="text-[9px] font-bold text-[#00d4ff] uppercase tracking-wide">IA Detectou</span>
        </div>
        <p className="text-[10px] text-[#8888aa] leading-snug">23 transações do <span className="text-[#e8e8f0] font-medium">Nubank</span> importadas automaticamente</p>
      </div>

      {/* Floating card: goal */}
      <div className="absolute -left-6 bottom-12 bg-[#0d0d14] border border-[#00ff88]/40 rounded-xl p-3 shadow-2xl w-44"
        style={{ animation: 'lxFloat 4s ease-in-out infinite reverse' }}>
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-4 h-4 rounded bg-[#00ff88]/15 flex items-center justify-center">
            <Target className="w-2.5 h-2.5 text-[#00ff88]" />
          </div>
          <span className="text-[9px] font-bold text-[#00ff88] uppercase tracking-wide">Meta atingida</span>
        </div>
        <p className="text-[10px] text-[#8888aa] leading-snug">Reserva de emergência <span className="text-[#e8e8f0] font-medium">100%</span> concluída 🎉</p>
      </div>
    </div>
  )
}

// ── FAQ Accordion ─────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: 'O Luxor Pro é seguro para meus dados financeiros?',
    a: 'Sim. Utilizamos criptografia de ponta a ponta (TLS 1.3), infraestrutura Supabase com conformidade SOC 2, e processamento de pagamentos via Stripe — o mesmo usado por Amazon e Shopify. Seus dados nunca são vendidos ou compartilhados.',
  },
  {
    q: 'Posso cancelar a qualquer momento?',
    a: 'Absolutamente. Nos planos mensais e anuais, você pode cancelar com um clique direto pelo portal do cliente — sem burocracia, sem ligações. Você mantém acesso até o fim do período pago.',
  },
  {
    q: 'O que está incluído nos 7 dias grátis?',
    a: 'Acesso completo a todas as funcionalidades: dashboard, investimentos, fluxo de caixa, metas, IA de documentos e ferramentas financeiras. Nenhum cartão é cobrado durante o período de teste.',
  },
  {
    q: 'Funciona com todos os bancos brasileiros?',
    a: 'A IA de documentos processa PDFs e extratos do Nubank, Itaú, Bradesco, Santander, XP Investimentos e outros. Você também pode cadastrar ativos manualmente em qualquer instituição.',
  },
  {
    q: 'Como funciona o acesso vitalício?',
    a: 'É um pagamento único de R$ 350 que garante acesso ao Luxor Pro para sempre — incluindo todas as atualizações futuras. Sem mensalidades, sem surpresas. Pague uma vez, use para sempre.',
  },
  {
    q: 'E se eu não ficar satisfeito?',
    a: 'Nos planos anuais e vitalício, oferecemos 30 dias de garantia de reembolso total. Se por qualquer motivo não ficar satisfeito, basta enviar um e-mail para suporte@luxorpro.com.br e devolvemos 100% do valor pago.',
  },
  {
    q: 'Posso usar em vários dispositivos?',
    a: 'Sim. O Luxor Pro é 100% web — acesse de qualquer computador, tablet ou celular. Seus dados sincronizam em tempo real em todos os dispositivos.',
  },
  {
    q: 'Preciso instalar algum aplicativo?',
    a: 'Não. O Luxor Pro roda diretamente no navegador, sem instalação. Funciona perfeitamente no Chrome, Safari, Firefox e Edge — em qualquer sistema operacional.',
  },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[#1e1e2e] rounded-2xl overflow-hidden hover:border-[#ff7a00]/30 transition-colors">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-5 text-left gap-4"
      >
        <span className="text-sm font-semibold text-[#e8e8f0]">{q}</span>
        <ChevronDown className={`w-4 h-4 text-[#ff7a00] flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-48' : 'max-h-0'}`}>
        <p className="px-6 pb-5 text-sm text-[#8888aa] leading-relaxed">{a}</p>
      </div>
    </div>
  )
}

// ── Main Landing Page ─────────────────────────────────────────────────────────
export default function Landing() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const hero    = useFadeIn(0)
  const problem = useFadeIn(0.1)
  const benefits= useFadeIn(0.1)
  const howto   = useFadeIn(0.1)
  const pricing = useFadeIn(0.1)
  const faq     = useFadeIn(0.1)
  const finalCta= useFadeIn(0.1)

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0] overflow-x-hidden">

      {/* ── Global CSS ── */}
      <style>{`
        @keyframes lxFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
        @keyframes lxPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.7; transform: scale(0.97); }
        }
        @keyframes lxSlideUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes lxGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(255,122,0,0.3); }
          50%       { box-shadow: 0 0 40px rgba(255,122,0,0.6); }
        }
        .lx-fade { opacity: 0; transform: translateY(24px); transition: opacity 0.7s ease, transform 0.7s ease; }
        .lx-fade.visible { opacity: 1; transform: translateY(0); }
        .lx-fade-delay-1 { transition-delay: 0.1s; }
        .lx-fade-delay-2 { transition-delay: 0.2s; }
        .lx-fade-delay-3 { transition-delay: 0.3s; }
        .lx-fade-delay-4 { transition-delay: 0.4s; }
        .lx-fade-delay-5 { transition-delay: 0.5s; }
        .lx-fade-delay-6 { transition-delay: 0.6s; }
        .dot-grid {
          background-image: radial-gradient(circle, rgba(255,122,0,0.07) 1px, transparent 1px);
          background-size: 28px 28px;
        }
        .gradient-text {
          background: linear-gradient(135deg, #ff7a00 0%, #ffb347 50%, #ff7a00 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .gradient-text-white {
          background: linear-gradient(135deg, #ffffff 0%, #e8e8f0 60%, #8888aa 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .card-glow:hover {
          border-color: rgba(255,122,0,0.3) !important;
          box-shadow: 0 0 30px rgba(255,122,0,0.07);
        }
        .btn-glow { animation: lxGlow 2.5s ease-in-out infinite; }
      `}</style>

      {/* ════════════════════════════════════════════════════════════
          STICKY NAV
      ════════════════════════════════════════════════════════════ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#0a0a0f]/95 backdrop-blur border-b border-[#1e1e2e] py-3' : 'py-5'}`}>
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#ff7a00] flex items-center justify-center shadow-[0_0_16px_rgba(255,122,0,0.4)]">
              <svg viewBox="0 0 16 16" fill="none" className="w-5 h-5">
                <polygon points="8,1.5 14.5,14 1.5,14" fill="white" opacity="0.95" />
                <polygon points="8,1.5 10,6 6,6" fill="#ff7a00" opacity="0.9" />
              </svg>
            </div>
            <span className="text-[15px] font-bold tracking-tight">Luxor <span className="text-[#ff7a00]">Pro</span></span>
          </div>
          <div className="flex items-center gap-3">
            <a href="/app" className="hidden sm:block text-sm text-[#8888aa] hover:text-[#e8e8f0] transition-colors">
              Entrar
            </a>
            <a
              href={STRIPE_ANNUAL}
              className="px-4 py-2 rounded-xl bg-[#ff7a00] text-[#0a0a0f] text-sm font-bold hover:bg-[#e06500] transition-colors shadow-[0_0_16px_rgba(255,122,0,0.35)]"
            >
              Começar Grátis
            </a>
          </div>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════════════════════ */}
      <section className="relative pt-32 pb-24 px-6 dot-grid">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,122,0,0.08) 0%, transparent 70%)' }} />
        <div ref={hero.ref} className="relative max-w-6xl mx-auto">
          <div className={`grid lg:grid-cols-2 gap-16 items-center lx-fade ${hero.visible ? 'visible' : ''}`}>

            {/* Left: Copy */}
            <div>
              <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-bold leading-[1.08] tracking-tight mb-6">
                <span className="gradient-text-white">Pare de perder dinheiro</span><br />
                <span className="gradient-text">por falta de controle.</span>
              </h1>

              <p className="text-lg text-[#8888aa] leading-relaxed mb-8 max-w-lg">
                Luxor Pro centraliza <strong className="text-[#e8e8f0]">todos os seus investimentos, despesas e patrimônio</strong> em um painel inteligente.
                Tome decisões financeiras precisas — com dados reais, em tempo real.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <a
                  href={STRIPE_ANNUAL}
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-[#ff7a00] text-[#0a0a0f] text-base font-bold hover:bg-[#e06500] transition-all btn-glow"
                >
                  Começar 7 Dias Grátis
                  <ArrowRight className="w-4 h-4" />
                </a>
                <a
                  href="#planos"
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl border border-[#2a2a3e] text-[#8888aa] text-base font-medium hover:border-[#ff7a00]/40 hover:text-[#e8e8f0] transition-all"
                >
                  Ver planos e preços
                </a>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-[#55556a]">
                {['7 dias grátis', '30 dias de garantia'].map(t => (
                  <span key={t} className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-[#00ff88]" />{t}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: Mockup */}
            <div className="hidden lg:block">
              <DashboardMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          PROBLEM / BRIDGE
      ════════════════════════════════════════════════════════════ */}
      <section className="py-24 px-6">
        <div ref={problem.ref} className={`max-w-5xl mx-auto lx-fade ${problem.visible ? 'visible' : ''}`}>
          <div className="text-center mb-14">
            <p className="text-xs text-[#ff7a00] uppercase tracking-widest font-bold mb-3">O problema que você conhece bem</p>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
              Você construiu um patrimônio sólido.<br />
              <span className="text-[#8888aa]">Ainda está gerenciando com planilhas?</span>
            </h2>
            <p className="text-[#55556a] max-w-xl mx-auto">Cada dia sem visibilidade clara é dinheiro deixado na mesa.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-14">
            {[
              {
                emoji: '😰',
                title: 'Patrimônio invisível',
                desc: 'Seu dinheiro está espalhado em 4 corretoras, 3 bancos e 2 contas no exterior. Você não sabe ao certo quanto tem — nem quanto está rendendo.',
              },
              {
                emoji: '⏳',
                title: 'Horas perdidas todo mês',
                desc: 'Downloads de extratos, copy-paste entre planilhas, fórmulas que quebram. Você gasta mais tempo organizando dados do que analisando investimentos.',
              },
              {
                emoji: '🎲',
                title: 'Decisões no escuro',
                desc: 'Sem contexto histórico, sem benchmark, sem projeções. Cada decisão de alocação é um chute educado — não uma estratégia baseada em dados.',
              },
            ].map(({ emoji, title, desc }) => (
              <div key={title} className="p-6 rounded-2xl bg-[#ff4466]/5 border border-[#ff4466]/15 card-glow transition-all">
                <div className="text-3xl mb-4">{emoji}</div>
                <h3 className="text-base font-bold text-[#e8e8f0] mb-2">{title}</h3>
                <p className="text-sm text-[#8888aa] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          {/* Bridge arrow */}
          <div className="flex justify-center mb-14">
            <div className="flex flex-col items-center gap-3">
              <div className="w-px h-10 bg-gradient-to-b from-[#ff4466]/40 to-[#ff7a00]" />
              <div className="px-4 py-2 rounded-full bg-[#ff7a00]/10 border border-[#ff7a00]/30 text-xs font-bold text-[#ff7a00] uppercase tracking-wider">
                Existe uma forma melhor
              </div>
              <div className="w-px h-10 bg-gradient-to-b from-[#ff7a00] to-[#00ff88]/40" />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                emoji: '✅',
                color: '#00ff88',
                title: 'Visão 360° instantânea',
                desc: 'Todo o seu patrimônio — BRL, USD, EUR — consolidado em um único painel atualizado em tempo real. Veja tudo em 30 segundos.',
              },
              {
                emoji: '⚡',
                color: '#00d4ff',
                title: 'Importação automática com IA',
                desc: 'Arraste o PDF do seu extrato e a IA categoriza e registra todas as transações automaticamente. Fim das horas perdidas.',
              },
              {
                emoji: '📊',
                color: '#ff7a00',
                title: 'Decisões baseadas em dados',
                desc: 'Projete metas, simule aportes, calcule VPL e TIR. Cada decisão de investimento respaldada por dados reais do seu portfólio.',
              },
            ].map(({ emoji, color, title, desc }) => (
              <div key={title} className="p-6 rounded-2xl bg-[#0d0d14] border border-[#1e1e2e] card-glow transition-all">
                <div className="text-3xl mb-4">{emoji}</div>
                <h3 className="text-base font-bold mb-2" style={{ color }}>{title}</h3>
                <p className="text-sm text-[#8888aa] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          BENEFITS / FEATURES
      ════════════════════════════════════════════════════════════ */}
      <section className="py-24 px-6 bg-[#080810] dot-grid">
        <div ref={benefits.ref} className={`max-w-5xl mx-auto lx-fade ${benefits.visible ? 'visible' : ''}`}>
          <div className="text-center mb-14">
            <p className="text-xs text-[#ff7a00] uppercase tracking-widest font-bold mb-3">Tudo que você precisa</p>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
              Ferramentas de nível institucional.<br />
              <span className="gradient-text">Para investidores individuais.</span>
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: <BarChart3 className="w-5 h-5" />,
                color: '#00d4ff',
                tag: 'Dashboard',
                title: 'Veja todo seu patrimônio em 30 segundos',
                desc: 'Painel consolidado com todos os seus ativos em BRL, USD e EUR. Evolução histórica, rentabilidade real e alocação por classe — tudo em uma tela.',
              },
              {
                icon: <TrendingUp className="w-5 h-5" />,
                color: '#3b82f6',
                tag: 'Investimentos',
                title: 'Saiba exatamente quanto cada ativo rende',
                desc: 'Gestão global, local e internacional com cálculo de TIR, dividendos recebidos e rebalanceamento automático pelo seu perfil de suitability.',
              },
              {
                icon: <Wallet className="w-5 h-5" />,
                color: '#00ff88',
                tag: 'Fluxo de Caixa',
                title: 'Descubra onde seu dinheiro realmente vai',
                desc: 'Receitas e despesas categorizadas automaticamente. Análise mensal, anual e por categoria com alertas de gastos acima do padrão.',
              },
              {
                icon: <Target className="w-5 h-5" />,
                color: '#8b5cf6',
                tag: 'Metas',
                title: 'Calcule quando você atinge a liberdade financeira',
                desc: 'Defina objetivos com valor e prazo. O sistema projeta automaticamente o aporte mensal necessário com base na taxa de retorno histórica.',
              },
              {
                icon: <FileSearch className="w-5 h-5" />,
                color: '#ff7a00',
                tag: 'IA de Documentos',
                title: 'Importe extratos bancários com 1 clique',
                desc: 'Nossa IA lê e categoriza PDFs do Nubank, Itaú, Bradesco, Santander, XP e mais. Nada de digitação manual — nunca mais.',
              },
              {
                icon: <Calculator className="w-5 h-5" />,
                color: '#f59e0b',
                tag: 'Ferramentas',
                title: 'Calcule o retorno real antes de investir',
                desc: 'Calculadoras de VPL, TIR, juros compostos, simulador de aportes e muito mais. Tome decisões com matemática, não com intuição.',
              },
            ].map(({ icon, color, tag, title, desc }, i) => (
              <div
                key={tag}
                className={`p-6 rounded-2xl bg-[#0d0d14] border border-[#1e1e2e] card-glow transition-all lx-fade lx-fade-delay-${Math.min(i + 1, 6)} ${benefits.visible ? 'visible' : ''}`}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4 border" style={{ background: `${color}15`, borderColor: `${color}30`, color }}>
                  {icon}
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color }}>{tag}</p>
                <h3 className="text-sm font-bold text-[#e8e8f0] mb-2 leading-snug">{title}</h3>
                <p className="text-[13px] text-[#8888aa] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          HOW IT WORKS
      ════════════════════════════════════════════════════════════ */}
      <section className="py-24 px-6">
        <div ref={howto.ref} className={`max-w-4xl mx-auto lx-fade ${howto.visible ? 'visible' : ''}`}>
          <div className="text-center mb-14">
            <p className="text-xs text-[#ff7a00] uppercase tracking-widest font-bold mb-3">Simples por design</p>
            <h2 className="text-3xl sm:text-4xl font-bold">Pronto em menos de 5 minutos.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', icon: <Shield className="w-6 h-6" />, title: 'Crie sua conta', desc: 'Cadastro simples com e-mail. Sem formulários intermináveis, sem burocracia.' },
              { step: '02', icon: <FileSearch className="w-6 h-6" />, title: 'Adicione seus ativos', desc: 'Importe extratos com IA ou cadastre manualmente. Funciona com qualquer banco ou corretora.' },
              { step: '03', icon: <TrendingUp className="w-6 h-6" />, title: 'Tome decisões inteligentes', desc: 'Visualize projeções, analise rentabilidade e rebalanceie sua carteira com confiança.' },
            ].map(({ step, icon, title, desc }, i) => (
              <div key={step} className={`relative text-center lx-fade lx-fade-delay-${i + 1} ${howto.visible ? 'visible' : ''}`}>
                {i < 2 && (
                  <div className="hidden md:block absolute top-8 left-[calc(50%+40px)] right-0 h-px border-t border-dashed border-[#2a2a3e]" />
                )}
                <div className="w-14 h-14 rounded-2xl bg-[#ff7a00]/10 border border-[#ff7a00]/25 text-[#ff7a00] flex items-center justify-center mx-auto mb-4">
                  {icon}
                </div>
                <p className="text-[10px] font-bold text-[#55556a] uppercase tracking-widest mb-2">Passo {step}</p>
                <h3 className="text-base font-bold text-[#e8e8f0] mb-2">{title}</h3>
                <p className="text-sm text-[#8888aa] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          PRICING
      ════════════════════════════════════════════════════════════ */}
      <section id="planos" className="py-24 px-6 dot-grid">
        <div ref={pricing.ref} className={`max-w-5xl mx-auto lx-fade ${pricing.visible ? 'visible' : ''}`}>
          <div className="text-center mb-5">
            <p className="text-xs text-[#ff7a00] uppercase tracking-widest font-bold mb-3">Invista em você</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">Planos simples. Resultado real.</h2>
            <p className="text-[#55556a]">Cancele quando quiser. Sem letras miúdas.</p>
          </div>

          {/* Recommendation nudge */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/25 text-[#00ff88] text-xs font-semibold">
              💡 90% dos nossos usuários escolhem o Anual ou Vitalício
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-start">

            {/* Monthly */}
            <div className="p-6 rounded-2xl bg-[#0d0d14] border border-[#1e1e2e] card-glow transition-all">
              <p className="text-xs text-[#55556a] uppercase tracking-widest font-bold mb-1">Mensal</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-bold text-[#e8e8f0]">R$ 20</span>
                <span className="text-sm text-[#55556a] mb-1.5">/mês</span>
              </div>
              <p className="text-xs text-[#55556a] mb-6">Cobrado mensalmente</p>
              <ul className="space-y-3 mb-8">
                {['Acesso completo à plataforma', 'Todos os módulos incluídos', 'IA de documentos', 'Cancele a qualquer momento'].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-[#8888aa]">
                    <Check className="w-4 h-4 text-[#55556a] mt-0.5 flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
              <a
                href={STRIPE_MONTHLY}
                className="block text-center py-3 rounded-xl border border-[#2a2a3e] text-sm font-semibold text-[#8888aa] hover:border-[#ff7a00]/30 hover:text-[#e8e8f0] transition-all"
              >
                Assinar mensalmente
              </a>
            </div>

            {/* Annual — FEATURED */}
            <div className="relative p-6 rounded-2xl bg-[#ff7a00]/5 border-2 border-[#ff7a00] shadow-[0_0_50px_rgba(255,122,0,0.12)] transition-all md:-mt-4 md:pb-10">
              <div className="absolute -top-4 left-0 right-0 flex justify-center">
                <span className="px-4 py-1.5 rounded-full bg-[#ff7a00] text-[#0a0a0f] text-[11px] font-bold uppercase tracking-wider">
                  🚀 Mais popular — 7 dias grátis
                </span>
              </div>
              <p className="text-xs text-[#ff7a00] uppercase tracking-widest font-bold mb-1 mt-3">Anual</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-bold text-[#e8e8f0]">R$ 200</span>
                <span className="text-sm text-[#55556a] mb-1.5">/ano</span>
              </div>
              <div className="flex items-center gap-2 mb-6">
                <span className="text-xs text-[#55556a] line-through">R$ 240/ano</span>
                <span className="px-2 py-0.5 rounded-md bg-[#00ff88]/15 text-[#00ff88] text-[10px] font-bold">17% OFF</span>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  'Tudo do plano mensal',
                  '7 dias de teste grátis',
                  '30 dias de garantia',
                  'Economia de R$ 40/ano',
                  'Suporte prioritário',
                ].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-[#c8c8d8]">
                    <Check className="w-4 h-4 text-[#ff7a00] mt-0.5 flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
              <a
                href={STRIPE_ANNUAL}
                className="block text-center py-3.5 rounded-xl bg-[#ff7a00] text-[#0a0a0f] text-sm font-bold hover:bg-[#e06500] transition-all btn-glow"
              >
                Começar 7 dias grátis →
              </a>
            </div>

            {/* Lifetime */}
            <div className="p-6 rounded-2xl bg-[#0d0d14] border border-[#8b5cf6]/40 shadow-[0_0_30px_rgba(139,92,246,0.06)] card-glow transition-all">
              <p className="text-xs text-[#8b5cf6] uppercase tracking-widest font-bold mb-1">Vitalício</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-bold text-[#e8e8f0]">R$ 350</span>
              </div>
              <p className="text-xs text-[#55556a] mb-6">Pagamento único · para sempre</p>
              <ul className="space-y-3 mb-8">
                {[
                  'Tudo do plano anual',
                  '7 dias de teste grátis',
                  '30 dias de garantia',
                  'Todas as atualizações futuras',
                  'Acesso vitalício garantido',
                ].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-[#c8c8d8]">
                    <Check className="w-4 h-4 text-[#8b5cf6] mt-0.5 flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
              <a
                href={STRIPE_LIFETIME}
                className="block text-center py-3 rounded-xl bg-[#8b5cf6]/15 border border-[#8b5cf6]/40 text-[#8b5cf6] text-sm font-bold hover:bg-[#8b5cf6]/25 transition-all"
              >
                ⚡ Acesso vitalício
              </a>
              <p className="text-center text-[11px] text-[#55556a] mt-3">Pague uma vez. Use para sempre.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          GUARANTEE BANNER
      ════════════════════════════════════════════════════════════ */}
      <section className="py-14 px-6 bg-[#080810] border-y border-[#1e1e2e]">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
          <div className="w-16 h-16 rounded-2xl bg-[#00ff88]/10 border border-[#00ff88]/25 flex items-center justify-center flex-shrink-0">
            <Shield className="w-8 h-8 text-[#00ff88]" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#e8e8f0] mb-1">30 dias de garantia de reembolso total</h3>
            <p className="text-sm text-[#8888aa] leading-relaxed">
              Se por qualquer motivo você não ficar satisfeito nos primeiros 30 dias, devolvemos <strong className="text-[#00ff88]">100% do seu dinheiro</strong>. Sem perguntas, sem burocracia. Você tem zero risco.
            </p>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          TRUST BADGES
      ════════════════════════════════════════════════════════════ */}
      <section className="py-10 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-xs text-[#55556a] uppercase tracking-widest mb-6">Segurança e tecnologia que você pode confiar</p>
          <div className="flex flex-wrap justify-center items-center gap-8">
            {[
              { icon: <Lock className="w-4 h-4" />, label: 'SSL / TLS 1.3' },
              { icon: <Shield className="w-4 h-4" />, label: 'Stripe Payments' },
              { icon: <Globe className="w-4 h-4" />, label: 'Supabase SOC 2' },
              { icon: <Users className="w-4 h-4" />, label: '2.800+ usuários' },
              { icon: <Zap className="w-4 h-4" />, label: '99.9% uptime' },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-[#55556a] hover:text-[#8888aa] transition-colors">
                {icon}
                <span className="text-xs font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          FAQ
      ════════════════════════════════════════════════════════════ */}
      <section className="py-24 px-6 bg-[#080810]">
        <div ref={faq.ref} className={`max-w-3xl mx-auto lx-fade ${faq.visible ? 'visible' : ''}`}>
          <div className="text-center mb-12">
            <p className="text-xs text-[#ff7a00] uppercase tracking-widest font-bold mb-3">Dúvidas frequentes</p>
            <h2 className="text-3xl sm:text-4xl font-bold">Ainda com dúvidas?</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map(({ q, a }) => <FAQItem key={q} q={q} a={a} />)}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          FINAL CTA
      ════════════════════════════════════════════════════════════ */}
      <section className="py-28 px-6 relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 80% at 50% 50%, rgba(255,122,0,0.10) 0%, transparent 70%)' }} />
        <div className="absolute inset-0 dot-grid opacity-40" />
        <div ref={finalCta.ref} className={`relative max-w-3xl mx-auto text-center lx-fade ${finalCta.visible ? 'visible' : ''}`}>
          <div className="w-14 h-14 rounded-2xl bg-[#ff7a00]/15 border border-[#ff7a00]/30 flex items-center justify-center mx-auto mb-6">
            <svg viewBox="0 0 16 16" fill="none" className="w-8 h-8">
              <polygon points="8,1 15,14.5 1,14.5" fill="#ff7a00" opacity="0.9" />
              <polygon points="8,1 10,5.5 6,5.5" fill="#ffb347" opacity="0.9" />
            </svg>
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold leading-tight mb-5">
            Seu patrimônio merece<br />
            <span className="gradient-text">uma ferramenta à altura.</span>
          </h2>
          <p className="text-lg text-[#8888aa] mb-8 max-w-xl mx-auto leading-relaxed">
            Junte-se a mais de <strong className="text-[#e8e8f0]">2.800 investidores</strong> que já tomam decisões financeiras com inteligência e dados reais.
          </p>
          <a
            href={STRIPE_ANNUAL}
            className="inline-flex items-center gap-2.5 px-9 py-5 rounded-2xl bg-[#ff7a00] text-[#0a0a0f] text-lg font-bold hover:bg-[#e06500] transition-all btn-glow mb-6"
          >
            Começar 7 Dias Grátis Agora
            <ArrowRight className="w-5 h-5" />
          </a>
          <div className="flex flex-wrap justify-center gap-5 text-xs text-[#55556a]">
            {['7 dias grátis', 'Cancele quando quiser', '30 dias de garantia'].map(t => (
              <span key={t} className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-[#00ff88]" />{t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-[#1e1e2e] bg-[#080810] py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#ff7a00] flex items-center justify-center">
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
                <polygon points="8,1.5 14.5,14 1.5,14" fill="white" opacity="0.9" />
                <polygon points="8,1.5 10,6 6,6" fill="#ff7a00" opacity="0.9" />
              </svg>
            </div>
            <span className="text-sm font-bold">Luxor <span className="text-[#ff7a00]">Pro</span></span>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-xs text-[#55556a]">
            <a href="#planos" className="hover:text-[#ff7a00] transition-colors">Planos</a>
            <a href="#planos" className="hover:text-[#ff7a00] transition-colors">FAQ</a>
            <a href="/app" className="hover:text-[#ff7a00] transition-colors">Entrar</a>
            <a href={`mailto:suporte@luxorpro.com.br`} className="hover:text-[#ff7a00] transition-colors">suporte@luxorpro.com.br</a>
          </div>
          <p className="text-xs text-[#333348]">© {new Date().getFullYear()} Luxor Pro. Todos os direitos reservados.</p>
        </div>
      </footer>

    </div>
  )
}
