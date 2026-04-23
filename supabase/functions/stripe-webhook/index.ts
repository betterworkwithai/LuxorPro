// ─── Edge Function: stripe-webhook ───────────────────────────────────────────
//
// Receives Stripe webhook events and syncs subscription state into
// the `profiles` table.
//
// Handled events:
//   checkout.session.completed        → lifetime purchase activation
//   customer.subscription.created     → new subscription (trial or active)
//   customer.subscription.updated     → plan change, renewal, status change
//   customer.subscription.deleted     → cancellation
//   invoice.payment_failed            → marks past_due
//
// Required environment variables:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
//   STRIPE_PRICE_ID_MONTHLY (used to infer plan from price ID)
//   STRIPE_PRICE_ID_ANNUAL
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-set)
//
// Register webhook endpoint in Stripe Dashboard:
//   https://<project-ref>.supabase.co/functions/v1/stripe-webhook

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Stripe from "npm:stripe@17"

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function upsertProfile(userId: string, fields: Record<string, unknown>) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...fields, updated_at: new Date().toISOString() })
  if (error) console.error('[stripe-webhook] upsert error:', error)
}

async function getUserIdFromCustomer(customerId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()
  return data?.id ?? null
}

function inferPlan(priceId: string | undefined): string {
  if (!priceId) return 'unknown'
  if (priceId === Deno.env.get('STRIPE_PRICE_ID_MONTHLY')) return 'monthly'
  if (priceId === Deno.env.get('STRIPE_PRICE_ID_ANNUAL'))  return 'annual'
  return 'unknown'
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    )
  } catch (err) {
    console.error('[stripe-webhook] signature error:', err)
    return new Response(`Webhook signature verification failed: ${err}`, { status: 400 })
  }

  console.log('[stripe-webhook] event:', event.type)

  try {
    switch (event.type) {

      // ── Checkout completed (lifetime one-time payment) ───────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'payment') break  // subscriptions handled below

        const userId = session.client_reference_id
        if (!userId) break

        await upsertProfile(userId, {
          subscription_status: 'active',
          subscription_plan:   'lifetime',
          subscription_current_period_end: null,
          trial_end: null,
        })
        break
      }

      // ── New or updated subscription ──────────────────────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub    = event.data.object as Stripe.Subscription
        const userId = await getUserIdFromCustomer(sub.customer as string)
        if (!userId) break

        const priceId = sub.items.data[0]?.price?.id
        const plan    = (sub.metadata?.plan as string | undefined) ?? inferPlan(priceId)

        await upsertProfile(userId, {
          subscription_status:             sub.status,
          subscription_plan:               plan,
          subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          trial_end:           sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          cancel_at_period_end: sub.cancel_at_period_end,
        })
        break
      }

      // ── Subscription canceled (at period end or immediately) ─────────────
      case 'customer.subscription.deleted': {
        const sub    = event.data.object as Stripe.Subscription
        const userId = await getUserIdFromCustomer(sub.customer as string)
        if (!userId) break

        await upsertProfile(userId, {
          subscription_status:             'canceled',
          subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          cancel_at_period_end:            false,
        })
        break
      }

      // ── Payment failed ───────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const userId  = await getUserIdFromCustomer(invoice.customer as string)
        if (!userId) break

        await upsertProfile(userId, { subscription_status: 'past_due' })
        break
      }
    }
  } catch (err) {
    console.error('[stripe-webhook] handler error:', err)
    return new Response('Internal Error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
