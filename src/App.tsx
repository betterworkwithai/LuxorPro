import React, { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { PageLayout } from "./components/layout/PageLayout";
import { useStore } from "./store/useStore";
import { supabase, SUPABASE_CONFIGURED } from "./lib/supabase";
import { setActiveUser } from "./lib/db";
import Auth from "./pages/Auth";
import Subscription from "./pages/Subscription";
import { getStoredSubscription, setStoredSubscription } from "./lib/stripe";

import { OnboardingModal } from "./components/ui/OnboardingModal";
import Dashboard from "./pages/Dashboard";
import Cashflow from "./pages/Cashflow";
import Wealth from "./pages/Wealth";
import Goals from "./pages/Goals";

import DocumentAI from "./pages/DocumentAI";
import Settings from "./pages/Settings";
import FinancialTools from "./pages/FinancialTools";

// Key used to persist a local "logged in" flag when Supabase is not configured
export const LOCAL_AUTH_KEY = "gaara_local_auth";

function LoadingScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-[#0a0a0f]">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#00d4ff]/10 border border-[#00d4ff]/30 flex items-center justify-center mx-auto">
          <svg className="w-5 h-5 text-[#00d4ff] animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#e8e8f0]">Luxor</p>
          <p className="text-xs text-[#55556a]">Carregando seus dados financeiros…</p>
        </div>
      </div>
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
        <Route path="/settings" element={<Settings />} />
        <Route path="/tools" element={<FinancialTools />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
      <OnboardingModal />
    </PageLayout>
  );
}

export default function App() {
  const { init, isLoading } = useStore();
  const [authed, setAuthed] = useState<boolean | undefined>(undefined);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [subscriptionDone, setSubscriptionDone] = useState(false);
  const [showSubscription,  setShowSubscription]  = useState(false);
  // null = Supabase check pending, true = active, false = not active
  const [subVerified, setSubVerified] = useState<boolean | null>(null);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Luxor";
    return () => { document.title = prevTitle; };
  }, []);

  // SubscriptionGuard dispatches this event to open the subscription page
  // from anywhere in the app without prop drilling.
  useEffect(() => {
    const handler = () => setShowSubscription(true);
    window.addEventListener('luxor:show-subscription', handler);
    return () => window.removeEventListener('luxor:show-subscription', handler);
  }, []);

  // Verify subscription against Supabase profiles table.
  // This ensures returning subscribers on any device are let through,
  // and that canceled subscriptions are enforced even if localStorage is stale.
  useEffect(() => {
    if (!authed || !userId) { setSubVerified(null); return; }

    if (!SUPABASE_CONFIGURED) {
      setSubVerified(true);   // local mode — no paywall
      return;
    }

    supabase
      .from('profiles')
      .select('subscription_status, subscription_plan')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!data) {
          // No profile row yet — trust localStorage
          setSubVerified(!!getStoredSubscription());
          return;
        }
        const active =
          data.subscription_status === 'active' ||
          data.subscription_status === 'trialing';
        if (active && data.subscription_plan) {
          setStoredSubscription(data.subscription_plan as string);
        }
        setSubVerified(active);
      })
      .catch(() => {
        // Network/query error — fall back to localStorage
        setSubVerified(!!getStoredSubscription());
      });
  }, [authed, userId]);

  // Security: Force re-login when the user opens a fresh browser tab/session.
  // We use sessionStorage as a "tab is alive" marker. If it's missing on load,
  // the tab was just opened (or browser fully closed previously) -> sign out.
  const [sessionGateChecked, setSessionGateChecked] = useState(false);
  useEffect(() => {
    const TAB_MARKER = 'luxor_tab_session';
    const isFreshTab = !sessionStorage.getItem(TAB_MARKER);
    sessionStorage.setItem(TAB_MARKER, '1');

    // Don't wipe sessions when the URL carries a Supabase auth hash
    // (recovery, magic link, email confirmation, etc.) — doing so would
    // destroy the temporary session needed to complete the flow.
    const hash = window.location.hash || '';
    const hasAuthHash = /access_token=|type=recovery|type=magiclink|type=signup|type=invite|type=email_change/.test(hash);

    if (isFreshTab && !hasAuthHash) {
      // Clear any persisted Supabase auth tokens from localStorage
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('sb-') || k.startsWith('supabase.auth.'))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {
        // ignore
      }
      localStorage.removeItem(LOCAL_AUTH_KEY);
      // Sign out from Supabase to invalidate the in-memory session
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
      if (localAuth) {
        setActiveUser("local");
        setUserId("local");
        init();
      }
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
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

  // While waiting for Supabase to confirm subscription status and localStorage
  // is empty, show the loading screen instead of flashing the subscription page.
  const awaitingSubCheck = authed === true && subVerified === null && !getStoredSubscription();

  // Show subscription page when:
  //  • Supabase explicitly says not active (canceled / past_due / none), OR
  //  • Supabase check is still running but localStorage has no subscription
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
