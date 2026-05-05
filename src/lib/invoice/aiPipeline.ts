// ─── AI-Powered Invoice Pipeline ─────────────────────────────────────────────
//
// 1. Extracts text from PDF (native pdfjs) or image (Tesseract OCR).
// 2. Sends extracted text to the `parse-invoice-ai` Supabase Edge Function,
//    which proxies the Anthropic API server-side.
// 3. Maps Claude's structured output to ParsedTransaction[].

import { nanoid } from 'nanoid'
import { detectNativeText } from './pdfNativeDetector'
import { extractRawText } from './pdfExtractor'
import { runOCROnPDF, runOCROnImage } from './ocrEngine'
import { extractSpreadsheetText, isSpreadsheet } from './spreadsheetExtractor'
import { autoCategorize } from './autoCategorize'
import { supabase } from '../supabase'
import { processInvoice } from './pipeline'
import type { ParsedTransaction, PipelineResult, PipelineOptions, InvoiceMetadata } from './types'

// ── Category mapping: Claude's Portuguese label → app category ID ────────────

const AI_CAT_MAP: [string, string][] = [
  ['alimentaç',   'alimentacao'],
  ['restaurante', 'alimentacao'],
  ['supermercado','alimentacao'],
  ['mercado',     'alimentacao'],
  ['delivery',    'alimentacao'],
  ['lanche',      'alimentacao'],
  ['transporte',  'transporte'],
  ['combustív',   'transporte'],
  ['gasolina',    'transporte'],
  ['uber',        'transporte'],
  ['taxi',        'transporte'],
  ['ônibus',      'transporte'],
  ['pedágio',     'transporte'],
  ['streaming',   'streaming'],
  ['entretenim',  'streaming'],
  ['assinatura',  'streaming'],
  ['lazer',       'streaming'],
  ['software',    'software'],
  ['tecnologia',  'software'],
  ['cloud',       'software'],
  ['saúde',       'saude'],
  ['farmácia',    'saude'],
  ['farmacia',    'saude'],
  ['academia',    'saude'],
  ['médico',      'saude'],
  ['hospital',    'saude'],
  ['educaç',      'educacao'],
  ['curso',       'educacao'],
  ['escola',      'educacao'],
  ['moradia',     'moradia'],
  ['aluguel',     'moradia'],
  ['condomín',    'moradia'],
  ['utilidade',   'moradia'],
  ['energia',     'moradia'],
  ['investimento','investimento'],
  ['dividendo',   'dividends'],
  ['rendimento',  'dividends'],
  ['salário',     'salary'],
  ['salario',     'salary'],
  ['freelance',   'freelance'],
  ['pix receb',   'pix_in'],
]

function mapCategory(aiCat: string, desc: string, type: 'expense' | 'income'): string {
  const lower = (aiCat ?? '').toLowerCase()
  for (const [key, val] of AI_CAT_MAP) {
    if (lower.includes(key)) return val
  }
  // Fall back to keyword matching on the description
  const auto = autoCategorize(desc)
  if (auto.type === type) return auto.category
  return type === 'income' ? 'other_income' : 'outros'
}

function parseDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw          // already ISO
  const m = raw?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)    // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return new Date().toISOString().slice(0, 10)
}

// ── Main AI pipeline ──────────────────────────────────────────────────────────

export async function processInvoiceAI(
  file: File,
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const { defaultAccount = 'Cartão', onProgress } = opts

  const isPDF   = file.type === 'application/pdf'
  const isImage = file.type.startsWith('image/')
  const isSheet = isSpreadsheet(file)

  let rawText  = ''
  let usedOCR  = false
  let nativeTextResult = { hasNativeText: false, confidence: 0, pagesWithText: 0, totalTextItems: 0 }

  // ── 1. Text extraction ───────────────────────────────────────────────────
  onProgress?.('Extraindo texto do documento', 10)

  if (isSheet) {
    onProgress?.('Lendo planilha', 20)
    rawText = await extractSpreadsheetText(file)
    onProgress?.('Planilha convertida', 50)
  } else if (isPDF) {
    nativeTextResult = await detectNativeText(file)
    if (nativeTextResult.hasNativeText) {
      rawText = await extractRawText(file)
    } else {
      usedOCR = true
      onProgress?.('Executando OCR', 20)
      const ocrResult = await runOCROnPDF(file, p => onProgress?.('OCR em andamento', 20 + p * 0.35))
      rawText = ocrResult.text
    }
  } else if (isImage) {
    usedOCR = true
    const ocrResult = await runOCROnImage(file, p => onProgress?.('OCR em imagem', 10 + p * 0.4))
    rawText = ocrResult.text
  }

  const noText: PipelineResult = {
    transactions: [],
    metadata: {},
    usedOCR,
    nativeTextResult,
    logs: [{ step: 'extraction', message: 'Nenhum texto extraído do documento', level: 'error' }],
  }

  if (!rawText.trim()) return noText

  // ── 2. Call AI edge function ─────────────────────────────────────────────
  onProgress?.('Analisando com Claude AI…', 60)

  const { data, error } = await supabase.functions.invoke('parse-invoice-ai', {
    body: { text: rawText, format: isSheet ? 'spreadsheet' : 'document' },
  })

  let result: PipelineResult

  if (error || !data || !data.transacoes) {
    // Edge function not available — fall back to the regex-based pipeline
    console.warn('[aiPipeline] AI unavailable, falling back to regex pipeline:', error?.message)
    result = await processInvoice(file, opts)
  } else {
    // ── 3. Map to ParsedTransaction[] ─────────────────────────────────────
    onProgress?.('Processando resultados', 88)

    const metadata: InvoiceMetadata = {
      issuer:      data.banco           ?? undefined,
      period:      data.mes_referencia  ?? undefined,
      totalAmount: typeof data.total_fatura === 'number' ? data.total_fatura : undefined,
    }

    const transactions: ParsedTransaction[] = (data.transacoes ?? [])
      .filter((t: any) => t.descricao && typeof t.valor === 'number' && t.valor > 0)
      .map((t: any): ParsedTransaction => {
        const type: 'expense' | 'income' = t.tipo === 'receita' ? 'income' : 'expense'
        return {
          id:           nanoid(),
          date:         parseDate(t.data ?? ''),
          merchant:     String(t.descricao),
          amount:       Number(t.valor),
          installment:  t.parcela && t.parcela !== 'null' ? String(t.parcela) : undefined,
          type,
          category:     mapCategory(t.categoria_sugerida ?? '', t.descricao, type),
          rawText:      String(t.descricao),
          confidence:   0.88,
          sourcePage:   1,
          sourceLine:   String(t.descricao),
          selected:     true,
          account:      defaultAccount,
          linhaOriginal: t.linha_original ?? undefined,
        }
      })

    result = {
      transactions,
      metadata,
      usedOCR,
      nativeTextResult,
      issuerDetected: data.banco ?? undefined,
      logs: [
        { step: 'ai', message: `Claude extraiu ${transactions.length} lançamento(s)`, level: 'info' },
        ...(usedOCR ? [{ step: 'ocr', message: 'Texto extraído via OCR — revise com atenção', level: 'warn' as const }] : []),
      ],
    }
  }

  /* AUTO-BALANCE DISABLED FOR DEBUGGING
     Re-enable once extraction is verified accurate — the mismatch is intentionally
     visible in the ReviewTable so totals can be compared against the real invoice.
  if (result.metadata.totalAmount != null && result.transactions.length > 0) {
    const invoiceTotal = result.metadata.totalAmount
    const expSum = Math.round(
      result.transactions
        .filter(t => t.type === 'expense')
        .reduce((s, t) => s + t.amount, 0) * 100,
    ) / 100
    const diff = Math.round((invoiceTotal - expSum) * 100) / 100

    if (Math.abs(diff) > 0.01) {
      const refDate = result.transactions.find(t => t.type === 'expense')?.date
        ?? new Date().toISOString().slice(0, 10)
      result.transactions.push({
        id:         nanoid(),
        date:       refDate,
        merchant:   diff > 0 ? 'Outros lançamentos não detalhados' : 'Estorno / crédito na fatura',
        amount:     Math.abs(diff),
        type:       diff > 0 ? 'expense' : 'income',
        category:   diff > 0 ? 'outros' : 'other_income',
        rawText:    'ajuste automático',
        confidence: 0.6,
        sourcePage: 1,
        sourceLine: '',
        selected:   true,
        account:    defaultAccount,
      })
    }
  }
  */

  onProgress?.('Concluído', 100)
  return result
}
