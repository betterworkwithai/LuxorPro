// ─────────────────────────────────────────────────────────────────────
//  Portfolio PDF exporter — generates a shareable summary PDF
//  with portfolio metrics, allocation breakdown and rebalancing gaps.
// ─────────────────────────────────────────────────────────────────────
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Investment } from './types'
import type { AllocationRow, SuitabilityProfile } from './suitability'

// Luxor palette
const BLACK  = '#0a0a0f'
const ORANGE = '#ff7a00'
const BLUE   = '#3b82f6'
const MUTED  = '#8888aa'
const TEXT   = '#1a1a24'
const RED    = '#dc2626'
const GREEN  = '#15803d'

interface Metrics {
  totalValue: number
  totalCost: number
  totalGain: number
  gainPct: number
  totalDivs: number
  totalIntr: number
  offshorePct: number
}

interface PerformancePoint {
  date: string
  value: number
}

interface ExportArgs {
  view: 'global' | 'local' | 'international'
  profile: SuitabilityProfile
  displayCurrency: 'BRL' | 'USD' | 'EUR'
  fmt: (v: number) => string
  metrics: Metrics
  allocation: AllocationRow[]
  performance: PerformancePoint[]
  period: string
  investments: Investment[]
  toBase: (amount: number, from: 'BRL' | 'USD' | 'EUR') => number
  fxRates: { usdToBrl: number; eurToBrl: number }
}

const VIEW_LABELS: Record<ExportArgs['view'], string> = {
  global: 'Global Portfolio',
  local: 'Local Portfolio (Onshore)',
  international: 'International Portfolio (Offshore)',
}

function drawSparkline(
  doc: jsPDF, points: PerformancePoint[],
  x: number, y: number, w: number, h: number,
) {
  if (points.length < 2) {
    doc.setTextColor(MUTED)
    doc.setFontSize(9)
    doc.text('Histórico insuficiente para gerar curva.', x, y + h / 2)
    return
  }
  const values = points.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = w / (points.length - 1)

  // Axis box
  doc.setDrawColor('#e5e7eb')
  doc.setLineWidth(0.3)
  doc.rect(x, y, w, h)

  // Line
  doc.setDrawColor(ORANGE)
  doc.setLineWidth(0.8)
  for (let i = 1; i < points.length; i++) {
    const x1 = x + (i - 1) * stepX
    const x2 = x + i * stepX
    const y1 = y + h - ((values[i - 1] - min) / span) * h
    const y2 = y + h - ((values[i] - min) / span) * h
    doc.line(x1, y1, x2, y2)
  }

  // Min/Max labels
  doc.setTextColor(MUTED)
  doc.setFontSize(7)
  doc.text(`min`, x + 1, y + h - 1)
  doc.text(`max`, x + 1, y + 4)
}

function drawAllocationBars(
  doc: jsPDF, rows: AllocationRow[],
  x: number, y: number, w: number, rowH: number,
) {
  doc.setFontSize(8)
  rows.slice(0, 12).forEach((r, idx) => {
    const yy = y + idx * rowH
    const labelW = 55
    const barX = x + labelW
    const barW = w - labelW - 28
    const maxPct = Math.max(r.actualPct, r.targetPct, 1)
    const actualW = (r.actualPct / maxPct) * barW
    const targetW = (r.targetPct / maxPct) * barW

    // label
    doc.setTextColor(TEXT)
    doc.text(r.cls.length > 28 ? r.cls.slice(0, 26) + '…' : r.cls, x, yy + 3.5)

    // target (background)
    doc.setFillColor(BLUE)
    doc.rect(barX, yy + 1, targetW, 2, 'F')

    // actual (foreground)
    doc.setFillColor(ORANGE)
    doc.rect(barX, yy + 4, actualW, 2, 'F')

    // pct text
    doc.setTextColor(MUTED)
    doc.text(`${r.actualPct.toFixed(1)}% / ${r.targetPct.toFixed(1)}%`, x + w - 26, yy + 3.5)
  })
}

export function exportPortfolioPdf(args: ExportArgs): void {
  const { view, profile, displayCurrency, fmt, metrics, allocation, performance,
          period, investments, toBase, fxRates } = args

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  const contentW = pageW - margin * 2
  let y = margin

  // ─── Header band ────────────────────────────────────────────────
  doc.setFillColor(BLACK)
  doc.rect(0, 0, pageW, 28, 'F')
  doc.setTextColor(ORANGE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('LUXOR', margin, 14)
  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Portfolio Management', margin, 20)

  doc.setFontSize(9)
  doc.setTextColor('#cccccc')
  const today = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  doc.text(today, pageW - margin, 14, { align: 'right' })
  doc.text(`Perfil: ${profile}`, pageW - margin, 20, { align: 'right' })

  y = 36

  // ─── View title ─────────────────────────────────────────────────
  doc.setTextColor(TEXT)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(VIEW_LABELS[view], margin, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(MUTED)
  doc.text(
    `Moeda de exibição: ${displayCurrency}  ·  ${investments.length} ativo${investments.length === 1 ? '' : 's'}  ·  ` +
    `USD/BRL ${fxRates.usdToBrl.toFixed(2)} · EUR/BRL ${fxRates.eurToBrl.toFixed(2)}`,
    margin, y,
  )
  y += 6

  // ─── KPI cards (4 columns) ──────────────────────────────────────
  const kpis = [
    { label: 'Total Equity',     value: fmt(metrics.totalValue), sub: `Investido: ${fmt(metrics.totalCost)}`,                            color: ORANGE },
    { label: 'Ganho Total',      value: fmt(metrics.totalGain),  sub: `${metrics.gainPct >= 0 ? '+' : ''}${metrics.gainPct.toFixed(2)}%`, color: metrics.totalGain >= 0 ? GREEN : RED },
    { label: `Período ${period}`, value: fmt(performance.length >= 2 ? performance[performance.length - 1].value - performance[0].value : 0), sub: `${performance.length} pontos`, color: BLUE },
    { label: 'Offshore %',       value: `${metrics.offshorePct.toFixed(1)}%`, sub: 'Exposição internacional', color: '#8b5cf6' },
  ]
  const cardW = (contentW - 9) / 4
  kpis.forEach((k, i) => {
    const cx = margin + i * (cardW + 3)
    doc.setDrawColor('#e5e7eb')
    doc.setFillColor('#fafafa')
    doc.roundedRect(cx, y, cardW, 22, 2, 2, 'FD')
    doc.setTextColor(MUTED)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.text(k.label.toUpperCase(), cx + 3, y + 5)
    doc.setTextColor(k.color)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(k.value, cx + 3, y + 12)
    doc.setTextColor(MUTED)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(k.sub, cx + 3, y + 18)
  })
  y += 28

  // ─── Performance section ────────────────────────────────────────
  doc.setTextColor(TEXT)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(`Performance — ${period}`, margin, y)
  y += 3
  drawSparkline(doc, performance, margin, y, contentW, 32)
  y += 36

  // ─── Allocation section ─────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(TEXT)
  doc.text('Alocação — Atual vs. Alvo', margin, y)
  y += 2
  // Legend
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setFillColor(ORANGE); doc.rect(margin, y + 1, 3, 2, 'F')
  doc.setTextColor(MUTED);  doc.text('Atual', margin + 5, y + 3)
  doc.setFillColor(BLUE);   doc.rect(margin + 20, y + 1, 3, 2, 'F')
  doc.setTextColor(MUTED);  doc.text('Alvo',  margin + 25, y + 3)
  y += 6
  drawAllocationBars(doc, allocation, margin, y, contentW, 6)
  y += Math.min(allocation.length, 12) * 6 + 4

  // ─── Rebalancing table ──────────────────────────────────────────
  const rebal = allocation
    .filter(r => Math.abs(r.gapValue) > 0.01)
    .sort((a, b) => Math.abs(b.gapValue) - Math.abs(a.gapValue))
    .slice(0, 8)

  if (rebal.length > 0) {
    if (y > 240) { doc.addPage(); y = margin }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(TEXT)
    doc.text('Sugestão de Rebalanceamento', margin, y)
    y += 3
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Classe', 'Atual %', 'Alvo %', 'Gap %', 'Ação', 'Valor']],
      body: rebal.map(r => {
        const overweight = r.gapValue > 0
        return [
          r.cls,
          `${r.actualPct.toFixed(1)}%`,
          `${r.targetPct.toFixed(1)}%`,
          `${overweight ? '+' : ''}${r.gapPct.toFixed(1)}%`,
          overweight ? 'Reduzir' : 'Aumentar',
          fmt(Math.abs(r.gapValue)),
        ]
      }),
      styles: { fontSize: 8, cellPadding: 1.6, textColor: TEXT },
      headStyles: { fillColor: BLACK, textColor: '#ffffff', fontStyle: 'bold' },
      alternateRowStyles: { fillColor: '#fafafa' },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ─── Holdings table (new page if tight) ─────────────────────────
  if (y > 220) { doc.addPage(); y = margin }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(TEXT)
  doc.text('Holdings', margin, y)
  y += 3

  const totalValBase = investments.reduce(
    (s, i) => s + toBase(i.quantity * i.currentPrice, i.currency), 0,
  )

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Ativo', 'Classe', 'Local', 'Cur', 'Valor', '% Carteira', 'Ganho %']],
    body: investments
      .map(i => {
        const valBase = toBase(i.quantity * i.currentPrice, i.currency)
        const cost    = i.quantity * i.avgCost
        const gainPct = cost > 0 ? ((i.currentPrice - i.avgCost) / i.avgCost) * 100 : 0
        const pctPort = totalValBase > 0 ? (valBase / totalValBase) * 100 : 0
        return {
          row: [
            i.institution.length > 28 ? i.institution.slice(0, 26) + '…' : i.institution,
            i.assetClass.length > 22 ? i.assetClass.slice(0, 20) + '…' : i.assetClass,
            i.location === 'onshore' ? 'BR' : i.location === 'offshore' ? 'INT' : 'RE',
            i.currency,
            fmt(valBase),
            `${pctPort.toFixed(1)}%`,
            `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%`,
          ],
          val: valBase,
        }
      })
      .sort((a, b) => b.val - a.val)
      .map(x => x.row),
    styles: { fontSize: 7.5, cellPadding: 1.4, textColor: TEXT },
    headStyles: { fillColor: BLACK, textColor: '#ffffff', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: '#fafafa' },
    columnStyles: {
      4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
    },
  })

  // ─── Footer on all pages ────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setDrawColor('#e5e7eb')
    doc.setLineWidth(0.2)
    const ph = doc.internal.pageSize.getHeight()
    doc.line(margin, ph - 10, pageW - margin, ph - 10)
    doc.setFontSize(7.5)
    doc.setTextColor(MUTED)
    doc.setFont('helvetica', 'normal')
    doc.text('Luxor Portfolio Management — Documento gerado para fins informativos. Não constitui recomendação de investimento.',
      margin, ph - 6)
    doc.text(`${p} / ${pageCount}`, pageW - margin, ph - 6, { align: 'right' })
  }

  const stamp = new Date().toISOString().slice(0, 10)
  doc.save(`luxor-portfolio-${view}-${stamp}.pdf`)
}
