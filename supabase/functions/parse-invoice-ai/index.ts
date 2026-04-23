// ─── Edge Function: parse-invoice-ai ─────────────────────────────────────────
//
// Server-side proxy for the Anthropic API — keeps ANTHROPIC_API_KEY secret.
// Accepts:  { text: string }
// Returns:  { banco, mes_referencia, total_fatura, transacoes: [...] }
//
// Required env vars (set via `supabase secrets set`):
//   ANTHROPIC_API_KEY
//   SUPABASE_URL              (auto-set by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY (auto-set by Supabase)

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

const SYSTEM_PROMPT = `Você é um especialista em análise de faturas e extratos bancários brasileiros.
Analise o texto extraído de um documento financeiro e retorne um JSON estruturado.

Regras importantes:
- Extraia APENAS lançamentos reais (compras, pagamentos, transferências, débitos, créditos)
- IGNORE totalmente: totais de fatura, pagamento mínimo, saldos, limites de crédito, mensagens informativas, IOF, encargos automáticos da fatura
- Para cartão de crédito: lançamentos são despesas (tipo: "despesa")
- Créditos na fatura (estornos, cashback, pagamentos recebidos) são receitas (tipo: "receita")
- Datas devem estar no formato DD/MM/YYYY
- Valores devem ser numéricos positivos, sem R$, sem ponto de milhar, com ponto decimal
- Parcelas: extraia no formato "NN/TT" quando visível, caso contrário use null
- categoria_sugerida deve ser em português e indicar o tipo de gasto (ex: Alimentação, Transporte, Saúde, Streaming, Moradia, Lazer, Compras, Educação, Outros)
Responda APENAS com JSON válido, sem markdown, sem texto adicional.`

function userPrompt(text: string): string {
  return `Analise este documento financeiro e retorne o JSON estruturado:

${text.slice(0, 14000)}

Formato de resposta exato:
{
  "banco": "Nome do banco ou emissor",
  "mes_referencia": "Mês Ano (ex: Março 2026)",
  "total_fatura": 0.00,
  "transacoes": [
    {
      "data": "DD/MM/YYYY",
      "descricao": "Descrição completa do lançamento",
      "valor": 0.00,
      "parcela": "01/10",
      "tipo": "despesa",
      "categoria_sugerida": "Alimentação"
    }
  ]
}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return json({ error: 'Não autorizado' }, 401)

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return json({ error: 'Não autorizado' }, 401)

    // ── Parse body ───────────────────────────────────────────────────────────
    const body = await req.json()
    const { text } = body
    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return json({ error: 'text é obrigatório e deve ter pelo menos 10 caracteres' }, 400)
    }

    // ── Call Anthropic API ───────────────────────────────────────────────────
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY não configurado no servidor' }, 500)

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system:     SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt(text) }],
      }),
    })

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text()
      console.error('[parse-invoice-ai] Anthropic HTTP error:', anthropicRes.status, errBody)
      return json({ error: 'Falha ao chamar a API de IA' }, 502)
    }

    const anthropicData = await anthropicRes.json()
    const rawContent: string = anthropicData.content?.[0]?.text ?? ''

    // Strip markdown fences the model occasionally adds
    const jsonStr = rawContent
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/\s*```\s*$/im, '')
      .trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error('[parse-invoice-ai] JSON parse failed. Raw:', rawContent.slice(0, 300))
      return json({ error: 'IA retornou resposta inválida — tente novamente' }, 502)
    }

    return json(parsed)

  } catch (err) {
    console.error('[parse-invoice-ai] unhandled error:', err)
    return json({ error: 'Erro interno do servidor' }, 500)
  }
})
