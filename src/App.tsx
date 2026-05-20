import React, { Suspense, lazy, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import { supabase, SUPABASE_CONFIGURED } from "./lib/supabase";

// Code-split the heavy auth-gated app, the standalone calculator, and the
// reset-password flow. None of them are needed before the user navigates off
// the landing page. This keeps PDF.js / tesseract / html2canvas / jsPDF /
// recharts / supabase out of the initial bundle.
const LuxorApp      = lazy(() => import("./LuxorApp"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Calculadora   = lazy(() => import("./pages/Calculadora"));

// Shared key used across Sidebar, MobileNav, Auth and LuxorApp
export const LOCAL_AUTH_KEY = "luxorpro_local_auth";

function RouteSuspenseFallback() {
  // Match the LoadingScreen inside LuxorApp so users don't see a colour flash.
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0a0f',
    }}>
      <img
        src="/logo.png"
        alt="Carregando…"
        width={192}
        height={192}
        style={{ width: 192, height: 192, objectFit: 'contain', animation: 'luxor-pulse 1.6s ease-in-out infinite' }}
      />
    </div>
  );
}

/**
 * /login and /signup — explicit auth entries from the marketing page.
 * Clears any stale session so the user always sees the login or signup
 * form instead of bouncing to the subscription gate when their cached
 * profile lacks an active plan. The `mode` prop decides which tab the
 * Auth screen opens to once the user lands at /app.
 */
function AuthEntry({ mode }: { mode: "login" | "signup" }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const cleanup = async () => {
      try {
        if (SUPABASE_CONFIGURED) await supabase.auth.signOut();
      } catch { /* ignore */ }
      try {
        localStorage.removeItem(LOCAL_AUTH_KEY);
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("sb-") || k.startsWith("supabase.auth."))) keysToRemove.push(k);
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch { /* ignore */ }
      setReady(true);
    };
    cleanup();
  }, []);
  if (!ready) return null;
  return <Navigate to={`/app?mode=${mode}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<AuthEntry mode="login" />} />
      <Route path="/signup" element={<AuthEntry mode="signup" />} />
      <Route path="/reset-password" element={
        <Suspense fallback={<RouteSuspenseFallback />}>
          <ResetPassword />
        </Suspense>
      } />
      <Route path="/calculadora" element={
        <Suspense fallback={<RouteSuspenseFallback />}>
          <Calculadora />
        </Suspense>
      } />
      <Route path="/app/*" element={
        <Suspense fallback={<RouteSuspenseFallback />}>
          <LuxorApp />
        </Suspense>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
