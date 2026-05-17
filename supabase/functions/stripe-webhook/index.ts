import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Stripe from "npm:stripe@17"

Deno.serve(async (req) => {
  console.log('[stripe-webhook] invoked', req.method)

  // ── Validate env vars upfront ────────────────────────────────────────────────
  const stripeKey     = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const supabaseUrl   = Deno.env.get('SUPABASE_URL')
  const serviceKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  console.log('[stripe-webhook] env check:', {
    hasStripeKey:     !!stripeKey,
    hasWebhookSecret: !!webhookSecret,
    hasSupabaseUrl:   !!supabaseUrl,
    hasServiceKey:    !!serviceKey,
  })

  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    console.error('[stripe-webhook] missing required env vars')
    return new Response('Server configuration error', { status: 500 })
  }

  const stripe   = new Stripe(stripeKey)
  const supabase = createClient(supabaseUrl, serviceKey)

  // ── Helpers ──────────────────────────────────────────────────────────────────

  async function upsertProfile(userId: string, fields: Record<string, unknown>) {
    console.log('[stripe-webhook] upsertProfile', userId, fields)
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, ...fields, updated_at: new Date().toISOString() })
    if (error) console.error('[stripe-webhook] upsert error:', error)
    else console.log('[stripe-webhook] upsert success for', userId)
  }

  async function getUserIdFromCustomer(customerId: string): Promise<string | null> {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .single()
    console.log('[stripe-webhook] getUserIdFromCustomer', customerId, '->', data?.id ?? 'not found')
    return data?.id ?? null
  }

  function inferPlan(priceId: string | undefined): string {
    if (!priceId) return 'unknown'
    if (priceId === Deno.env.get('STRIPE_PRICE_ID_MONTHLY'))  return 'monthly'
    if (priceId === Deno.env.get('STRIPE_PRICE_ID_ANNUAL'))   return 'annual'
    if (priceId === Deno.env.get('STRIPE_PRICE_ID_LIFETIME')) return 'lifetime'
    return 'unknown'
  }

  // ── Verify signature ─────────────────────────────────────────────────────────

  const body = await req.text()
  const sig  = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    )
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err)
    return new Response(`Webhook signature verification failed: ${err}`, { status: 400 })
  }

  console.log('[stripe-webhook] event type:', event.type, 'id:', event.id)

  // ── Handle events ────────────────────────────────────────────────────────────

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session  = event.data.object as Stripe.Checkout.Session
        const userId   = session.client_reference_id
        const customerId = typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id

        console.log('[stripe-webhook] checkout.session.completed', {
          userId, customerId, mode: session.mode,
        })

        if (!userId) {
          console.warn('[stripe-webhook] no client_reference_id — cannot identify user')
          break
        }

        // Link Stripe customer to user
        if (customerId) {
          await upsertProfile(userId, { stripe_customer_id: customerId })
        }

        if (session.mode === 'payment') {
          // Lifetime one-time payment
          await upsertProfile(userId, {
            subscription_status:             'active',
            subscription_plan:               'lifetime',
            subscription_current_period_end: null,
            trial_end:                       null,
          })
        } else if (session.mode === 'subscription' && session.subscription) {
          // Recurring subscription — fetch full sub to get status immediately
          try {
            const subId = typeof session.subscription === 'string'
              ? session.subscription : session.subscription.id
            const sub     = await stripe.subscriptions.retrieve(subId)
            const priceId = sub.items.data[0]?.price?.id
            const plan    = (sub.metadata?.plan as string | undefined) ?? inferPlan(priceId)
            await upsertProfile(userId, {
              subscription_status:             sub.status,
              subscription_plan:               plan,
              subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
              trial_end:           sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
              cancel_at_period_end: sub.cancel_at_period_end,
            })
          } catch (err) {
            console.error('[stripe-webhook] failed to retrieve subscription, using fallback:', err)
            await upsertProfile(userId, {
              subscription_status: 'active',
              subscription_plan:   'unknown',
            })
          }
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub    = event.data.object as Stripe.Subscription
        const userId = await getUserIdFromCustomer(sub.customer as string)
        if (!userId) {
          console.warn('[stripe-webhook] no user found for customer', sub.customer)
          break
        }

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

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const userId  = await getUserIdFromCustomer(invoice.customer as string)
        if (!userId) break

        await upsertProfile(userId, { subscription_status: 'past_due' })
        break
      }

      default:
        console.log('[stripe-webhook] unhandled event type:', event.type)
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
