// ─── Invoice Pipeline — Core Types ───────────────────────────────────────────

/** A single text fragment extracted from a PDF page, with spatial coordinates. */
export interface TextItem {
  text: string
  x: number
  y: number
  width: number
  height: number
  page: number
}

/** A reconstructed visual line assembled from one or more TextItems. */
export interface ReconstructedLine {
  text: string
  page: number
  y: number
  bbox: { x1: number; y1: number; x2: number; y2: number }
  items: TextItem[]
  /** 0–1 score reflecting spatial coherence of reconstructed items */
  coherenceScore: number
}

/** Semantic classification of a reconstructed line. */
export type LineClass =
  | 'header'
  | 'metadata'
  | 'transaction_expense'
  | 'transaction_credit'
  | 'installment'
  | 'invoice_total'
  | 'payment_minimum'
  | 'balance_info'
  | 'footer'
  | 'noise'

export interface ClassifiedLine extends ReconstructedLine {
  lineClass: LineClass
}

/** A parsed financial transaction candidate extracted from the invoice. */
export interface ParsedTransaction {
  id: string
  date: string           // ISO YYYY-MM-DD
  merchant: string
  amount: number         // always positive
  installment?: string   // e.g. "03/10"
  type: 'expense' | 'income'
  category: string
  rawText: string
  confidence: number     // 0–1
  sourcePage: number
  sourceLine: string
  selected: boolean
  account: string
  linhaOriginal?: string   // source line cited by Claude for grounding
}

/** Metadata extracted from the invoice header. */
export interface InvoiceMetadata {
  issuer?: string
  cardProduct?: string
  cardLastFour?: string
  dueDate?: string
  totalAmount?: number
  minPayment?: number
  creditLimit?: number
  period?: string
}

/** Result of native text detection pass. */
export interface NativeTextResult {
  hasNativeText: boolean
  confidence: number      // 0–1
  pagesWithText: number
  totalTextItems: number
}

export interface PipelineLog {
  step: string
  message: string
  level: 'info' | 'warn' | 'error'
}

/** Final result returned by the main pipeline. */
export interface PipelineResult {
  transactions: ParsedTransaction[]
  metadata: InvoiceMetadata
  usedOCR: boolean
  nativeTextResult: NativeTextResult
  issuerDetected?: string
  logs: PipelineLog[]
}

export interface PipelineOptions {
  defaultAccount?: string
  onProgress?: (step: string, pct: number) => void
}
