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

const SYSTEM_PROMPT = `Você é um assistente financeiro de elite processando faturas de cartão de crédito. Sua tarefa é extrair transações financeiras reais do texto bruto fornecido.

REGRAS ESTRITAS:
1. Ignore quadros de resumo, pagamentos de faturas anteriores, juros, limites de crédito e totais de categorias.
2. Uma transação válida DEVE conter uma data e um valor. NUNCA combine duas datas ou dois valores no mesmo objeto.
3. Antes de gerar o JSON, use a tag <thinking> para mapear linha por linha o texto e identificar quais linhas contêm transações reais.
4. Para cada transação, você deve incluir o campo 'linha_original' contendo o texto exato que você usou para extrair os dados. Se você não puder citar a linha exata, não crie a transação.

Regras de extração:
- Extraia APENAS lançamentos reais (compras, pagamentos, transferências, débitos, créditos)
- IGNORE: totais de fatura, pagamento mínimo, saldos, limites de crédito, mensagens informativas, IOF, encargos automáticos
- Para cartão de crédito: lançamentos são despesas (tipo: "despesa")
- Créditos na fatura (estornos, cashback, pagamentos recebidos) são receitas (tipo: "receita")
- Datas no formato YYYY-MM-DD
- Valores numéricos positivos, sem R$, sem ponto de milhar, com ponto decimal
- Parcelas: formato "NN/TT" quando visível, caso contrário null
- categoria_sugerida em português (ex: Alimentação, Transporte, Saúde, Streaming, Moradia, Lazer, Compras, Educação, Outros)

Responda com a tag <thinking> seguida APENAS de JSON válido, sem markdown adicional.`

const SPREADSHEET_SYSTEM_PROMPT = `Você é um assistente financeiro processando uma planilha (CSV/Excel) de transações exportada de um banco ou cartão de crédito.

CONTEXTO IMPORTANTE: O usuário exportou esses dados intencionalmente. Cada linha com data + descrição + valor é uma transação real que o usuário QUER importar. Não filtre nada por "ser ruído". Inclua TODAS as linhas válidas.

REGRAS:
1. A primeira linha geralmente é o cabeçalho (ex: "data,lançamento,valor" ou "Date,Description,Amount"). Use-o para mapear colunas.
2. Toda linha subsequente com data + descrição + valor é uma transação. INCLUA TODAS — incluindo IOF, taxas, parking, pequenos valores. O usuário quer ver tudo.
3. Convenção de sinal:
   - Valor POSITIVO = despesa (compra, débito, IOF, taxa). tipo: "despesa". valor: o número positivo.
   - Valor NEGATIVO = receita (pagamento recebido, estorno, crédito). tipo: "receita". valor: o número absoluto (positivo).
4. NUNCA inverta o sinal sem motivo. Se o valor é -2482.12, é uma receita de 2482.12.
5. Datas no formato YYYY-MM-DD (já vêm assim na maioria dos casos).
6. Para cada transação, inclua o campo 'linha_original' com o conteúdo exato da linha CSV.
7. categoria_sugerida em português: Alimentação, Transporte, Saúde, Streaming, Moradia, Lazer, Compras, Educação, Viagem, Impostos e Taxas, Pagamento, Outros.
   - IOF, taxas bancárias → "Impostos e Taxas"
   - Parking, pedágio, gasolina, Uber → "Transporte"
   - Pagamento recebido / estorno → "Pagamento"
   - Companhia aérea, hotel → "Viagem"

NÃO use a tag <thinking>. Responda APENAS com JSON válido, sem markdown.`

function userPrompt(text: string): string {
  return `Analise este documento financeiro e retorne o JSON estruturado:

${text}

Formato de resposta exato (após a tag <thinking>):
{
  "banco": "Nome do banco ou emissor",
  "mes_referencia": "Mês Ano (ex: Março 2026)",
  "total_fatura": 0.00,
  "transacoes": [
    {
      "data": "YYYY-MM-DD",
      "descricao": "Descrição completa do lançamento",
      "valor": 0.00,
      "parcela": "01/10",
      "tipo": "despesa",
      "categoria_sugerida": "Alimentação",
      "linha_original": "texto exato da linha fonte"
    }
  ]
}`
}

function spreadsheetUserPrompt(text: string): string {
  return `Esta é uma planilha CSV/Excel exportada. Inclua TODAS as linhas com data + descrição + valor. Use o sinal do valor para definir o tipo (positivo = despesa, negativo = receita).

${text}

Responda APENAS com JSON neste formato (sem <thinking>, sem markdown):
{
  "banco": "Nome do banco ou emissor (deduza do contexto, ou null)",
  "mes_referencia": "Mês mais frequente nas datas (ex: Março 2026)",
  "total_fatura": null,
  "transacoes": [
    {
      "data": "YYYY-MM-DD",
      "descricao": "texto da descrição",
      "valor": 0.00,
      "parcela": null,
      "tipo": "despesa",
      "categoria_sugerida": "Alimentação",
      "linha_original": "linha CSV original"
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
    const { text, format } = body
    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return json({ error: 'text é obrigatório e deve ter pelo menos 10 caracteres' }, 400)
    }

    const isSpreadsheet = format === 'spreadsheet'

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
        max_tokens: 8192,
        system:     isSpreadsheet ? SPREADSHEET_SYSTEM_PROMPT : SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: isSpreadsheet ? spreadsheetUserPrompt(text) : userPrompt(text),
        }],
      }),
    })

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text()
      console.error('[parse-invoice-ai] Anthropic HTTP error:', anthropicRes.status, errBody)
      return json({
        error: 'Falha ao chamar a API de IA',
        anthropic_status: anthropicRes.status,
        anthropic_body: errBody.slice(0, 1000),
      }, 502)
    }

    const anthropicData = await anthropicRes.json()
    const rawContent: string = anthropicData.content?.[0]?.text ?? ''

    console.log('[parse-invoice-ai] format:', format, '| raw response length:', rawContent.length,
      '| first 300 chars:', rawContent.slice(0, 300))

    // Strip <thinking>…</thinking> chain-of-thought block, then markdown fences,
    // then extract the first balanced { ... } block as JSON.
    let candidate = rawContent
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/```/g, '')
      .trim()

    const firstBrace = candidate.indexOf('{')
    const lastBrace  = candidate.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      candidate = candidate.slice(firstBrace, lastBrace + 1)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(candidate)
    } catch (e) {
      console.error('[parse-invoice-ai] JSON parse failed:', (e as Error).message)
      console.error('[parse-invoice-ai] Candidate (first 500):', candidate.slice(0, 500))
      console.error('[parse-invoice-ai] Raw (first 500):', rawContent.slice(0, 500))
      return json({ error: 'IA retornou resposta inválida — tente novamente' }, 502)
    }

    const txCount = (parsed as { transacoes?: unknown[] })?.transacoes?.length ?? 0
    console.log('[parse-invoice-ai] success — transacoes:', txCount)

    return json(parsed)

  } catch (err) {
    console.error('[parse-invoice-ai] unhandled error:', err)
    return json({ error: 'Erro interno do servidor' }, 500)
  }
})
