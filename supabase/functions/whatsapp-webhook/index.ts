// Supabase Edge Function: whatsapp-webhook
// Receives messages from Meta Cloud API and parses them into Luxor Pro transactions.
//
// Required secrets (set via `supabase secrets set`):
//   WHATSAPP_TOKEN           – Meta API system user access token
//   WHATSAPP_PHONE_NUMBER_ID – Meta phone number ID
//   WHATSAPP_VERIFY_TOKEN    – arbitrary string used for webhook verification
//   ANTHROPIC_API_KEY        – Claude API key
//   SUPABASE_SERVICE_ROLE_KEY – already injected by Supabase runtime

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { nanoid } from 'https://esm.sh/nanoid@5'

const WHATSAPP_TOKEN        = Deno.env.get('WHATSAPP_TOKEN')!
const PHONE_NUMBER_ID       = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!
const VERIFY_TOKEN          = Deno.env.get('WHATSAPP_VERIFY_TOKEN')!
const ANTHROPIC_API_KEY     = Deno.env.get('ANTHROPIC_API_KEY')!
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

// Admin Supabase client — bypasses RLS so we can write to any user's data
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ─── Category list (mirrors src/lib/types.ts DEFAULT_CATEGORIES) ─────────────
const EXPENSE_CATEGORIES = [
  'alimentacao', 'saude', 'educacao', 'transporte', 'moradia', 'lazer',
  'viagem', 'streaming', 'software', 'boleto', 'pix_out', 'investimento',
  'imposto', 'outros',
]
const INCOME_CATEGORIES = [
  'salary', 'freelance', 'dividends', 'rent_income', 'pix_in', 'other_income',
]
const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]

// Category id → display name (Portuguese)
const CATEGORY_NAMES: Record<string, string> = {
  alimentacao: 'Alimentação', saude: 'Saúde', educacao: 'Educação',
  transporte: 'Transporte', moradia: 'Moradia', lazer: 'Lazer',
  viagem: 'Viagem', streaming: 'Streaming', software: 'Software/SaaS',
  boleto: 'Boleto', pix_out: 'PIX Enviado', investimento: 'Investimento',
  imposto: 'Impostos', outros: 'Outros',
  salary: 'Salário', freelance: 'Freelance', dividends: 'Dividendos',
  rent_income: 'Aluguel Recebido', pix_in: 'PIX Recebido', other_income: 'Outras Receitas',
}

// ─── Meta API helper ──────────────────────────────────────────────────────────
async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
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
        to,
        type: 'text',
        text: { body: text },
      }),
    },
  )
}

// ─── HMAC-SHA256 signature verification ──────────────────────────────────────
async function verifySignature(body: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader) return false
  const [algo, sig] = signatureHeader.split('=')
  if (algo !== 'sha256' || !sig) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WHATSAPP_TOKEN),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const expectedHex = Array.from(new Uint8Array(expected))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return expectedHex === sig
}

// ─── Claude NLP parser ────────────────────────────────────────────────────────
interface ParsedMessage {
  type: 'expense' | 'income' | 'investment' | 'query' | 'confirm' | 'cancel' | 'unknown'
  amount: number | null
  currency: 'BRL' | 'USD' | 'EUR'
  category: string | null
  description: string | null
  date: string | null  // ISO YYYY-MM-DD or null (means today)
}

async function parseMessage(text: string, todayISO: string): Promise<ParsedMessage> {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: `You are a financial data extractor for a Brazilian personal finance app called Luxor Pro.
The user will send a message in Portuguese (informal Brazilian). Extract the financial intent and return ONLY valid JSON with no markdown.

JSON schema:
{
  "type": "expense" | "income" | "investment" | "query" | "confirm" | "cancel" | "unknown",
  "amount": number | null,
  "currency": "BRL" | "USD" | "EUR",
  "category": one of [${ALL_CATEGORIES.join(', ')}] | null,
  "description": string | null,
  "date": "YYYY-MM-DD" | null
}

Rules:
- "expense": user paid/spent/bought something. Default category: "outros"
- "income": user received money. Default category: "other_income"
- "investment": user invested money (CDB, ações, tesouro, fundo, etc.)
- "query": user wants to see their balance, extract, goals, or help
- "confirm": user said sim / yes / ok / confirmar / isso
- "cancel": user said não / cancel / errei / volta
- "unknown": none of the above
- For amounts: extract the number in BRL unless user says USD/EUR
- For date: null means today (${todayISO}). "ontem" = yesterday. "semana passada" = 7 days ago. Always return ISO YYYY-MM-DD
- Match category from the list — pick the closest fit
- description: short 2-5 word summary of what the transaction was for

Examples:
"gastei 50 reais no mercado" → {"type":"expense","amount":50,"currency":"BRL","category":"alimentacao","description":"mercado","date":null}
"recebi meu salário de 8000 hoje" → {"type":"income","amount":8000,"currency":"BRL","category":"salary","description":"salário","date":null}
"investi 2000 em CDB no Nubank" → {"type":"investment","amount":2000,"currency":"BRL","category":"investimento","description":"CDB Nubank","date":null}
"sim" → {"type":"confirm","amount":null,"currency":"BRL","category":null,"description":null,"date":null}
"qual meu saldo?" → {"type":"query","amount":null,"currency":"BRL","category":null,"description":null,"date":null}`,
    messages: [{ role: 'user', content: text }],
  })

  try {
    const raw = (msg.content[0] as { type: string; text: string }).text.trim()
    return JSON.parse(raw) as ParsedMessage
  } catch {
    return { type: 'unknown', amount: null, currency: 'BRL', category: null, description: null, date: null }
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function formatDatePT(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Handle /command shortcuts ───────────────────────────────────────────────
async function handleCommand(
  command: string,
  userId: string,
  phone: string,
): Promise<string> {
  const cmd = command.toLowerCase().trim()

  if (cmd === '/ajuda' || cmd === '/help') {
    return `🤖 *Luxor Pro Bot*

Você pode enviar mensagens como:
• _"gastei 50 no mercado"_
• _"recebi 8000 de salário"_
• _"investi 1000 em CDB"_

*Comandos:*
/extrato — resumo do mês atual
/saldo — patrimônio total em investimentos
/metas — progresso das suas metas
/ajuda — esta mensagem`
  }

  if (cmd === '/extrato') {
    const month = new Date().toISOString().slice(0, 7) // YYYY-MM
    const { data: rows } = await supabaseAdmin
      .from('luxor_transactions')
      .select('data')
      .eq('user_id', userId)

    if (!rows || rows.length === 0) return '📊 Nenhuma transação encontrada para este mês.'

    const txs = rows
      .map((r: { data: unknown }) => r.data as { type: string; amount: number; date: string; currency?: string })
      .filter(tx => tx.date?.startsWith(month))

    const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount ?? 0), 0)
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount ?? 0), 0)
    const balance = income - expense

    return `📊 *Extrato — ${new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}*

💚 Receitas: *${formatBRL(income)}*
🔴 Despesas: *${formatBRL(expense)}*
${balance >= 0 ? '✅' : '⚠️'} Saldo: *${formatBRL(balance)}*`
  }

  if (cmd === '/saldo') {
    const { data: rows } = await supabaseAdmin
      .from('luxor_investments')
      .select('data')
      .eq('user_id', userId)

    if (!rows || rows.length === 0) return '📈 Nenhum investimento encontrado.'

    const total = rows.reduce((s: number, r: { data: unknown }) => {
      const inv = r.data as { currentPrice?: number; quantity?: number; avgCost?: number }
      const price = inv.currentPrice ?? inv.avgCost ?? 0
      const qty   = inv.quantity ?? 1
      return s + price * qty
    }, 0)

    return `📈 *Patrimônio em Investimentos*\n\nTotal: *${formatBRL(total)}*`
  }

  if (cmd === '/metas') {
    const { data: rows } = await supabaseAdmin
      .from('luxor_goals')
      .select('data')
      .eq('user_id', userId)

    if (!rows || rows.length === 0) return '🎯 Nenhuma meta cadastrada.'

    const lines = rows.slice(0, 5).map((r: { data: unknown }) => {
      const g = r.data as { name: string; targetAmount: number; currentAmount?: number }
      const pct = g.targetAmount > 0 ? Math.min(100, Math.round(((g.currentAmount ?? 0) / g.targetAmount) * 100)) : 0
      const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))
      return `${g.name}\n${bar} ${pct}%`
    })

    return `🎯 *Suas Metas*\n\n${lines.join('\n\n')}`
  }

  return ''  // not a known command
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  // ── GET: Meta webhook verification ──
  if (req.method === 'GET') {
    const url    = new URL(req.url)
    const mode   = url.searchParams.get('hub.mode')
    const token  = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  // ── POST: Incoming message ──
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const bodyText = await req.text()

  // Verify Meta HMAC signature
  const signature = req.headers.get('x-hub-signature-256')
  const valid = await verifySignature(bodyText, signature)
  if (!valid) {
    console.error('Invalid HMAC signature')
    return new Response('Forbidden', { status: 403 })
  }

  let payload: {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from: string
            type: string
            text?: { body: string }
          }>
        }
      }>
    }>
  }

  try {
    payload = JSON.parse(bodyText)
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // Extract message from Meta payload
  const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
  if (!message || message.type !== 'text' || !message.text?.body) {
    return new Response('OK', { status: 200 })
  }

  const phone   = message.from  // E.164 without "+"  e.g. "5511999999999"
  const phoneE164 = `+${phone}`
  const text    = message.text.body.trim()
  const today   = todayISO()

  // Look up linked Luxor Pro user
  const { data: linkRow } = await supabaseAdmin
    .from('whatsapp_links')
    .select('user_id, verified')
    .eq('phone_e164', phoneE164)
    .single()

  if (!linkRow || !linkRow.verified) {
    await sendWhatsAppMessage(phone,
      `👋 Olá! Para usar o Luxor Pro pelo WhatsApp, vincule seu número no app:\n\n` +
      `*Configurações → WhatsApp*\n\nAcesse em: https://luxorpro.com.br/app/settings`,
    )
    return new Response('OK', { status: 200 })
  }

  const userId = linkRow.user_id as string

  // ── Handle /commands ──
  if (text.startsWith('/')) {
    const reply = await handleCommand(text, userId, phone)
    if (reply) {
      await sendWhatsAppMessage(phone, reply)
      return new Response('OK', { status: 200 })
    }
    await sendWhatsAppMessage(phone, '❓ Comando não reconhecido. Envie */ajuda* para ver os comandos disponíveis.')
    return new Response('OK', { status: 200 })
  }

  // ── Check session state ──
  const { data: session } = await supabaseAdmin
    .from('whatsapp_sessions')
    .select('state, pending_json')
    .eq('phone_e164', phoneE164)
    .single()

  // Awaiting confirmation: user replies "sim" or "não"
  if (session?.state === 'awaiting_confirm') {
    const parsed = await parseMessage(text, today)

    if (parsed.type === 'confirm') {
      // Commit the pending transaction
      const pending = session.pending_json as {
        table: 'luxor_transactions' | 'luxor_investments'
        data: Record<string, unknown>
        confirmText: string
      }

      await supabaseAdmin.from(pending.table).upsert(
        { user_id: userId, client_id: (pending.data as { id: string }).id, data: pending.data },
        { onConflict: 'user_id,client_id' },
      )

      // Reset session
      await supabaseAdmin
        .from('whatsapp_sessions')
        .upsert({ phone_e164: phoneE164, state: 'idle', pending_json: null, updated_at: new Date().toISOString() })

      await sendWhatsAppMessage(phone, `✅ ${pending.confirmText} registrado no Luxor Pro!`)
      return new Response('OK', { status: 200 })
    }

    if (parsed.type === 'cancel') {
      await supabaseAdmin
        .from('whatsapp_sessions')
        .upsert({ phone_e164: phoneE164, state: 'idle', pending_json: null, updated_at: new Date().toISOString() })
      await sendWhatsAppMessage(phone, '❌ Cancelado. Pode enviar uma nova transação quando quiser.')
      return new Response('OK', { status: 200 })
    }

    // Not a confirm/cancel → treat as new transaction (fall through)
    await supabaseAdmin
      .from('whatsapp_sessions')
      .upsert({ phone_e164: phoneE164, state: 'idle', pending_json: null, updated_at: new Date().toISOString() })
  }

  // ── Parse new message via Claude ──
  const parsed = await parseMessage(text, today)

  if (parsed.type === 'confirm' || parsed.type === 'cancel') {
    await sendWhatsAppMessage(phone, '🤔 Não há nada pendente para confirmar. Envie uma despesa, receita ou investimento.')
    return new Response('OK', { status: 200 })
  }

  if (parsed.type === 'query') {
    // Route to extrato by default
    const reply = await handleCommand('/extrato', userId, phone)
    await sendWhatsAppMessage(phone, reply)
    return new Response('OK', { status: 200 })
  }

  if (parsed.type === 'unknown' || !parsed.amount) {
    await sendWhatsAppMessage(phone,
      `🤔 Não entendi. Tente algo como:\n\n` +
      `• _"gastei 50 no mercado"_\n` +
      `• _"recebi 8000 de salário"_\n` +
      `• _"investi 1000 em CDB"_\n\n` +
      `Ou envie */ajuda* para mais opções.`,
    )
    return new Response('OK', { status: 200 })
  }

  // ── Build the record ──
  const dateISO  = parsed.date ?? today
  const catId    = parsed.category ?? (parsed.type === 'income' ? 'other_income' : 'outros')
  const catName  = CATEGORY_NAMES[catId] ?? catId
  const amtStr   = formatBRL(parsed.amount)
  const dateStr  = formatDatePT(dateISO)
  const desc     = parsed.description ?? (parsed.type === 'income' ? 'Receita' : 'Despesa')

  let table: 'luxor_transactions' | 'luxor_investments' = 'luxor_transactions'
  let recordData: Record<string, unknown>
  let confirmText: string

  if (parsed.type === 'investment') {
    // Investments go into luxor_investments as a minimal record
    recordData = {
      id:           nanoid(),
      name:         desc,
      assetClass:   'Other',
      location:     'onshore',
      quantity:     1,
      avgCost:      parsed.amount,
      currentPrice: parsed.amount,
      currency:     parsed.currency ?? 'BRL',
      institution:  'WhatsApp Bot',
      purchaseDate: dateISO,
      createdAt:    new Date().toISOString(),
    }
    table       = 'luxor_investments'
    confirmText = `Investimento de *${amtStr}* — ${desc} (${dateStr})`
  } else {
    recordData = {
      id:          nanoid(),
      date:        dateISO,
      description: desc,
      category:    catId,
      amount:      parsed.amount,
      currency:    parsed.currency ?? 'BRL',
      type:        parsed.type,  // 'income' | 'expense'
      account:     'WhatsApp Bot',
      createdAt:   new Date().toISOString(),
    }
    table = 'luxor_transactions'
    const typeEmoji = parsed.type === 'income' ? '💚 Receita' : '🔴 Despesa'
    confirmText     = `${typeEmoji} de *${amtStr}* em *${catName}* (${dateStr})`
  }

  // Store as pending, ask for confirmation
  await supabaseAdmin
    .from('whatsapp_sessions')
    .upsert({
      phone_e164:  phoneE164,
      state:       'awaiting_confirm',
      pending_json: { table, data: recordData, confirmText },
      updated_at:  new Date().toISOString(),
    })

  const confirmMsg =
    `📝 Registrar:\n${confirmText}\n\nResponda *sim* para confirmar ou *não* para cancelar.`

  await sendWhatsAppMessage(phone, confirmMsg)
  return new Response('OK', { status: 200 })
})
