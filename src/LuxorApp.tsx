import React, { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { PageLayout } from "./components/layout/PageLayout";
import { useStore } from "./store/useStore";
import { supabase, SUPABASE_CONFIGURED } from "./lib/supabase";
import { setActiveUser } from "./lib/db";
import Auth from "./pages/Auth";
import Subscription from "./pages/Subscription";
import { getStoredSubscription, setStoredSubscription } from "./lib/stripe";
import { LOCAL_AUTH_KEY } from "./App";

import { OnboardingModal } from "./components/ui/OnboardingModal";
import Dashboard from "./pages/Dashboard";
import Cashflow from "./pages/Cashflow";
import Wealth from "./pages/Wealth";
import Goals from "./pages/Goals";
import DocumentAI from "./pages/DocumentAI";
import Connections from "./pages/Connections";
import Settings from "./pages/Settings";
import FinancialTools from "./pages/FinancialTools";

function LoadingScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-[#0a0a0f]">
      <img src="/logo.gif" alt="Carregando…" className="w-64 h-64 object-contain" />
    </div>
  );
}

function AppRoutes() {
  return (
    <PageLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/cashflow" element={<Cashflow />} />
        <Route path="/wealth" element={<Wealth />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/documents" element={<DocumentAI />} />
        <Route path="/connections" element={<Connections />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/tools" element={<FinancialTools />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
      <OnboardingModal />
    </PageLayout>
  );
}

export default function LuxorApp() {
  const { init, isLoading } = useStore();
  const [authed, setAuthed] = useState<boolean | undefined>(undefined);
  const [userId, setUserId] = useState<string | undefined>(undefined);
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

  useEffect(() => {
    if (!authed || !userId) { setSubVerified(null); return; }
    if (!SUPABASE_CONFIGURED) { setSubVerified(true); return; }

    supabase
      .from('profiles')
      .select('subscription_status, subscription_plan')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!data) { setSubVerified(!!getStoredSubscription()); return; }
        const active = data.subscription_status === 'active' || data.subscription_status === 'trialing';
        if (active && data.subscription_plan) setStoredSubscription(data.subscription_plan as string);
        setSubVerified(active);
      })
      .catch(() => setSubVerified(!!getStoredSubscription()));
  }, [authed, userId]);

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
        init();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const has = !!session;
      setAuthed(has);
      if (has) {
        setActiveUser(session?.user?.id);
        setUserId(session?.user?.id);
        init();
      } else {
        setActiveUser(null);
        setUserId(undefined);
      }
    });

    return () => subscription.unsubscribe();
  }, [sessionGateChecked]);

  const awaitingSubCheck = authed === true && subVerified === null && !getStoredSubscription();
  const needsSubscription =
    !subscriptionDone &&
    authed === true &&
    (subVerified === false || (subVerified === null && !getStoredSubscription()));

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

  return <AppRoutes />;
}
