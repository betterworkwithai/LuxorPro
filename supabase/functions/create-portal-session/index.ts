// ─── Edge Function: create-portal-session ────────────────────────────────────
//
// Returns a Stripe Billing Portal URL so the user can manage their subscription
// (cancel, update payment method, view invoices) without leaving Luxor.
//
// Required environment variables:
//   STRIPE_SECRET_KEY
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-set)

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

    // ── Look up Stripe customer ───────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (!profile?.stripe_customer_id) {
      return json({ error: 'Nenhuma assinatura Stripe encontrada para este usuário.' }, 404)
    }

    const origin = req.headers.get('origin') ?? 'https://luxor.app'

    const session = await stripe.billingPortal.sessions.create({
      customer:   profile.stripe_customer_id,
      return_url: origin,
    })

    return json({ url: session.url })

  } catch (err) {
    console.error('[create-portal-session]', err)
    return json({ error: 'Erro interno do servidor' }, 500)
  }
})
