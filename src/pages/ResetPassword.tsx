import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clsx } from "clsx";

const BRAND = "#ff7a00";
const BRAND_GRADIENT = "linear-gradient(135deg, #ff7a00, #ff4500)";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [validSession, setValidSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hash = window.location.hash || "";
    if (hash.includes("error=") || hash.includes("error_description=")) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const desc = params.get("error_description") || params.get("error") || "Link inválido ou expirado.";
      setError(decodeURIComponent(desc.replace(/\+/g, " ")));
      setReady(true);
      return;
    }

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setValidSession(!!data.session);
      setReady(true);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setValidSession(!!session);
        setReady(true);
      }
    });

    check();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message || "Não foi possível atualizar a senha.");
      return;
    }
    setDone(true);
    await supabase.auth.signOut();
    setTimeout(() => navigate("/app", { replace: true }), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
            style={{
              background: "rgba(255,122,0,0.1)",
              border: "1px solid rgba(255,122,0,0.3)",
              boxShadow: "0 0 30px rgba(255,122,0,0.15)",
            }}
          >
            <Sparkles className="w-7 h-7" style={{ color: BRAND }} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#e8e8f0] tracking-tight">Redefinir Senha</h1>
            <p className="text-xs text-[#8888aa] mt-1">Defina uma nova senha para sua conta Luxor Pro</p>
          </div>
        </div>

        <div className="bg-[#0f0f17] border border-[#1e1e2e] rounded-2xl p-6 shadow-xl">
          {!ready ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: BRAND }} />
            </div>
          ) : done ? (
            <div className="text-center space-y-4 py-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
                style={{ background: "rgba(0,255,136,0.1)", border: "1px solid rgba(0,255,136,0.3)" }}
              >
                <CheckCircle2 className="w-7 h-7 text-[#00ff88]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#e8e8f0]">Senha atualizada!</p>
                <p className="text-xs text-[#55556a] mt-1">Redirecionando para o login…</p>
              </div>
            </div>
          ) : !validSession ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 p-3 rounded-xl text-xs border bg-[#ff4466]/5 border-[#ff4466]/20 text-[#ff4466]">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error || "Link inválido ou expirado. Solicite um novo e-mail de redefinição."}</span>
              </div>
              <button
                onClick={() => navigate("/app", { replace: true })}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: BRAND_GRADIENT }}
              >
                Voltar ao login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl text-xs border bg-[#ff4466]/5 border-[#ff4466]/20 text-[#ff4466]">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-[#8888aa] block mb-1.5">Nova Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#55556a]" />
                  <input
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    autoComplete="new-password"
                    disabled={loading}
                    className={clsx(
                      "w-full bg-[#111118] border border-[#1e1e2e] rounded-xl text-sm text-[#e8e8f0]",
                      "placeholder:text-[#55556a] outline-none py-3 pl-10 pr-10",
                      "focus:border-[#ff7a00]/60 focus:ring-1 focus:ring-[#ff7a00]/20",
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#55556a] hover:text-[#e8e8f0]"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[#8888aa] block mb-1.5">Confirmar Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#55556a]" />
                  <input
                    type={showPwd ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repita a nova senha"
                    autoComplete="new-password"
                    disabled={loading}
                    className={clsx(
                      "w-full bg-[#111118] border border-[#1e1e2e] rounded-xl text-sm text-[#e8e8f0]",
                      "placeholder:text-[#55556a] outline-none py-3 pl-10 pr-4",
                      "focus:border-[#ff7a00]/60 focus:ring-1 focus:ring-[#ff7a00]/20",
                    )}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 hover:opacity-90 active:scale-[0.98]"
                style={{ background: BRAND_GRADIENT, boxShadow: "0 8px 24px rgba(255,122,0,0.25)" }}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? "Atualizando…" : "Atualizar Senha"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
