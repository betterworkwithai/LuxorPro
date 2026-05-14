// Supabase Edge Function: whatsapp-verify
// Called from the Luxor Pro Settings page to link/verify a WhatsApp phone number.
//
// POST /whatsapp-verify         { action: 'send', phone: '+5511999999999' }
//   → Generates a 6-digit code, stores it, sends it via WhatsApp
//
// POST /whatsapp-verify         { action: 'confirm', phone: '+5511999999999', code: '123456' }
//   → Verifies the code and marks the link as verified
//
// POST /whatsapp-verify         { action: 'unlink', phone: '+5511999999999' }
//   → Deletes the link for the authenticated user
//
// Requires: user JWT in Authorization header (standard Supabase auth)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WHATSAPP_TOKEN       = Deno.env.get('WHATSAPP_TOKEN')!
const PHONE_NUMBER_ID      = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  // `to` here is E.164 without "+", e.g. "5511999999999"
  const phone = to.startsWith('+') ? to.slice(1) : to
  await fetch(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: text },
      }),
    },
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Authenticate the caller
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const userId = user.id

  let body: { action: string; phone?: string; code?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Bad request' }, 400)
  }

  const { action, phone } = body

  if (!phone) return json({ error: 'phone is required' }, 400)

  // Normalize to E.164 (ensure leading +)
  const phoneE164 = phone.startsWith('+') ? phone : `+${phone}`

  // ── action: send ──────────────────────────────────────────────────────────
  if (action === 'send') {
    const code    = String(Math.floor(100000 + Math.random() * 900000))
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min

    await supabaseAdmin.from('whatsapp_links').upsert(
      {
        user_id:          userId,
        phone_e164:       phoneE164,
        verified:         false,
        verify_code:      code,
        verify_expires_at: expires,
      },
      { onConflict: 'phone_e164' },
    )

    await sendWhatsAppMessage(
      phoneE164,
      `🔐 *Luxor Pro* — Código de verificação: *${code}*\n\nVálido por 10 minutos. Não compartilhe com ninguém.`,
    )

    return json({ ok: true })
  }

  // ── action: confirm ───────────────────────────────────────────────────────
  if (action === 'confirm') {
    const { code } = body
    if (!code) return json({ error: 'code is required' }, 400)

    const { data: row } = await supabaseAdmin
      .from('whatsapp_links')
      .select('user_id, verify_code, verify_expires_at, verified')
      .eq('phone_e164', phoneE164)
      .single()

    if (!row) return json({ error: 'Phone not found. Please request a new code.' }, 404)
    if (row.user_id !== userId) return json({ error: 'Unauthorized' }, 403)
    if (row.verified) return json({ ok: true, already: true })

    const expired = row.verify_expires_at && new Date(row.verify_expires_at as string) < new Date()
    if (expired) return json({ error: 'Code expired. Please request a new one.' }, 400)

    if (row.verify_code !== code) return json({ error: 'Incorrect code.' }, 400)

    await supabaseAdmin
      .from('whatsapp_links')
      .update({ verified: true, verify_code: null, verify_expires_at: null })
      .eq('phone_e164', phoneE164)

    await sendWhatsAppMessage(
      phoneE164,
      `✅ *Luxor Pro* — Número vinculado com sucesso!\n\nAgora você pode registrar despesas, receitas e investimentos diretamente por aqui.\n\nEnvie */ajuda* para ver os comandos disponíveis.`,
    )

    return json({ ok: true })
  }

  // ── action: unlink ────────────────────────────────────────────────────────
  if (action === 'unlink') {
    await supabaseAdmin
      .from('whatsapp_links')
      .delete()
      .eq('phone_e164', phoneE164)
      .eq('user_id', userId)

    await supabaseAdmin
      .from('whatsapp_sessions')
      .delete()
      .eq('phone_e164', phoneE164)

    return json({ ok: true })
  }

  return json({ error: 'Unknown action' }, 400)
})
