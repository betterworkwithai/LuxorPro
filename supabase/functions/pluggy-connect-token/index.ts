// ─── Edge Function: pluggy-connect-token ─────────────────────────────────────
//
// Creates a Pluggy Connect Token — a short-lived JWT that authorises the
// Pluggy Connect widget in the browser.  The real CLIENT_ID / CLIENT_SECRET
// never leave the server.
//
// Required env vars (set via `supabase secrets set`):
//   PLUGGY_CLIENT_ID
//   PLUGGY_CLIENT_SECRET
//   SUPABASE_URL              (auto-set)
//   SUPABASE_SERVICE_ROLE_KEY (auto-set)
//
// Request body:  { itemId?: string }   — pass itemId to update an existing connection
// Response:      { accessToken: string }

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return json({ error: 'Não autorizado' }, 401)

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return json({ error: 'Não autorizado' }, 401)

    const body = await req.json().catch(() => ({}))
    const { itemId } = body as { itemId?: string }

    const apiKey = await getPluggyApiKey()

    const payload: Record<string, unknown> = { clientUserId: user.id }
    if (itemId) payload.itemId = itemId

    const res = await fetch('https://api.pluggy.ai/connect_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[pluggy-connect-token] Pluggy error:', res.status, err)
      return json({ error: 'Falha ao criar token Pluggy' }, 502)
    }

    const data = await res.json()
    return json({ accessToken: data.accessToken })

  } catch (err) {
    console.error('[pluggy-connect-token] unhandled error:', err)
    return json({ error: 'Erro interno do servidor' }, 500)
  }
})
