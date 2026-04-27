// ─── Edge Function: pluggy-webhook ────────────────────────────────────────────
//
// Receives Pluggy webhook events and stores them in pluggy_events so the
// browser can react via Supabase Realtime without polling.
//
// Pluggy webhook events:
//   item/created  — first sync completed after connection
//   item/updated  — background refresh finished (new transactions available)
//   item/error    — connection failed / needs re-authentication
//
// Flow:
//   1. Receive event { event, eventId, itemId }
//   2. Fetch the item from Pluggy API → gets clientUserId (= Supabase user.id)
//   3. Insert row into pluggy_events
//   4. Return 200 within 5 s (Pluggy retries on non-2XX)
//
// Required env vars:
//   PLUGGY_CLIENT_ID
//   PLUGGY_CLIENT_SECRET
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

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

async function getPluggyApiKey(): Promise<string> {
  const res = await fetch('https://api.pluggy.ai/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId:     Deno.env.get('PLUGGY_CLIENT_ID'),
      clientSecret: Deno.env.get('PLUGGY_CLIENT_SECRET'),
    }),
  })
  if (!res.ok) throw new Error(`Pluggy auth failed: ${res.status}`)
  const data = await res.json()
  return data.apiKey as string
}

async function getItemUserId(itemId: string, apiKey: string): Promise<string | null> {
  const res = await fetch(`https://api.pluggy.ai/items/${itemId}`, {
    headers: { 'X-API-KEY': apiKey },
  })
  if (!res.ok) {
    console.warn(`[pluggy-webhook] Could not fetch item ${itemId}: ${res.status}`)
    return null
  }
  const item = await res.json()
  return (item.clientUserId as string) ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405)

  // ── Must respond within 5 s — do heavy work after returning ────────────────
  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const eventType = payload.event as string
  const itemId    = payload.itemId as string
  const eventId   = payload.eventId as string | undefined

  if (!eventType || !itemId) {
    return json({ error: 'Missing event or itemId' }, 400)
  }

  // Acknowledge immediately — then process asynchronously so Pluggy
  // never times us out even if Pluggy's own API is slow.
  const processing = (async () => {
    try {
      const apiKey = await getPluggyApiKey()
      const userId = await getItemUserId(itemId, apiKey)

      if (!userId) {
        console.error(`[pluggy-webhook] No clientUserId for item ${itemId} — cannot route event`)
        return
      }

      const { error } = await supabase.from('pluggy_events').insert({
        user_id:    userId,
        item_id:    itemId,
        event_type: eventType,
        event_id:   eventId ?? null,
        payload,
      })

      if (error) {
        console.error('[pluggy-webhook] DB insert error:', error.message)
      } else {
        console.log(`[pluggy-webhook] Stored ${eventType} for user ${userId}, item ${itemId}`)
      }
    } catch (err) {
      console.error('[pluggy-webhook] processing error:', err)
    }
  })()

  // Don't await — Pluggy needs the 200 fast
  // Deno edge runtime keeps the process alive until the promise settles
  void processing

  return json({ received: true })
})
