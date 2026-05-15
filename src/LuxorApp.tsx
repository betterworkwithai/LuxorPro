import React, { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { PageLayout } from "./components/layout/PageLayout";
import { useStore } from "./store/useStore";
import { supabase, SUPABASE_CONFIGURED } from "./lib/supabase";
import { setActiveUser } from "./lib/db";
import Auth from "./pages/Auth";
import Subscription from "./pages/Subscription";
import { getStoredSubscription, setStoredSubscription, reconcileSubscription } from "./lib/stripe";
import { LOCAL_AUTH_KEY } from "./App";

import { OnboardingModal } from "./components/ui/OnboardingModal";
import Dashboard from "./pages/Dashboard";
import Cashflow from "./pages/Cashflow";
import Wealth from "./pages/Wealth";
import DashboardV2 from "./pages/DashboardV2";
import CashflowV2 from "./pages/CashflowV2";
import WealthV2 from "./pages/WealthV2";
import { V2ErrorBoundary } from "./components/v2/V2ErrorBoundary";
import Goals from "./pages/Goals";
import DocumentAI from "./pages/DocumentAI";
import Connections from "./pages/Connections";
import Settings from "./pages/Settings";
import FinancialTools from "./pages/FinancialTools";
import Admin from "./pages/Admin";
import { isAdmin } from "./lib/admin";

function LoadingScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-[#0a0a0f]">
      <img src="/logo.gif" alt="Carregando…" className="w-64 h-64 object-contain" />
    </div>
  );
}

function AppRoutes({ userEmail }: { userEmail?: string }) {
  return (
    <PageLayout>
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
        {isAdmin(userEmail) && <Route path="/admin" element={<Admin />} />}
        <Route path="*" element={<DashboardV2 />} />
      </Routes>
      <OnboardingModal />
    </PageLayout>
  );
}

export default function LuxorApp() {
  const { init, isLoading } = useStore();
  const [authed, setAuthed] = useState<boolean | undefined>(undefined);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
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
  // We ALSO call reconcile-subscription server-side to front-run the webhook
  // — that way the DB has the truth even before Stripe's async dispatch fires.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscription_success') === '1') {
      const plan = params.get('plan') ?? 'unknown';
      setStoredSubscription(plan);
      setSubscriptionDone(true);
      setSubVerified(true);
      // Clean the URL so a refresh doesn't re-trigger
      window.history.replaceState({}, '', window.location.pathname);
      // Fire-and-forget: write the truth to profiles right now so the
      // user doesn't depend on Stripe's webhook arriving. Safe to fail —
      // the local flags above already let them in for this session.
      reconcileSubscription().catch(() => { /* ignore */ });
    }
  }, []);

  useEffect(() => {
    if (!authed || !userId) { setSubVerified(null); return; }
    if (!SUPABASE_CONFIGURED) { setSubVerified(true); return; }
    // Admin emails bypass subscription entirely
    if (isAdmin(userEmail)) { setSubVerified(true); return; }

    let cancelled = false;
    supabase
      .from('profiles')
      .select('subscription_status, subscription_plan')
      .eq('id', userId)
      .single()
      .then(async ({ data }) => {
        if (cancelled) return;
        const active = !!data && (data.subscription_status === 'active' || data.subscription_status === 'trialing');
        if (active && data?.subscription_plan) setStoredSubscription(data.subscription_plan as string);

        // If the DB says active/trialing OR the row doesn't exist at
        // all (race with profile creation), trust the result and exit.
        if (active) { setSubVerified(true); return; }
        if (!data && getStoredSubscription()) { setSubVerified(true); return; }

        // Otherwise the DB says "no active sub". Before locking the user
        // out of their paid product, ask Stripe directly — this catches
        // every case where the webhook failed/lagged/silently dropped a
        // customer-link event. Frontend-driven recovery is the last line
        // of defense; without it, a webhook miss is permanent lockout.
        try {
          const result = await reconcileSubscription();
          if (cancelled) return;
          if ('active' in result && result.active) {
            if (result.plan) setStoredSubscription(result.plan);
            setSubVerified(true);
            return;
          }
        } catch { /* ignore — fall through to false */ }
        if (!cancelled) setSubVerified(false);
      })
      .catch(async () => {
        if (cancelled) return;
        // Network failure on the profile query — try reconcile as a
        // tiebreaker before locking the user out.
        try {
          const result = await reconcileSubscription();
          if (cancelled) return;
          if ('active' in result && result.active) {
            if (result.plan) setStoredSubscription(result.plan);
            setSubVerified(true);
            return;
          }
        } catch { /* ignore */ }
        if (!cancelled) setSubVerified(!!getStoredSubscription());
      });

    return () => { cancelled = true };
  }, [authed, userId, userEmail]);

  const [sessionGateChecked, setSessionGateChecked] = useState(false);
  useEffect(() => {
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
        setUserEmail(data.session?.user?.email);
        init();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const has = !!session;
      setAuthed(has);
      if (has) {
        setActiveUser(session?.user?.id);
        setUserId(session?.user?.id);
        setUserEmail(session?.user?.email);
        init();
      } else {
        setActiveUser(null);
        setUserId(undefined);
        setUserEmail(undefined);
      }
    });

    return () => subscription.unsubscribe();
  }, [sessionGateChecked]);

  // While the subscription check is in flight, only block on the loading
  // screen if we don't already have a localStorage marker telling us this
  // user has paid before. With a marker, render the app optimistically —
  // the async check will downgrade them silently if it eventually decides
  // they're not paid (rare, and the reconcile fallback above prevents it).
  const awaitingSubCheck = authed === true && subVerified === null && !getStoredSubscription();

  // The gate. Three things bypass it (in order of authority):
  //   1. subscriptionDone — in-session flag set after a successful payment
  //   2. subVerified===true — DB or reconcile confirmed active/trialing
  //   3. getStoredSubscription() — the user has a localStorage marker from
  //      a prior successful checkout. Soft signal but enough to avoid
  //      forcing a paying customer back to plan select while we recover.
  const needsSubscription =
    !subscriptionDone &&
    authed === true &&
    subVerified === false &&
    !getStoredSubscription();

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

  return <AppRoutes userEmail={userEmail} />;
}
