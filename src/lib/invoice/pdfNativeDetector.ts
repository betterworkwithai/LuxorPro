// ─── Invoice Pipeline — Native PDF Text Detector ────────────────────────────
//
// Before attempting OCR, this module checks whether the PDF already contains
// usable native text. This prevents unnecessary OCR processing on digital PDFs.

import type { NativeTextResult } from './types'

/** Minimum text items per page to consider native text usable */
const MIN_ITEMS_PER_PAGE = 20
/** Minimum total characters across all pages */
const MIN_TOTAL_CHARS = 200
/** Minimum fraction of pages that must have text */
const MIN_PAGE_COVERAGE = 0.5

export async function detectNativeText(file: File): Promise<NativeTextResult> {
  const result: NativeTextResult = {
    hasNativeText: false,
    confidence: 0,
    pagesWithText: 0,
    totalTextItems: 0,
  }

  try {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href

    const buffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
    const numPages = pdf.numPages

    let totalItems = 0
    let totalChars = 0
    let pagesWithText = 0

    for (let p = 1; p <= Math.min(numPages, 10); p++) {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()
      const items = (content.items as any[]).filter(i => 'str' in i && i.str.trim().length > 0)
      const pageChars = items.reduce((s: number, i: any) => s + i.str.length, 0)

      totalItems += items.length
      totalChars += pageChars

      if (items.length >= MIN_ITEMS_PER_PAGE && pageChars >= 50) {
        pagesWithText++
      }
    }

    result.pagesWithText = pagesWithText
    result.totalTextItems = totalItems

    const pageCoverage = pagesWithText / Math.min(numPages, 10)
    const hasEnoughItems = totalItems >= MIN_ITEMS_PER_PAGE
    const hasEnoughChars = totalChars >= MIN_TOTAL_CHARS
    const hasPageCoverage = pageCoverage >= MIN_PAGE_COVERAGE

    // Confidence score: weighted combination of signals
    const score =
      (hasEnoughItems ? 0.35 : 0) +
      (hasEnoughChars ? 0.35 : 0) +
      (hasPageCoverage ? 0.30 : 0)

    result.confidence = score
    result.hasNativeText = score >= 0.5
  } catch (e) {
    console.warn('[pdfNativeDetector] failed:', e)
  }

  return result
}
