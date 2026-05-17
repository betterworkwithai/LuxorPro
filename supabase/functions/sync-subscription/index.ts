import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Stripe from "npm:stripe@17"

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

  const stripeKey   = Deno.env.get('STRIPE_SECRET_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!stripeKey || !supabaseUrl || !serviceKey) {
    return json({ error: 'Server configuration error' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const stripe   = new Stripe(stripeKey)

  // Verify user JWT
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  console.log('[sync-subscription] syncing for user', user.id)

  // Get stripe_customer_id from profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  let customerId = profile?.stripe_customer_id as string | undefined

  if (!customerId) {
    // Buy button flow: customer wasn't pre-linked — find by email
    console.log('[sync-subscription] no stripe_customer_id, searching by email:', user.email)
    const customers = await stripe.customers.search({
      query: `email:"${user.email}"`,
      limit: 1,
    })
    if (customers.data.length === 0) {
      console.log('[sync-subscription] no Stripe customer found for email')
      return json({ synced: false, reason: 'no_customer' })
    }
    customerId = customers.data[0].id
    // Save it for future lookups
    await supabase.from('profiles').upsert({
      id:                 user.id,
      stripe_customer_id: customerId,
      updated_at:         new Date().toISOString(),
    })
    console.log('[sync-subscription] found and linked customer', customerId)
  }

  try {
    // Check active/trialing subscriptions first
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status:   'all',
      limit:    1,
    })

    if (subscriptions.data.length > 0) {
      const sub     = subscriptions.data[0]
      const priceId = sub.items.data[0]?.price?.id
      let plan      = 'unknown'
      if (priceId === Deno.env.get('STRIPE_PRICE_ID_MONTHLY'))  plan = 'monthly'
      else if (priceId === Deno.env.get('STRIPE_PRICE_ID_ANNUAL'))   plan = 'annual'
      else if (priceId === Deno.env.get('STRIPE_PRICE_ID_LIFETIME')) plan = 'lifetime'

      await supabase.from('profiles').upsert({
        id:                              user.id,
        subscription_status:             sub.status,
        subscription_plan:               plan,
        subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        trial_end:           sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        cancel_at_period_end: sub.cancel_at_period_end,
        updated_at:          new Date().toISOString(),
      })

      console.log('[sync-subscription] synced subscription', sub.status, plan)
      return json({ synced: true, status: sub.status, plan })
    }

    // No subscription — check for one-time lifetime payment
    const payments = await stripe.paymentIntents.list({
      customer: customerId,
      limit:    5,
    })

    const paid = payments.data.find(pi => pi.status === 'succeeded')
    if (paid) {
      await supabase.from('profiles').upsert({
        id:                  user.id,
        subscription_status: 'active',
        subscription_plan:   'lifetime',
        subscription_current_period_end: null,
        trial_end:           null,
        updated_at:          new Date().toISOString(),
      })

      console.log('[sync-subscription] synced lifetime payment')
      return json({ synced: true, status: 'active', plan: 'lifetime' })
    }

    console.log('[sync-subscription] no active payment found')
    return json({ synced: false, reason: 'no_active_payment' })

  } catch (err) {
    console.error('[sync-subscription] error:', err)
    return json({ error: 'Sync failed' }, 500)
  }
})
