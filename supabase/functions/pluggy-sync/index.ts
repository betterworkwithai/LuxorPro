// ─── Edge Function: pluggy-sync ───────────────────────────────────────────────
//
// Fetches accounts, transactions (last 90 days) and investments for a connected
// Pluggy item and returns the raw Pluggy objects to the frontend for mapping.
//
// Required env vars:
//   PLUGGY_CLIENT_ID
//   PLUGGY_CLIENT_SECRET
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Request body:  { itemId: string }
// Response:      { item, accounts, transactions, investments }

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

async function pluggyGet(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`https://api.pluggy.ai${path}`, {
    headers: { 'X-API-KEY': apiKey },
  })
  if (!res.ok) throw new Error(`Pluggy GET ${path} failed: ${res.status}`)
  return res.json()
}

async function fetchAllTransactions(
  accountId: string,
  apiKey: string,
  from: string,
): Promise<unknown[]> {
  const results: unknown[] = []
  let page = 1
  // 500 per page * 20 pages = up to 10 000 tx/account — comfortably covers
  // YTD on a heavy credit card. The previous cap (5 pages * 100) silently
  // truncated long ranges to the first ~500 transactions.
  const PAGE_SIZE = 500
  const MAX_PAGES = 20

  while (page <= MAX_PAGES) {
    const data = await pluggyGet(
      `/transactions?accountId=${accountId}&from=${from}&pageSize=${PAGE_SIZE}&page=${page}`,
      apiKey,
    ) as { results?: unknown[]; totalPages?: number }

    results.push(...(data.results ?? []))
    if (!data.totalPages || page >= data.totalPages) break
    page++
  }

  return results
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return json({ error: 'Não autorizado' }, 401)

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return json({ error: 'Não autorizado' }, 401)

    const body = await req.json()
    const { itemId } = body as { itemId: string }
    if (!itemId) return json({ error: 'itemId é obrigatório' }, 400)

    const apiKey = await getPluggyApiKey()

    // Fetch item metadata
    const item = await pluggyGet(`/items/${itemId}`, apiKey)

    // Fetch accounts for this item
    const accountsData = await pluggyGet(`/accounts?itemId=${itemId}`, apiKey) as { results?: unknown[] }
    const accounts = accountsData.results ?? []

    // Fetch year-to-date transactions per account (Jan 1 of current year onward)
    const from = `${new Date().getFullYear()}-01-01`
    const transactionsByAccount: Record<string, unknown[]> = {}

    for (const acc of accounts as { id: string; type: string }[]) {
      if (acc.type === 'BANK' || acc.type === 'CREDIT') {
        transactionsByAccount[acc.id] = await fetchAllTransactions(acc.id, apiKey, from)
      }
    }

    const transactions = Object.values(transactionsByAccount).flat()

    // Fetch investments if this item has any investment accounts
    let investments: unknown[] = []
    try {
      const invData = await pluggyGet(`/investments?itemId=${itemId}`, apiKey) as { results?: unknown[] }
      investments = invData.results ?? []
    } catch {
      // Item may not have investments — ignore
    }

    return json({ item, accounts, transactions, investments })

  } catch (err) {
    console.error('[pluggy-sync] unhandled error:', err)
    return json({ error: 'Erro interno do servidor' }, 500)
  }
})
