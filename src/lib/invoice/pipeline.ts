// ─── Invoice Pipeline — Main Orchestrator ───────────────────────────────────
//
// Runs the full 13-step pipeline:
//   upload → detect native text → extract → reconstruct → classify
//   → detect issuer → parse → score → return result
//
// For payslips and investment statements, falls back to the legacy text-based
// parsers that work directly on raw strings (no spatial data needed).

import type { PipelineResult, PipelineOptions, PipelineLog } from './types'
import { detectNativeText } from './pdfNativeDetector'
import { extractTextItems, extractRawText } from './pdfExtractor'
import { runOCROnPDF, runOCROnImage } from './ocrEngine'
import { reconstructLines, linesFromRawText } from './layoutReconstructor'
import { classifyLines } from './lineClassifier'
import { extractMetadata } from './invoiceHeaderParser'
import { scoreTransactions } from './confidenceScorer'
import { selectParser } from './parsers/index'

// ── Legacy parsers (payslip + investment) ─────────────────────────────────
import { parsePayslipText } from './legacyParsers'

export async function processInvoice(
  file: File,
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const { defaultAccount = 'Cartão', onProgress } = opts
  const logs: PipelineLog[] = []
  const log = (step: string, message: string, level: PipelineLog['level'] = 'info') => {
    logs.push({ step, message, level })
    console.log(`[invoice/${step}] ${message}`)
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  onProgress?.('Analisando documento', 5)
  log('intake', `Arquivo recebido: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`)

  // ── Step 1: Determine file type ──────────────────────────────────────────
  const isPDF = file.type === 'application/pdf'
  const isImage = file.type.startsWith('image/')

  // ── Step 2: Native text detection (PDF only) ────────────────────────────
  let usedOCR = false
  let nativeTextResult = { hasNativeText: false, confidence: 0, pagesWithText: 0, totalTextItems: 0 }

  if (isPDF) {
    onProgress?.('Detectando texto nativo', 15)
    nativeTextResult = await detectNativeText(file)
    log('nativeDetector',
      `hasNativeText=${nativeTextResult.hasNativeText} ` +
      `confidence=${nativeTextResult.confidence.toFixed(2)} ` +
      `items=${nativeTextResult.totalTextItems}`,
    )
  }

  // ── Step 3: Extract raw text (for legacy parsers) ────────────────────────
  let rawText = ''

  if (isPDF && nativeTextResult.hasNativeText) {
    onProgress?.('Extraindo texto', 25)
    rawText = await extractRawText(file)
    log('pdfExtractor', `Raw text: ${rawText.length} chars`)
  } else if (isPDF) {
    onProgress?.('Executando OCR', 30)
    usedOCR = true
    const ocrResult = await runOCROnPDF(file, p => onProgress?.('OCR em andamento', 30 + p * 0.4))
    rawText = ocrResult.text
    log('ocrEngine', `OCR concluído — confiança média: ${ocrResult.confidence.toFixed(0)}%`, 'warn')
  } else if (isImage) {
    onProgress?.('Executando OCR em imagem', 30)
    usedOCR = true
    const ocrResult = await runOCROnImage(file, p => onProgress?.('OCR em imagem', 30 + p * 0.4))
    rawText = ocrResult.text
    log('ocrEngine', `Imagem OCR concluído — confiança: ${ocrResult.confidence.toFixed(0)}%`)
  }

  // ── Step 4: Try legacy parsers first (payslip / investment statement) ────
  onProgress?.('Analisando tipo de documento', 55)
  const legacyResult = parsePayslipText(rawText, defaultAccount)
  if (legacyResult.length > 0) {
    log('legacyParser', `Documento especial detectado — ${legacyResult.length} itens extraídos`)
    const metadata = extractMetadata([], rawText)
    const scored = scoreTransactions(legacyResult, metadata)
    onProgress?.('Concluído', 100)
    return {
      transactions: scored,
      metadata,
      usedOCR,
      nativeTextResult,
      issuerDetected: 'Folha de Pagamento',
      logs,
    }
  }

  // ── Step 5: Spatial extraction (PDF with native text) ───────────────────
  let lines: ReturnType<typeof classifyLines> = []

  if (isPDF && nativeTextResult.hasNativeText) {
    onProgress?.('Reconstruindo layout', 60)
    const pages = await extractTextItems(file)
    log('pdfExtractor', `Itens espaciais: ${pages.reduce((s, p) => s + p.length, 0)} em ${pages.length} página(s)`)

    const reconstructed = reconstructLines(pages)
    log('layoutReconstructor', `Linhas reconstruídas: ${reconstructed.length}`)

    lines = classifyLines(reconstructed)
  } else {
    // OCR / image path: no spatial data — use raw text lines
    onProgress?.('Classificando linhas', 65)
    const rawLines = linesFromRawText(rawText)
    lines = classifyLines(rawLines)
  }

  const txLines = lines.filter(l =>
    l.lineClass === 'transaction_expense' ||
    l.lineClass === 'transaction_credit' ||
    l.lineClass === 'installment',
  )
  const discardedCount = lines.length - txLines.length
  log('lineClassifier',
    `${lines.length} linhas total — ${txLines.length} transações — ${discardedCount} descartadas`,
  )

  // ── Step 6: Metadata extraction ──────────────────────────────────────────
  onProgress?.('Extraindo metadados', 70)
  const metadata = extractMetadata(lines, rawText)
  log('headerParser', `Emissor: ${metadata.issuer ?? 'desconhecido'} · Total: ${metadata.totalAmount ?? 'N/A'}`)

  // ── Step 7: Select bank parser ───────────────────────────────────────────
  onProgress?.('Selecionando parser', 75)
  const parser = selectParser(rawText)
  log('parserStrategy', `Parser selecionado: ${parser.name}`)

  // ── Step 8: Parse transactions ───────────────────────────────────────────
  onProgress?.('Extraindo lançamentos', 80)
  const parsed = parser.parse(lines, rawText, currentYear, currentMonth, defaultAccount)
  log('transactionParser', `Lançamentos extraídos: ${parsed.length}`)

  // ── Step 9: Confidence scoring ───────────────────────────────────────────
  onProgress?.('Calculando confiança', 90)
  const scored = scoreTransactions(parsed, metadata)
  const avgConf = scored.length > 0
    ? (scored.reduce((s, t) => s + t.confidence, 0) / scored.length).toFixed(2)
    : 'N/A'
  log('confidenceScorer', `Confiança média: ${avgConf}`)

  onProgress?.('Concluído', 100)
  log('pipeline', `Pipeline finalizado — ${scored.length} lançamentos válidos`)

  return {
    transactions: scored,
    metadata,
    usedOCR,
    nativeTextResult,
    issuerDetected: metadata.issuer ?? parser.name,
    logs,
  }
}
