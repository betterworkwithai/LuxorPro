// ─────────────────────────────────────────────
//  V2ErrorBoundary — catches render-time errors
//  inside the new V2 pages and shows an actionable
//  message instead of a white screen, so the user
//  can copy/paste the error if it ever recurs.
// ─────────────────────────────────────────────
import React from 'react'
import { AlertTriangle } from 'lucide-react'

interface State { error: Error | null }
interface Props { children: React.ReactNode; pageName: string }

export class V2ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[V2:${this.props.pageName}] crash`, error, info)
  }

  render() {
    if (this.state.error) {
      const e = this.state.error
      return (
        <div className="v2-root min-h-screen p-6 sm:p-10 max-w-3xl mx-auto">
          <div className="v2-card p-6 sm:p-8" style={{ borderColor: 'rgba(255,68,102,.35)' }}>
            <div className="flex items-center gap-3 mb-4">
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,68,102,.12)', color: '#ff4466' }}
              >
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base font-bold text-[#e8e8f0]">Algo travou ao montar {this.props.pageName}</h2>
                <p className="text-xs text-[#8888aa]">A página foi protegida pelo boundary — abaixo está o erro técnico.</p>
              </div>
            </div>
            <pre className="mt-3 text-[11px] leading-snug text-[#ff8898] bg-[#0a0a0f] border border-[#1e1e30] rounded-lg p-3 overflow-auto whitespace-pre-wrap">
              {e.name}: {e.message}
              {e.stack ? '\n\n' + e.stack.split('\n').slice(0, 8).join('\n') : ''}
            </pre>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => this.setState({ error: null })}
                className="px-3 py-2 rounded-xl text-xs font-semibold border border-[#1e1e30] bg-[#0f1018] text-[#e8e8f0] hover:border-[#00d4ff]/30"
              >
                Tentar de novo
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-3 py-2 rounded-xl text-xs font-semibold border border-[#1e1e30] bg-[#0f1018] text-[#8888aa] hover:text-white"
              >
                Recarregar a página
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
