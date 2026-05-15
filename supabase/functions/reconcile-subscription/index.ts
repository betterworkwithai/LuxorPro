// ─── Edge Function: reconcile-subscription ──────────────────────────────────
//
// Server-side recovery path for users whose `profiles` row is out-of-sync
// with reality. Queries Stripe directly for the authenticated user's
// current subscription status, then writes the truth back to `profiles`.
//
// When it fires:
//   1. Frontend calls it right after returning from Stripe with
//      `?subscription_success=1` — front-runs the webhook so the user
//      isn't gambling on webhook latency.
//   2. Frontend calls it on login when the gate would otherwise block
//      a user who has a `stored_subscription` marker locally — last
//      line of defense against webhook failures.
//   3. Admin can call it manually for a stuck user via SQL/script.
//
// Auth: requires a valid Supabase JWT in the Authorization header.
//   The user_id is taken from the token, not from the body, so a user
//   can only reconcile THEIR OWN account.
//
// Required env:
//   STRIPE_SECRET_KEY
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
//
// Endpoint:
//   POST /functions/v1/reconcile-subscription
//   body: {} (no params — user id comes from JWT)
// ─────────────────────────────────────────────────────────────────────────────
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Stripe from "npm:stripe@17"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function inferPlan(priceId: string | undefined): string {
  if (!priceId) return 'unknown'
  if (priceId === Deno.env.get('STRIPE_PRICE_ID_MONTHLY'))  return 'monthly'
  if (priceId === Deno.env.get('STRIPE_PRICE_ID_ANNUAL'))   return 'annual'
  if (priceId === Deno.env.get('STRIPE_PRICE_ID_LIFETIME')) return 'lifetime'
  return 'unknown'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── Auth: extract user_id from the JWT ────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '').trim()
    if (!jwt) return json({ error: 'missing auth token' }, 401)

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userData?.user) {
      return json({ error: 'invalid token: ' + (userErr?.message ?? 'no user') }, 401)
    }
    const userId = userData.user.id
    const userEmail = userData.user.email

    // ── Pull current profile (need stripe_customer_id if it exists) ───────
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, subscription_status, subscription_plan')
      .eq('id', userId)
      .maybeSingle()

    // ── Resolve the Stripe customer for this user ─────────────────────────
    // Priority chain:
    //   1. profile.stripe_customer_id (already linked)
    //   2. Search Stripe by email — handles Payment Link flows where the
    //      checkout.session.completed webhook didn't fire/wasn't linked.
    let customerId: string | null = profile?.stripe_customer_id ?? null

    if (!customerId && userEmail) {
      const search = await stripe.customers.list({ email: userEmail, limit: 5 })
      // Pick the most recently created customer matching this email.
      if (search.data.length > 0) {
        customerId = search.data
          .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0].id
      }
    }

    if (!customerId) {
      // No Stripe customer at all — user genuinely has no purchase history.
      return json({
        status: 'no_customer',
        message: 'Nenhum cliente Stripe encontrado para este email.',
        profile: profile ?? null,
      })
    }

    // ── Look at recent activity for this customer in Stripe ───────────────
    // Subscriptions first (monthly + annual), then one-time payments.
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 5,
      expand: ['data.items.data.price'],
    })

    // Find any active / trialing / past_due subscription (any non-canceled).
    const liveSub = subs.data.find(s =>
      s.status === 'active' || s.status === 'trialing' || s.status === 'past_due',
    ) ?? subs.data[0]

    if (liveSub) {
      const priceId = liveSub.items.data[0]?.price?.id
      const plan    = (liveSub.metadata?.plan as string | undefined) ?? inferPlan(priceId)
      const update = {
        id: userId,
        stripe_customer_id: customerId,
        subscription_status:             liveSub.status,
        subscription_plan:               plan,
        subscription_current_period_end: new Date(liveSub.current_period_end * 1000).toISOString(),
        trial_end:           liveSub.trial_end ? new Date(liveSub.trial_end * 1000).toISOString() : null,
        cancel_at_period_end: liveSub.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      }
      const { error: upErr } = await supabase.from('profiles').upsert(update)
      if (upErr) return json({ error: 'profile upsert failed: ' + upErr.message }, 500)

      return json({
        status: 'reconciled',
        source: 'subscription',
        active: ['active', 'trialing'].includes(liveSub.status),
        plan,
        subscription_status: liveSub.status,
        current_period_end: update.subscription_current_period_end,
      })
    }

    // No subscription — check for a one-time payment (lifetime).
    const charges = await stripe.charges.list({
      customer: customerId,
      limit: 10,
    })
    const successfulCharge = charges.data.find(c => c.status === 'succeeded' && c.paid && !c.refunded)
    if (successfulCharge) {
      const update = {
        id: userId,
        stripe_customer_id: customerId,
        subscription_status: 'active',
        subscription_plan:   'lifetime',
        subscription_current_period_end: null,
        trial_end: null,
        updated_at: new Date().toISOString(),
      }
      const { error: upErr } = await supabase.from('profiles').upsert(update)
      if (upErr) return json({ error: 'profile upsert failed: ' + upErr.message }, 500)

      return json({
        status: 'reconciled',
        source: 'one_time_payment',
        active: true,
        plan: 'lifetime',
      })
    }

    // Customer exists but no live sub and no successful charge.
    // Link the customer regardless so future webhooks resolve.
    if (!profile?.stripe_customer_id) {
      await supabase.from('profiles').upsert({
        id: userId,
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      })
    }

    return json({
      status: 'no_active_subscription',
      message: 'Cliente Stripe encontrado mas sem assinatura ativa nem compra única.',
      stripe_customer_id: customerId,
    })
  } catch (err) {
    console.error('[reconcile-subscription]', err)
    return json({ error: (err as Error).message }, 500)
  }
})
