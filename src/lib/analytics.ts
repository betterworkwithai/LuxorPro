// ─── Analytics: PostHog + Sentry ────────────────────────────────────────────
// Single integration point so the rest of the app calls `track('event', props)`
// without caring about which provider receives it.
//
// PostHog handles funnel events + product analytics.
// Sentry handles runtime errors + performance traces.
//
// Both are initialized at app startup (src/main.tsx). If env vars are missing
// (local dev without keys configured) the wrappers no-op silently — never
// throw, never break the app.

import posthog from 'posthog-js'
import * as Sentry from '@sentry/react'

const POSTHOG_KEY  = import.meta.env.VITE_POSTHOG_KEY  as string | undefined
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com'
const SENTRY_DSN   = import.meta.env.VITE_SENTRY_DSN   as string | undefined
const APP_ENV      = import.meta.env.MODE // 'development' | 'production'

let posthogReady = false
let sentryReady  = false

/** Initialize both providers. Safe to call once at startup. */
export function initAnalytics(): void {
  // ── PostHog ──────────────────────────────────────────────────────────────
  if (POSTHOG_KEY) {
    try {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        // Capture pageviews automatically; we manually track sub-events.
        capture_pageview: true,
        // Only emit verbose logs in dev so we can debug locally.
        loaded: (ph) => {
          posthogReady = true
          if (APP_ENV !== 'production') ph.debug(false)
        },
        // Disable session recording until we have explicit user consent (LGPD).
        disable_session_recording: true,
        // Bucket events by environment so dev signals don't pollute prod funnels.
        bootstrap: { distinctID: undefined, isIdentifiedID: false, featureFlags: {} },
        autocapture: {
          // Auto-capture clicks but not text content (privacy).
          dom_event_allowlist: ['click', 'change', 'submit'],
        },
        persistence: 'localStorage+cookie',
      })
      // Tag every event with the environment so we can filter prod from dev.
      posthog.register({ app_env: APP_ENV })
    } catch (e) {
      console.warn('[analytics] PostHog init failed:', e)
    }
  }

  // ── Sentry ───────────────────────────────────────────────────────────────
  if (SENTRY_DSN) {
    try {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: APP_ENV,
        // Only sample 10% of routine traces in prod to stay under the free
        // 5k errors/mo + 10k transactions/mo cap. Errors are always captured.
        tracesSampleRate: APP_ENV === 'production' ? 0.1 : 0.0,
        // Don't fingerprint IPs — keeps LGPD compliance simple.
        sendDefaultPii: false,
        // Filter out noisy errors that don't indicate real bugs.
        ignoreErrors: [
          'ResizeObserver loop limit exceeded',
          'Non-Error promise rejection captured',
          // Common Pluggy widget cancellation flow:
          'PluggyConnect',
        ],
        beforeSend(event, hint) {
          // Drop dev errors from prod telemetry stream.
          if (APP_ENV !== 'production') {
            console.warn('[Sentry] (dev) suppressed event:', hint?.originalException)
            return null
          }
          return event
        },
      })
      sentryReady = true
    } catch (e) {
      console.warn('[analytics] Sentry init failed:', e)
    }
  }
}

/**
 * Identify the current user across both providers. Call after login.
 * Pass only the user id + non-PII metadata (plan, suitability, etc.).
 */
export function identifyUser(userId: string, traits: Record<string, unknown> = {}): void {
  if (posthogReady) {
    try { posthog.identify(userId, traits) } catch (e) { console.warn('[analytics] identify failed', e) }
  }
  if (sentryReady) {
    try { Sentry.setUser({ id: userId }) } catch (e) { console.warn('[analytics] sentry user failed', e) }
  }
}

/** Reset analytics on logout. */
export function resetUser(): void {
  if (posthogReady) {
    try { posthog.reset() } catch { /* noop */ }
  }
  if (sentryReady) {
    try { Sentry.setUser(null) } catch { /* noop */ }
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
  | 'pyramid_calculator_submitted'   // for the future calculator route
  | 'pyramid_email_captured'
  // ── Onboarding funnel (4-step modal after signup) ──
  | 'onboarding_started'
  | 'onboarding_step_completed'      // emit with { step: 1..4, name: 'goal' | 'suitability' | 'data_source' | 'first_tx' }
  | 'onboarding_skipped'
  | 'onboarding_completed'

export function track(event: FunnelEvent | string, props: Record<string, unknown> = {}): void {
  if (!posthogReady) {
    if (APP_ENV !== 'production') console.log('[analytics:dev]', event, props)
    return
  }
  try {
    posthog.capture(event, props)
  } catch (e) {
    console.warn('[analytics] track failed', e)
  }
}

/** Manual error capture (for caught errors that we still want surfaced). */
export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  if (sentryReady) {
    try {
      Sentry.captureException(err, { extra: context })
    } catch { /* noop */ }
  } else {
    console.error('[captureError]', err, context)
  }
}

// Re-export Sentry's Error Boundary so callers can wrap routes if desired.
export const ErrorBoundary = Sentry.ErrorBoundary
