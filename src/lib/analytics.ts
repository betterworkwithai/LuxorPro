// ─── Analytics: PostHog + Sentry ────────────────────────────────────────────
// Single integration point so the rest of the app calls `track('event', props)`
// without caring about which provider receives it.
//
// PostHog handles funnel events + product analytics.
// Sentry handles runtime errors + performance traces.
//
// Both vendors are LAZY-LOADED via dynamic import() so they no longer ship in
// the landing's critical path (posthog-js alone is ~188 KB / 63 KB gzip; even
// gated by `if (POSTHOG_KEY)` the static import pulled it into the entry
// chunk). `initAnalytics()` kicks off the dynamic imports without blocking;
// any `track()` calls made before the import resolves are buffered and
// flushed once it does.
//
// If env vars are missing (local dev without keys configured) we never even
// attempt the dynamic import — the wrappers no-op silently.

const POSTHOG_KEY  = import.meta.env.VITE_POSTHOG_KEY  as string | undefined
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com'
const SENTRY_DSN   = import.meta.env.VITE_SENTRY_DSN   as string | undefined
const APP_ENV      = import.meta.env.MODE // 'development' | 'production'

// Loaded provider handles. Stay null until the dynamic import + init resolves.
// Using `any` deliberately — typing the runtime modules adds no safety here
// (the wrapper functions are the typed surface) and would force a static type
// import that some bundlers turn into a runtime import.
type PostHog = { capture: (e: string, p?: Record<string, unknown>) => void;
                 identify: (id: string, traits?: Record<string, unknown>) => void;
                 reset: () => void;
                 register: (props: Record<string, unknown>) => void } | null
type SentryNs = { captureException: (err: unknown, ctx?: Record<string, unknown>) => void;
                  setUser: (u: { id: string } | null) => void } | null

let ph: PostHog       = null
let sentry: SentryNs  = null

// Track() can be called before the lazy import has resolved (the user does
// something in the first second). Buffer those events and flush them once
// PostHog actually loads. Capped so a misconfigured env doesn't leak memory.
type QueuedEvent = { event: string; props: Record<string, unknown> }
const eventQueue: QueuedEvent[] = []
const QUEUE_MAX = 50

function schedule(fn: () => void) {
  // Run after the browser is idle so we never compete with first paint.
  // Falls back to setTimeout in browsers without requestIdleCallback (Safari).
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(fn, { timeout: 2000 })
  } else {
    setTimeout(fn, 1)
  }
}

/** Initialize both providers. Safe to call once at startup. Non-blocking. */
export function initAnalytics(): void {
  if (POSTHOG_KEY) schedule(loadPostHog)
  if (SENTRY_DSN)  schedule(loadSentry)
}

async function loadPostHog() {
  if (ph) return
  try {
    const mod = await import('posthog-js')
    const posthog = mod.default
    posthog.init(POSTHOG_KEY as string, {
      api_host: POSTHOG_HOST,
      capture_pageview: true,
      loaded: (instance) => {
        if (APP_ENV !== 'production') instance.debug(false)
      },
      disable_session_recording: true,
      bootstrap: { distinctID: undefined, isIdentifiedID: false, featureFlags: {} },
      autocapture: {
        dom_event_allowlist: ['click', 'change', 'submit'],
      },
      persistence: 'localStorage+cookie',
    })
    posthog.register({ app_env: APP_ENV })
    ph = posthog as unknown as Exclude<PostHog, null>
    // Flush any events that arrived before PostHog finished loading.
    while (eventQueue.length > 0) {
      const item = eventQueue.shift()!
      try { ph.capture(item.event, item.props) } catch { /* swallow */ }
    }
  } catch (e) {
    console.warn('[analytics] PostHog init failed:', e)
  }
}

async function loadSentry() {
  if (sentry) return
  try {
    const Sentry = await import('@sentry/react')
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: APP_ENV,
      tracesSampleRate: APP_ENV === 'production' ? 0.1 : 0.0,
      sendDefaultPii: false,
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        'PluggyConnect',
      ],
      beforeSend(event, hint) {
        if (APP_ENV !== 'production') {
          console.warn('[Sentry] (dev) suppressed event:', hint?.originalException)
          return null
        }
        return event
      },
    })
    sentry = Sentry as unknown as Exclude<SentryNs, null>
  } catch (e) {
    console.warn('[analytics] Sentry init failed:', e)
  }
}

/**
 * Identify the current user across both providers. Call after login.
 * Pass only the user id + non-PII metadata (plan, suitability, etc.).
 */
export function identifyUser(userId: string, traits: Record<string, unknown> = {}): void {
  if (ph) {
    try { ph.identify(userId, traits) } catch (e) { console.warn('[analytics] identify failed', e) }
  }
  if (sentry) {
    try { sentry.setUser({ id: userId }) } catch (e) { console.warn('[analytics] sentry user failed', e) }
  }
}

/** Reset analytics on logout. */
export function resetUser(): void {
  if (ph) {
    try { ph.reset() } catch { /* noop */ }
  }
  if (sentry) {
    try { sentry.setUser(null) } catch { /* noop */ }
  }
}

/**
 * Funnel-event tracker. The 5 canonical events in this codebase:
 *   • signup_completed         — Supabase auth callback fired with new user
 *   • trial_started            — first time the trial banner became active
 *   • first_pluggy_connect     — user finished a Pluggy item connection
 *   • first_transaction_added  — user has at least 1 Transaction in store
 *   • trial_to_paid            — Stripe checkout returned paid status
 *
 * Use these names exactly so the PostHog funnel works without alias mapping.
 */
export type FunnelEvent =
  | 'signup_completed'
  | 'trial_started'
  | 'first_pluggy_connect'
  | 'first_transaction_added'
  | 'trial_to_paid'
  | 'pyramid_calculator_submitted'
  | 'pyramid_email_captured'
  // ── Onboarding funnel (4-step modal after signup) ──
  | 'onboarding_started'
  | 'onboarding_step_completed'
  | 'onboarding_skipped'
  | 'onboarding_completed'

export function track(event: FunnelEvent | string, props: Record<string, unknown> = {}): void {
  if (!ph) {
    // Buffer until PostHog finishes loading. Drop oldest if we hit the cap.
    if (POSTHOG_KEY) {
      if (eventQueue.length >= QUEUE_MAX) eventQueue.shift()
      eventQueue.push({ event, props })
    } else if (APP_ENV !== 'production') {
      console.log('[analytics:dev]', event, props)
    }
    return
  }
  try {
    ph.capture(event, props)
  } catch (e) {
    console.warn('[analytics] track failed', e)
  }
}

/** Manual error capture (for caught errors that we still want surfaced). */
export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  if (sentry) {
    try { sentry.captureException(err, { extra: context }) } catch { /* noop */ }
  } else {
    console.error('[captureError]', err, context)
  }
}
