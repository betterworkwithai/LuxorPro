// ─── Invoice Pipeline — Layout Reconstructor ────────────────────────────────
//
// Groups spatial TextItems into visual lines and orders them correctly.
// This is the key step that fixes multi-column PDF layouts where raw text
// extraction produces jumbled output.

import type { TextItem, ReconstructedLine } from './types'

/**
 * Max Y difference (PDF points) between two items to be considered the same line.
 * Kept intentionally tight: within a single transaction row items are usually ≤1pt apart.
 * Two separate rows in a typical CC statement are 10-14pt apart.
 * Tight spacing PDFs can have rows as close as 3pt, so we cap at 2 to avoid merging them.
 */
const Y_TOLERANCE = 2
/** An entire cluster cannot span more than this many Y points — hard cap against drift. */
const MAX_CLUSTER_Y_RANGE = 3
/** Minimum gap between columns (in PDF points) — inserts a space between columns. */
const COLUMN_GAP_THRESHOLD = 12

/**
 * Reconstruct visual lines from per-page text items.
 * Returns lines in reading order (top-to-bottom, left-to-right within each line).
 */
export function reconstructLines(pages: TextItem[][]): ReconstructedLine[] {
  const allLines: ReconstructedLine[] = []

  for (const items of pages) {
    if (items.length === 0) continue
    const pageLines = buildLines(items)
    allLines.push(...pageLines)
  }

  return allLines
}

function buildLines(items: TextItem[]): ReconstructedLine[] {
  if (items.length === 0) return []

  // Sort by Y descending (top of page = highest Y in PDF space) then X ascending
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)

  // Cluster items into rows by Y proximity.
  // Compare each new item against the cluster's first item Y AND enforce a hard
  // max-range cap so that many consecutive items at slightly different Y values
  // cannot "drift" into one giant merged cluster.
  const clusters: TextItem[][] = []
  let current: TextItem[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]
    const clusterFirstY = current[0].y
    const yFromFirst = Math.abs(item.y - clusterFirstY)
    if (yFromFirst <= Y_TOLERANCE && yFromFirst <= MAX_CLUSTER_Y_RANGE) {
      current.push(item)
    } else {
      clusters.push(current)
      current = [item]
    }
  }
  clusters.push(current)

  return clusters.map(cluster => assembleLineFromCluster(cluster))
}

function assembleLineFromCluster(cluster: TextItem[]): ReconstructedLine {
  // Sort by X so we read left to right
  const sorted = [...cluster].sort((a, b) => a.x - b.x)

  // Build the line text, inserting extra space where there's a column-size gap
  const parts: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]
    if (i > 0) {
      const prevItem = sorted[i - 1]
      const prevRight = prevItem.x + (prevItem.width || 0)
      const gap = item.x - prevRight
      if (gap > COLUMN_GAP_THRESHOLD) {
        parts.push('  ')  // double space signals column boundary
      } else if (gap > 2) {
        parts.push(' ')
      }
    }
    parts.push(item.text)
  }

  const text = parts.join('').replace(/\s{3,}/g, '  ').trim()

  const x1 = Math.min(...sorted.map(i => i.x))
  const y1 = Math.min(...sorted.map(i => i.y))
  const x2 = Math.max(...sorted.map(i => i.x + (i.width || 0)))
  const y2 = Math.max(...sorted.map(i => i.y + (i.height || 0)))

  // Coherence score: reward lines that have uniform Y values
  const yValues = cluster.map(i => i.y)
  const yRange = Math.max(...yValues) - Math.min(...yValues)
  const coherenceScore = Math.max(0, 1 - yRange / 10)

  return {
    text,
    page: sorted[0].page,
    y: sorted[0].y,
    bbox: { x1, y1, x2, y2 },
    items: sorted,
    coherenceScore,
  }
}

/**
 * Convert raw text string (from OCR or fallback) into ReconstructedLine array.
 * Used when spatial data is unavailable (e.g., OCR output).
 */
export function linesFromRawText(rawText: string, page = 1): ReconstructedLine[] {
  return rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 1)
    .map((text, i) => ({
      text,
      page,
      y: 1000 - i * 14,  // synthetic y: decreasing so first line is "highest"
      bbox: { x1: 0, y1: 0, x2: 500, y2: 12 },
      items: [],
      coherenceScore: 0.5,  // unknown — OCR text has no spatial info
    }))
}
