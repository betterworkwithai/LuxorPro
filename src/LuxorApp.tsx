import React, { Suspense, lazy, useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { PageLayout } from "./components/layout/PageLayout";
import { useStore } from "./store/useStore";
import { supabase, SUPABASE_CONFIGURED } from "./lib/supabase";
import { setActiveUser } from "./lib/db";
import Auth from "./pages/Auth";
import Subscription from "./pages/Subscription";
import { getStoredSubscription, setStoredSubscription, clearStoredSubscription } from "./lib/stripe";
import { LOCAL_AUTH_KEY } from "./App";
import type { User } from "@supabase/supabase-js";

import { OnboardingModal } from "./components/ui/OnboardingModal";
import { V2ErrorBoundary } from "./components/v2/V2ErrorBoundary";
import { isAdmin } from "./lib/admin";

// Lazy-load every routable page so the heavy ones (DocumentAI pulls in
// tesseract.js + pdfjs-dist; Wealth* pulls in jspdf + html2canvas) only load
// when the user actually navigates there.
const Dashboard      = lazy(() => import("./pages/Dashboard"));
const Cashflow       = lazy(() => import("./pages/Cashflow"));
const Wealth         = lazy(() => import("./pages/Wealth"));
const DashboardV2    = lazy(() => import("./pages/DashboardV2"));
const CashflowV2     = lazy(() => import("./pages/CashflowV2"));
const WealthV2       = lazy(() => import("./pages/WealthV2"));
const Goals          = lazy(() => import("./pages/Goals"));
const DocumentAI     = lazy(() => import("./pages/DocumentAI"));
const Connections    = lazy(() => import("./pages/Connections"));
const Settings       = lazy(() => import("./pages/Settings"));
const FinancialTools = lazy(() => import("./pages/FinancialTools"));
const Admin          = lazy(() => import("./pages/Admin"));

function LoadingScreen() {
  // Subtle pulse on the static PNG. The animation is GPU-friendly (opacity +
  // scale) and respects prefers-reduced-motion via a media query in index.css.
  return (
    <div className="h-screen flex items-center justify-center bg-[#0a0a0f]">
      <img
        src="/logo.png"
        alt="Carregando…"
        width="256"
        height="256"
        className="w-64 h-64 object-contain"
        style={{ animation: 'luxor-pulse 1.6s ease-in-out infinite' }}
      />
    </div>
  );
}

function AppRoutes({ isAdminUser }: { isAdminUser: boolean }) {
  return (
    <PageLayout>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* V2 — new default surfaces (real data, redesigned UI) */}
          <Route path="/" element={<V2ErrorBoundary pageName="Painel"><DashboardV2 /></V2ErrorBoundary>} />
          <Route path="/cashflow" element={<V2ErrorBoundary pageName="Receitas e Despesas"><CashflowV2 /></V2ErrorBoundary>} />
          <Route path="/wealth" element={<V2ErrorBoundary pageName="Investimentos"><WealthV2 /></V2ErrorBoundary>} />
          {/* Legacy fallbacks — kept for users who need the old views */}
          <Route path="/legacy" element={<Dashboard />} />
          <Route path="/legacy/cashflow" element={<Cashflow />} />
          <Route path="/legacy/wealth" element={<Wealth />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/documents" element={<DocumentAI />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/tools" element={<FinancialTools />} />
          {isAdminUser && <Route path="/admin" element={<Admin />} />}
          <Route path="*" element={<DashboardV2 />} />
        </Routes>
      </Suspense>
      <OnboardingModal />
    </PageLayout>
  );
}

export default function LuxorApp() {
  const { init, isLoading } = useStore();
  const [authed, setAuthed] = useState<boolean | undefined>(undefined);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [sessionUser, setSessionUser] = useState<User | undefined>(undefined);
  const [subscriptionDone, setSubscriptionDone] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [subVerified, setSubVerified] = useState<boolean | null>(null);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Luxor Pro";
    return () => { document.title = prevTitle; };
  }, []);

  useEffect(() => {
    const handler = () => setShowSubscription(true);
    window.addEventListener('luxor:show-subscription', handler);
    return () => window.removeEventListener('luxor:show-subscription', handler);
  }, []);

  // Detect Stripe success redirect early — short-circuit the subscription gate
  // before it has a chance to render <Subscription> while the webhook is still
  // propagating. Webhook will catch up; in the meantime, the local flag is
  // enough to land the user on the dashboard immediately after payment.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscription_success') === '1') {
      const plan = params.get('plan') ?? 'unknown';
      setStoredSubscription(plan);
      setSubscriptionDone(true);
      setSubVerified(true);
      // Clean the URL so a refresh doesn't re-trigger
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!authed || !userId) { setSubVerified(null); return; }
    if (!SUPABASE_CONFIGURED) { setSubVerified(true); return; }
    // Admin users (role set in Supabase app_metadata) bypass subscription entirely
    if (isAdmin(sessionUser)) { setSubVerified(true); return; }

    supabase
      .from('profiles')
      .select('subscription_status, subscription_plan')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!data) { clearStoredSubscription(); setSubVerified(false); return; }
        const active = data.subscription_status === 'active' || data.subscription_status === 'trialing';
        if (active && data.subscription_plan) setStoredSubscription(data.subscription_plan as string);
        else clearStoredSubscription();
        setSubVerified(active);
      })
      .catch(() => setSubVerified(!!getStoredSubscription()));
  }, [authed, userId, sessionUser]);

  const [sessionGateChecked, setSessionGateChecked] = useState(false);
  useEffect(() => {
    // Electron desktop: skip the session gate entirely so the user stays logged
    // in between app restarts (session gate is a web-tab security feature only).
    if ((window as any).electronAPI) {
      setSessionGateChecked(true);
      return;
    }

    const TAB_MARKER = 'luxor_tab_session';
    const isFreshTab = !sessionStorage.getItem(TAB_MARKER);
    sessionStorage.setItem(TAB_MARKER, '1');

    const hash = window.location.hash || '';
    const hasAuthHash = /access_token=|type=recovery|type=magiclink|type=signup|type=invite|type=email_change/.test(hash);

    if (isFreshTab && !hasAuthHash) {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('sb-') || k.startsWith('supabase.auth.'))) keysToRemove.push(k);
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch { /* ignore */ }
      localStorage.removeItem(LOCAL_AUTH_KEY);
      if (SUPABASE_CONFIGURED) {
        supabase.auth.signOut().finally(() => setSessionGateChecked(true));
      } else {
        setSessionGateChecked(true);
      }
    } else {
      setSessionGateChecked(true);
    }
  }, []);

  useEffect(() => {
    if (!sessionGateChecked) return;
    if (!SUPABASE_CONFIGURED) {
      const localAuth = localStorage.getItem(LOCAL_AUTH_KEY) === "1";
      setAuthed(localAuth);
      if (localAuth) { setActiveUser("local"); setUserId("local"); init(); }
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const has = !!data.session;
      setAuthed(has);
      if (has) {
        setActiveUser(data.session?.user?.id);
        setUserId(data.session?.user?.id);
        setSessionUser(data.session?.user);
        init();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const has = !!session;
      setAuthed(has);
      if (has) {
        setActiveUser(session?.user?.id);
        setUserId(session?.user?.id);
        setSessionUser(session?.user);
        init();
      } else {
        setActiveUser(null);
        setUserId(undefined);
        setSessionUser(undefined);
      }
    });

    return () => subscription.unsubscribe();
  }, [sessionGateChecked]);

  // Show loading screen while awaiting sub check; skip if we have a local hint (avoids flash for returning users)
  const awaitingSubCheck = authed === true && subVerified === null && !getStoredSubscription();
  // Gate is server-authoritative: only block when Supabase explicitly confirms inactive
  const needsSubscription = !subscriptionDone && authed === true && subVerified === false;

  if (authed === undefined) return <LoadingScreen />;
  if (!authed) return <Auth />;
  if (isLoading || awaitingSubCheck) return <LoadingScreen />;
  if (needsSubscription || showSubscription)
    return (
      <Subscription
        userId={userId}
        onComplete={() => { setSubscriptionDone(true); setShowSubscription(false); }}
      />
    );

  // Local mode (no Supabase): always grant admin so the page is accessible
  return <AppRoutes isAdminUser={!SUPABASE_CONFIGURED || isAdmin(sessionUser)} />;
}
