// ─── Invoice Pipeline — OCR Engine (Fallback) ───────────────────────────────
//
// Used only when native PDF text is insufficient (scanned PDFs, photos).
// Renders each PDF page as a high-DPI canvas, applies pre-processing,
// then runs Tesseract.js OCR in Portuguese + English.

const RENDER_SCALE = 2.5  // higher scale = better OCR accuracy, more memory

export interface OcrResult {
  text: string
  confidence: number   // average Tesseract confidence 0–100
}

export async function runOCROnPDF(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<OcrResult> {
  let fullText = ''
  let totalConfidence = 0
  let pageCount = 0

  try {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('por+eng')

    const buffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
    const numPages = Math.min(pdf.numPages, 15)

    for (let p = 1; p <= numPages; p++) {
      onProgress?.(Math.round((p / numPages) * 90))

      const page = await pdf.getPage(p)
      const viewport = page.getViewport({ scale: RENDER_SCALE })

      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!

      // White background (prevents artifacts on transparent PDFs)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      await page.render({ canvasContext: ctx, viewport }).promise

      // Pre-processing: grayscale + contrast boost
      preprocessCanvas(ctx, canvas.width, canvas.height)

      const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/png'))
      const { data } = await worker.recognize(blob)

      fullText += data.text + '\n'
      totalConfidence += data.confidence
      pageCount++
    }

    await worker.terminate()
    onProgress?.(100)

    return {
      text: fullText.trim(),
      confidence: pageCount > 0 ? totalConfidence / pageCount : 0,
    }
  } catch (e) {
    console.warn('[ocrEngine] OCR failed:', e)
    return { text: '', confidence: 0 }
  }
}

/** Run OCR on an image file directly. */
export async function runOCROnImage(file: File, onProgress?: (pct: number) => void): Promise<OcrResult> {
  try {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('por+eng')
    onProgress?.(30)
    const { data } = await worker.recognize(file)
    await worker.terminate()
    onProgress?.(100)
    return { text: data.text, confidence: data.confidence }
  } catch (e) {
    console.warn('[ocrEngine] image OCR failed:', e)
    return { text: '', confidence: 0 }
  }
}

/** Grayscale + contrast enhancement to improve OCR on low-quality scans. */
function preprocessCanvas(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const imageData = ctx.getImageData(0, 0, w, h)
  const d = imageData.data

  for (let i = 0; i < d.length; i += 4) {
    // Convert to grayscale
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    // Apply contrast boost: stretch to 0–255 with a midpoint shift
    const enhanced = Math.min(255, Math.max(0, (gray - 128) * 1.4 + 128))
    d[i] = d[i + 1] = d[i + 2] = enhanced
  }

  ctx.putImageData(imageData, 0, 0)
}
