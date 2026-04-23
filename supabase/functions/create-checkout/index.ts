// ─── Edge Function: create-checkout ──────────────────────────────────────────
//
// Creates a Stripe Checkout Session for the requested plan.
// Monthly and Annual plans include a 7-day free trial.
// Lifetime is a one-time payment (mode: 'payment').
//
// Required environment variables (set via `supabase secrets set`):
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_ID_MONTHLY
//   STRIPE_PRICE_ID_ANNUAL
//   STRIPE_PRICE_ID_LIFETIME
//   SUPABASE_URL              (auto-set by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY (auto-set by Supabase)
//
// Request body:
//   { plan: 'monthly'|'annual'|'lifetime', promoCode?: string,
//     successUrl?: string, cancelUrl?: string }

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Stripe from "npm:stripe@17"

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const PRICE_IDS: Record<string, string | undefined> = {
  monthly:  Deno.env.get('STRIPE_PRICE_ID_MONTHLY'),
  annual:   Deno.env.get('STRIPE_PRICE_ID_ANNUAL'),
  lifetime: Deno.env.get('STRIPE_PRICE_ID_LIFETIME'),
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return json({ error: 'Não autorizado' }, 401)

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return json({ error: 'Não autorizado' }, 401)

    // ── Parse body ───────────────────────────────────────────────────────────
    const { plan, promoCode, successUrl, cancelUrl } = await req.json()
    const priceId = PRICE_IDS[plan as string]
    if (!priceId) return json({ error: `Plano inválido: ${plan}` }, 400)

    const origin = req.headers.get('origin') ?? 'https://luxor.app'

    // ── Get or create Stripe Customer ────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    let customerId = profile?.stripe_customer_id as string | undefined
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
      await supabase.from('profiles').upsert({
        id: user.id,
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      })
    }

    // ── Build session params ─────────────────────────────────────────────────
    const isLifetime = plan === 'lifetime'

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer:             customerId,
      client_reference_id:  user.id,
      allow_promotion_codes: true,
      success_url: successUrl ?? `${origin}/?subscription_success=1&plan=${plan}`,
      cancel_url:  cancelUrl  ?? `${origin}/?checkout_canceled=1`,
      line_items:  [{ price: priceId, quantity: 1 }],
      mode:        isLifetime ? 'payment' : 'subscription',
      locale:      'pt-BR',
    }

    if (!isLifetime) {
      sessionParams.subscription_data = {
        // Only Annual includes a 7-day free trial; Monthly charges immediately
        ...(plan === 'annual' ? { trial_period_days: 7 } : {}),
        metadata: { plan },
      }
    }

    // ── Apply promo code if provided ─────────────────────────────────────────
    if (promoCode) {
      try {
        const promos = await stripe.promotionCodes.list({
          code:   promoCode,
          active: true,
          limit:  1,
        })
        if (promos.data.length > 0) {
          sessionParams.discounts = [{ promotion_code: promos.data[0].id }]
          delete sessionParams.allow_promotion_codes
        }
      } catch { /* ignore — promo lookup failure is non-fatal */ }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)
    return json({ url: session.url })

  } catch (err) {
    console.error('[create-checkout]', err)
    return json({ error: 'Erro interno do servidor' }, 500)
  }
})
