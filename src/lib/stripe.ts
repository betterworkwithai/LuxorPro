// ─── Stripe Configuration ───────────────────────────────────────────────────
//
// Checkout flow (primary):
//   Frontend calls createCheckoutSession() → invokes the create-checkout
//   Supabase Edge Function → returns a Stripe Checkout URL → redirect.
//
// Payment Link fallback (used when Supabase is not configured):
//   buildCheckoutUrl() constructs a buy.stripe.com URL directly.
//   Set the paymentLink values below + success URL to:
//   https://YOUR_DOMAIN/?subscription_success=1&plan=PLAN_ID
//
// Supabase secrets required:
//   STRIPE_SECRET_KEY, STRIPE_PRICE_ID_MONTHLY,
//   STRIPE_PRICE_ID_ANNUAL, STRIPE_PRICE_ID_LIFETIME
//   STRIPE_WEBHOOK_SECRET

export interface StripePlan {
  id: 'monthly' | 'annual' | 'lifetime'
  productId: string
  paymentLink: string          // ← replace with your buy.stripe.com/xxx URL
  price: number                // BRL
  pricePerMonth?: number       // for display only
  interval: 'month' | 'year' | 'once'
  label: string
  badge?: string
  savingsLabel?: string
  highlight?: boolean
}

export const STRIPE_PLANS: StripePlan[] = [
  {
    id: 'monthly',
    productId: 'prod_UO8IIpmtpEJAtL',
    paymentLink: 'https://buy.stripe.com/eVqbIV9EAa91c4navC3wQ03',
    price: 20,
    pricePerMonth: 20,
    interval: 'month',
    label: 'Mensal',
  },
  {
    id: 'lifetime',
    productId: 'prod_UO8KxcmOBy46Xq',
    paymentLink: 'https://buy.stripe.com/8x23cp6sodld3xR5bi3wQ01',
    price: 350,
    interval: 'once',
    label: 'Vitalício',
    badge: 'Mais Escolhido',
    highlight: true,
  },
  {
    id: 'annual',
    productId: 'prod_UO8JoR3CL1boBY',
    paymentLink: 'https://buy.stripe.com/fZu3cp3gc0yrb0j47e3wQ02',
    price: 200,
    pricePerMonth: 16.67,
    interval: 'year',
    label: 'Anual',
    savingsLabel: 'Economia de 17%',
  },
]

/** The Stripe promo code ID for friends & family free access. */
export const FRIENDS_PROMO_ID = 'promo_1TPMUs7wlgFuH3drQjfV0gcH'

/**
 * Build the redirect URL for a Stripe Payment Link.
 * Appends ?prefilled_promo_code=CODE if the user entered one.
 * Appends ?client_reference_id=USER_ID so you can link payments to users in webhooks.
 */
export function buildCheckoutUrl(plan: StripePlan, promoCode?: string, userId?: string): string {
  const url = new URL(plan.paymentLink)
  if (promoCode) url.searchParams.set('prefilled_promo_code', promoCode.trim().toUpperCase())
  if (userId)    url.searchParams.set('client_reference_id', userId)
  return url.toString()
}

// ─── Checkout Session (via Edge Function) ────────────────────────────────────

import { supabase } from './supabase'

/** Creates a Stripe Checkout Session via the create-checkout edge function. */
export async function createCheckoutSession(
  plan: StripePlan,
  promoCode?: string,
  _userId?: string,
): Promise<{ url: string } | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: {
        plan:       plan.id,
        promoCode:  promoCode || undefined,
        successUrl: `${window.location.origin}/app?subscription_success=1&plan=${plan.id}`,
        cancelUrl:  `${window.location.origin}/app?checkout_canceled=1`,
      },
    })
    if (error) return { error: error.message ?? 'Erro desconhecido' }
    return data as { url: string }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

/** Opens the Stripe Billing Portal so the user can manage their subscription. */
export async function createPortalSession(): Promise<{ url: string } | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('create-portal-session', {
      body: {},
    })
    if (error) return { error: error.message ?? 'Erro desconhecido' }
    return data as { url: string }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

/** Cancels the active subscription at period end (no immediate loss of access). */
export async function cancelSubscription(): Promise<{ success: true; periodEnd: number } | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('cancel-subscription', { body: {} })
    if (error) return { error: error.message ?? 'Erro desconhecido' }
    return data as { success: true; periodEnd: number }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Erro desconhecido' }
  }
}

/** Keys used to persist subscription status across sessions. */
export const SUBSCRIPTION_STORAGE_KEY = 'luxor_subscription'
export const NEW_USER_STORAGE_KEY     = 'luxor_new_user'

export function getStoredSubscription(): string | null {
  try { return localStorage.getItem(SUBSCRIPTION_STORAGE_KEY) } catch { return null }
}

export function setStoredSubscription(planId: string) {
  try { localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, planId) } catch {}
}

export function markNewUser() {
  try { localStorage.setItem(NEW_USER_STORAGE_KEY, '1') } catch {}
}

export function clearNewUser() {
  try { localStorage.removeItem(NEW_USER_STORAGE_KEY) } catch {}
}

export function isNewUser(): boolean {
  try { return localStorage.getItem(NEW_USER_STORAGE_KEY) === '1' } catch { return false }
}
