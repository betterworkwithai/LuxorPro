import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import LuxorApp from "./LuxorApp";
import ResetPassword from "./pages/ResetPassword";
import { supabase, SUPABASE_CONFIGURED } from "./lib/supabase";

// Shared key used across Sidebar, MobileNav, Auth and LuxorApp
export const LOCAL_AUTH_KEY = "luxorpro_local_auth";

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
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/app/*" element={<LuxorApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
