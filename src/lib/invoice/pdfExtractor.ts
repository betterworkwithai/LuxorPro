// ─── Invoice Pipeline — Native PDF Text Extractor ───────────────────────────
//
// Extracts text items with full spatial coordinates (x, y, width, height)
// from each page. The layout reconstructor consumes this output.
//
// IMPORTANT: The order returned by pdf.js is NOT reading order.
// Items must be sorted spatially before interpretation.

import type { TextItem } from './types'

const MAX_PAGES = 20

export async function extractTextItems(file: File): Promise<TextItem[][]> {
  const pages: TextItem[][] = []

  try {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href

    const buffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

    for (let p = 1; p <= Math.min(pdf.numPages, MAX_PAGES); p++) {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()
      const items: TextItem[] = []

      for (const raw of content.items as any[]) {
        if (!('str' in raw) || !raw.str.trim()) continue
        // transform = [scaleX, skewX, skewY, scaleY, translateX, translateY]
        const x = raw.transform[4]
        const y = raw.transform[5]
        items.push({
          text: raw.str,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          width: raw.width ?? 0,
          height: raw.height ?? 12,
          page: p,
        })
      }

      pages.push(items)
    }
  } catch (e) {
    console.warn('[pdfExtractor] extraction failed:', e)
  }

  return pages
}

/**
 * Fallback: extract plain text string from PDF for parsers that still
 * operate on raw text (payslip, investment statement).
 */
export async function extractRawText(file: File): Promise<string> {
  try {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href

    const buffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
    let text = ''

    for (let p = 1; p <= Math.min(pdf.numPages, MAX_PAGES); p++) {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()

      // Group items into visual lines by Y proximity (tolerance ≤2 pts, max cluster height ≤3 pts).
      // Using integer Math.round() is avoided because it silently merges adjacent rows
      // whose Y values straddle a 0.5-point boundary.
      const rawItems: { x: number; y: number; text: string; width: number }[] = []
      for (const item of content.items as any[]) {
        if (!('str' in item) || !item.str) continue
        rawItems.push({ x: item.transform[4], y: item.transform[5], text: item.str, width: item.width ?? 0 })
      }
      rawItems.sort((a, b) => b.y - a.y)  // top-to-bottom

      const lineGroups: typeof rawItems[] = []
      if (rawItems.length > 0) {
        let group = [rawItems[0]]
        for (let i = 1; i < rawItems.length; i++) {
          const yFromFirst = Math.abs(rawItems[i].y - group[0].y)
          // 5pt tolerance: keeps 'R$' and its value on the same row (Nubank/Santander layout)
          if (yFromFirst <= 5) {
            group.push(rawItems[i])
          } else {
            lineGroups.push(group)
            group = [rawItems[i]]
          }
        }
        lineGroups.push(group)
      }

      const lines = lineGroups
        .map(g => {
          const sorted = g.sort((a, b) => a.x - b.x)
          let line = sorted[0].text
          for (let i = 1; i < sorted.length; i++) {
            // Inject 3 spaces at large X gaps to preserve column structure for the LLM
            const gap = sorted[i].x - (sorted[i - 1].x + (sorted[i - 1].width ?? 0))
            line += (gap > 30 ? '   ' : ' ') + sorted[i].text
          }
          return line
        })

      text += lines.join('\n') + '\n'
    }

    return text.trim()
  } catch (e) {
    console.warn('[pdfExtractor] raw text extraction failed:', e)
    return ''
  }
}
