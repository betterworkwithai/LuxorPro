import React from 'react'
import { Link } from 'react-router-dom'

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0] flex flex-col">

      {/* ── Nav ── */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#ff7a00] flex items-center justify-center">
            <svg viewBox="0 0 16 16" fill="none" className="w-5 h-5">
              <polygon points="8,1 15,14.5 1,14.5" fill="white" opacity="0.9"/>
              <polygon points="8,1 10,5.5 6,5.5" fill="#ff7a00" opacity="0.9"/>
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight">Luxor Pro</span>
        </div>
        <Link
          to="/app"
          className="px-4 py-2 rounded-xl bg-[#ff7a00] text-[#0a0a0f] text-sm font-bold hover:bg-[#e06500] transition-colors"
        >
          Entrar
        </Link>
      </nav>

      {/* ── Hero ── */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 max-w-4xl mx-auto w-full">

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#ff7a00]/10 border border-[#ff7a00]/30 text-[#ff7a00] text-xs font-semibold mb-8 uppercase tracking-wider">
          Automação de Elite para o seu Capital
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold leading-tight mb-6 tracking-tight">
          Seu patrimônio,{' '}
          <span className="text-[#ff7a00]">inteligente.</span>
        </h1>

        <p className="text-lg text-[#8888aa] max-w-2xl mb-10 leading-relaxed">
          Controle investimentos, fluxo de caixa, metas e patrimônio em um único lugar.
          Com inteligência artificial para análise de documentos e rebalanceamento automático.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
          <Link
            to="/app"
            className="px-8 py-4 rounded-2xl bg-[#ff7a00] text-[#0a0a0f] text-base font-bold hover:bg-[#e06500] transition-colors shadow-[0_0_30px_rgba(255,122,0,0.3)]"
          >
            Começar — 7 dias grátis
          </Link>
          <Link
            to="/app"
            className="px-8 py-4 rounded-2xl border border-[#1e1e2e] text-[#8888aa] text-base font-medium hover:border-[#ff7a00]/40 hover:text-[#e8e8f0] transition-colors"
          >
            Já tenho conta →
          </Link>
        </div>

        {/* ── Feature grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full text-left">
          {[
            {
              icon: '📊',
              title: 'Dashboard Consolidado',
              desc: 'Visão global do seu patrimônio com gráficos em tempo real.',
            },
            {
              icon: '💰',
              title: 'Fluxo de Caixa',
              desc: 'Receitas e despesas organizadas por categoria com análise mensal.',
            },
            {
              icon: '📈',
              title: 'Gestão de Investimentos',
              desc: 'Carteira global, local e internacional com rebalanceamento por perfil.',
            },
            {
              icon: '🎯',
              title: 'Metas Financeiras',
              desc: 'Defina e acompanhe objetivos com projeções automáticas.',
            },
            {
              icon: '🤖',
              title: 'IA de Documentos',
              desc: 'Importação automática de extratos bancários e faturas.',
            },
            {
              icon: '🛠️',
              title: 'Ferramentas Financeiras',
              desc: 'Calculadora de VPL, TIR, juros compostos e muito mais.',
            },
          ].map(({ icon, title, desc }) => (
            <div
              key={title}
              className="p-5 rounded-2xl bg-[#0d0d14] border border-[#1e1e2e] hover:border-[#ff7a00]/30 transition-colors"
            >
              <div className="text-2xl mb-3">{icon}</div>
              <h3 className="text-sm font-semibold text-[#e8e8f0] mb-1">{title}</h3>
              <p className="text-xs text-[#55556a] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* ── Pricing ── */}
      <section className="py-20 px-6 max-w-4xl mx-auto w-full">
        <h2 className="text-2xl font-bold text-center mb-2">Planos simples, resultado real</h2>
        <p className="text-sm text-[#55556a] text-center mb-10">Cancele a qualquer momento. Sem surpresas.</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { name: 'Mensal', price: 'R$ 20', period: '/mês', note: 'Cancele a qualquer momento', featured: false },
            { name: 'Vitalício', price: 'R$ 350', period: ' único', note: '7 dias grátis · Mais escolhido', featured: true },
            { name: 'Anual', price: 'R$ 200', period: '/ano', note: '7 dias grátis · 17% de desconto', featured: false },
          ].map(({ name, price, period, note, featured }) => (
            <div
              key={name}
              className={`p-6 rounded-2xl border flex flex-col gap-4 ${
                featured
                  ? 'border-[#ff7a00] bg-[#ff7a00]/5 shadow-[0_0_30px_rgba(255,122,0,0.1)]'
                  : 'border-[#1e1e2e] bg-[#0d0d14]'
              }`}
            >
              {featured && (
                <div className="text-[10px] font-bold text-[#ff7a00] uppercase tracking-widest">⭐ Mais popular</div>
              )}
              <div>
                <p className="text-xs text-[#8888aa] mb-1">{name}</p>
                <p className="text-3xl font-bold text-[#e8e8f0]">
                  {price}<span className="text-sm font-normal text-[#55556a]">{period}</span>
                </p>
              </div>
              <p className="text-xs text-[#55556a]">{note}</p>
              <Link
                to="/app"
                className={`mt-auto text-center py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  featured
                    ? 'bg-[#ff7a00] text-[#0a0a0f] hover:bg-[#e06500]'
                    : 'border border-[#1e1e2e] text-[#8888aa] hover:border-[#ff7a00]/40 hover:text-[#e8e8f0]'
                }`}
              >
                Começar agora
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#1e1e2e] py-6 px-6 text-center">
        <p className="text-xs text-[#55556a]">
          © {new Date().getFullYear()} Luxor Pro · <a href="mailto:contato@luxorpro.com.br" className="hover:text-[#ff7a00] transition-colors">contato@luxorpro.com.br</a>
        </p>
      </footer>
    </div>
  )
}
