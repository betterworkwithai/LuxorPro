// ─── Edge Function: cancel-subscription ──────────────────────────────────────
//
// Sets cancel_at_period_end = true on the user's active Stripe subscription.
// The user keeps access until the current period ends; the subscription won't renew.
//
// Required env vars: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Stripe from "npm:stripe@17"

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

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

    // ── Get Stripe customer ID ────────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, subscription_current_period_end')
      .eq('id', user.id)
      .single()

    if (!profile?.stripe_customer_id) {
      return json({ error: 'Nenhuma assinatura Stripe encontrada.' }, 404)
    }

    // ── Find active subscription ──────────────────────────────────────────────
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status:   'active',
      limit:    1,
    })

    const sub = subscriptions.data[0]
    if (!sub) {
      // Try trialing
      const trialing = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status:   'trialing',
        limit:    1,
      })
      const trialSub = trialing.data[0]
      if (!trialSub) return json({ error: 'Nenhuma assinatura ativa encontrada.' }, 404)

      await stripe.subscriptions.update(trialSub.id, { cancel_at_period_end: true })
      await supabase.from('profiles').update({ cancel_at_period_end: true }).eq('id', user.id)
      return json({ success: true, periodEnd: trialSub.current_period_end })
    }

    // ── Cancel at period end ──────────────────────────────────────────────────
    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true })

    await supabase
      .from('profiles')
      .update({ cancel_at_period_end: true })
      .eq('id', user.id)

    return json({ success: true, periodEnd: sub.current_period_end })

  } catch (err) {
    console.error('[cancel-subscription]', err)
    return json({ error: 'Erro interno do servidor' }, 500)
  }
})
