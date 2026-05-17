// ─── Luxor Pro — Wealth Report PDF Generator ─────────────────────────────────
// Generates a multi-page A4 PDF from live portfolio data.
// Design: cream/off-white background, navy text, orange + cyan accents.
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Brand tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        [252, 251, 248] as [number,number,number],   // off-white
  surface:   [243, 241, 235] as [number,number,number],   // warm light card
  border:    [220, 215, 205] as [number,number,number],
  navy:      [ 13,  27,  42] as [number,number,number],   // primary text
  mid:       [ 80,  90, 110] as [number,number,number],   // secondary text
  muted:     [155, 160, 170] as [number,number,number],
  orange:    [255, 122,   0] as [number,number,number],   // Luxor brand
  cyan:      [  0, 180, 210] as [number,number,number],
  green:     [ 16, 185, 129] as [number,number,number],
  red:       [220,  53,  69] as [number,number,number],
  purple:    [124,  58, 237] as [number,number,number],
  teal:      [ 52, 211, 153] as [number,number,number],
}

const W = 210   // A4 width mm
const H = 297   // A4 height mm
const ML = 16   // margin left
const MR = 16   // margin right
const CW = W - ML - MR  // content width

// ── Helpers ──────────────────────────────────────────────────────────────────
function rgb(c: [number,number,number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

function fmtPct(n: number | null, decimals = 1): string {
  if (n === null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`
}

function pctColor(n: number | null): [number,number,number] {
  if (n === null) return C.muted
  return n >= 0 ? C.green : C.red
}

// Filled rounded rectangle helper
function roundRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, fill: [number,number,number]) {
  doc.setFillColor(...fill)
  doc.roundedRect(x, y, w, h, r, r, 'F')
}

// Section header bar
function sectionHeader(doc: jsPDF, y: number, title: string, sub?: string): number {
  doc.setFillColor(...C.surface)
  doc.rect(ML, y, CW, sub ? 14 : 10, 'F')
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(ML, y, ML + CW, y)

  // Accent left bar
  doc.setFillColor(...C.orange)
  doc.rect(ML, y, 2.5, sub ? 14 : 10, 'F')

  doc.setTextColor(...C.navy)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text(title.toUpperCase(), ML + 6, y + (sub ? 5.5 : 6.5))

  if (sub) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...C.mid)
    doc.text(sub, ML + 6, y + 10.5)
  }

  return y + (sub ? 16 : 12)
}

// Page footer
function footer(doc: jsPDF, pageNum: number, total: number) {
  const y = H - 10
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(ML, y, ML + CW, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.muted)
  doc.text('Luxor Pro · Relatório de Patrimônio', ML, y + 4)
  doc.text(`Página ${pageNum} / ${total}`, ML + CW, y + 4, { align: 'right' })
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' })}`, W / 2, y + 4, { align: 'center' })
}

// KPI mini-card (used on page 1 summary row)
function kpiCard(doc: jsPDF, x: number, y: number, w: number, label: string, value: string, valueColor: [number,number,number], sub?: string) {
  roundRect(doc, x, y, w, sub ? 24 : 20, 2, C.surface)
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, y, w, sub ? 24 : 20, 2, 2, 'S')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...C.mid)
  doc.text(label.toUpperCase(), x + w / 2, y + 5.5, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...valueColor)
  doc.text(value, x + w / 2, y + 13, { align: 'center' })

  if (sub) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...C.muted)
    doc.text(sub, x + w / 2, y + 20, { align: 'center' })
  }
}

// ── Types expected from caller ────────────────────────────────────────────────
export interface PDFAllocationRow {
  cls: string
  actualPct: number
  targetPct: number
  gapPct: number
  actualValue: number
}

export interface PDFPositionRow {
  name: string
  ticker?: string
  assetClass: string
  maturity?: string
  position: number       // BRL value
  allocPct: number
  pctMtd: number | null
  pctPrevMonth: number | null
  pctYtd: number | null
  pct12m: number | null
  pct24m: number | null
  pctInception: number | null
  location: string
}

export interface PDFBenchmarkPeriod {
  label: string
  cdi: number | null
  dolar: number | null
  ibov: number | null
  ipca: number | null
}

export interface WealthPDFParams {
  totalBRL: number
  totalUSD: number
  pctPeriod: number
  pctYtd: number
  pct12m: number
  pct24m: number
  pctInception: number
  liquidBRL: number
  iliquidBRL: number
  suitabilityProfile: string
  location: 'all' | 'onshore' | 'offshore'
  currency: 'BRL' | 'USD'
  usdToBrl: number
  allocationLocal: PDFAllocationRow[]
  allocationIntl: PDFAllocationRow[]
  benchmarkPeriods: PDFBenchmarkPeriod[]
  positions: PDFPositionRow[]
  generatedAt?: Date
}

// ── Main generator ────────────────────────────────────────────────────────────
export function generateWealthPDF(p: WealthPDFParams): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })

  // ── PAGE 1: Cover + Summary ──────────────────────────────────────────────
  // Background
  doc.setFillColor(...C.bg)
  doc.rect(0, 0, W, H, 'F')

  // Top accent bar
  doc.setFillColor(...C.navy)
  doc.rect(0, 0, W, 40, 'F')

  // Orange accent strip
  doc.setFillColor(...C.orange)
  doc.rect(0, 40, W, 2.5, 'F')

  // Logo text in header
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('Luxor', ML, 22)
  doc.setTextColor(...C.orange)
  doc.text('.Pro', ML + 28, 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(180, 190, 210)
  doc.text('Relatório de Patrimônio e Investimentos', ML, 31)

  // Date + location in top-right
  const locationLabel = p.location === 'onshore' ? 'Brasil' : p.location === 'offshore' ? 'Exterior' : 'Global'
  doc.setFontSize(7.5)
  doc.setTextColor(180, 190, 210)
  const genDate = (p.generatedAt ?? new Date()).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.text(genDate, W - MR, 22, { align: 'right' })
  doc.text(`Visão: ${locationLabel}  ·  ${p.suitabilityProfile}`, W - MR, 29, { align: 'right' })

  // Hero patrimônio section
  let cy = 52
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.mid)
  doc.text('PATRIMÔNIO TOTAL', ML, cy)

  cy += 7
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(...C.navy)
  doc.text(fmtBRL(p.totalBRL), ML, cy)

  if (p.currency === 'USD') {
    doc.setFontSize(11)
    doc.setTextColor(...C.mid)
    doc.text(`USD ${(p.totalUSD).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, ML, cy + 8)
    cy += 10
  }

  cy += 5

  // Performance badges row
  const badgeData = [
    { label: 'No Período', val: p.pctPeriod },
    { label: 'YTD',        val: p.pctYtd    },
    { label: '12M',        val: p.pct12m    },
    { label: '24M',        val: p.pct24m    },
    { label: 'Desde início',val: p.pctInception },
  ]
  let bx = ML
  for (const b of badgeData) {
    const bw = 32
    roundRect(doc, bx, cy, bw, 14, 2, C.surface)
    doc.setDrawColor(...C.border)
    doc.setLineWidth(0.2)
    doc.roundedRect(bx, cy, bw, 14, 2, 2, 'S')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...C.mid)
    doc.text(b.label, bx + bw / 2, cy + 4.5, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...pctColor(b.val))
    doc.text(fmtPct(b.val), bx + bw / 2, cy + 10.5, { align: 'center' })
    bx += bw + 2.5
  }
  cy += 20

  // Divider
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(ML, cy, ML + CW, cy)
  cy += 8

  // 4 KPI cards
  const kpiW = (CW - 9) / 4
  kpiCard(doc, ML,                          cy, kpiW, 'Patrimônio Líquido', fmtBRL(p.liquidBRL),  C.navy)
  kpiCard(doc, ML + kpiW + 3,               cy, kpiW, 'Imóveis / Ilíquido', fmtBRL(p.iliquidBRL), C.mid)
  kpiCard(doc, ML + (kpiW + 3) * 2,         cy, kpiW, 'Câmbio (USD/BRL)',   `R$ ${p.usdToBrl.toFixed(2)}`,  C.mid)
  kpiCard(doc, ML + (kpiW + 3) * 3,         cy, kpiW, 'Perfil Suitability', p.suitabilityProfile, C.orange)
  cy += 28

  // ── Benchmarks table on page 1 ───────────────────────────────────────────
  cy = sectionHeader(doc, cy, 'Benchmarks', 'Retornos acumulados por período (CDI, Dólar, Ibovespa, IPCA)')

  const bHeaders = p.benchmarkPeriods.map(b => ({ content: b.label, styles: { halign: 'center' as const } }))
  const benchKeys: (keyof PDFBenchmarkPeriod)[] = ['cdi', 'dolar', 'ibov', 'ipca']
  const benchLabels = ['CDI', 'Dólar', 'Ibovespa', 'IPCA']
  const benchColors = [C.cyan, C.orange, C.purple, C.teal]

  const bBody = benchKeys.map((k, ki) => [
    { content: benchLabels[ki], styles: { fontStyle: 'bold' as const, textColor: benchColors[ki] } },
    ...p.benchmarkPeriods.map(b => {
      const val = b[k] as number | null
      return {
        content: fmtPct(val),
        styles: {
          halign: 'center' as const,
          textColor: val === null ? C.muted : val >= 0 ? C.green : C.red,
          fontStyle: 'bold' as const,
        },
      }
    }),
  ])

  autoTable(doc, {
    startY: cy,
    margin: { left: ML, right: MR },
    head: [[{ content: 'Índice', styles: { halign: 'left' } }, ...bHeaders]],
    body: bBody,
    styles: { fontSize: 8, cellPadding: 3, lineColor: C.border, lineWidth: 0.2 },
    headStyles: { fillColor: C.navy, textColor: [255,255,255], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: C.surface },
    theme: 'grid',
  })

  cy = (doc as any).lastAutoTable.finalY + 10

  // ── Allocation summary (compact) ─────────────────────────────────────────
  if (p.allocationLocal.length > 0) {
    cy = sectionHeader(doc, cy, 'Alocação Onshore (BRL)', 'Posição atual vs alvo · por classe de ativo')

    const allocRows = p.allocationLocal.slice(0, 12).map(r => [
      r.cls,
      { content: `${r.actualPct.toFixed(1)}%`, styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
      { content: `${r.targetPct.toFixed(1)}%`, styles: { halign: 'center' as const } },
      {
        content: `${r.gapPct >= 0 ? '+' : ''}${r.gapPct.toFixed(1)}%`,
        styles: { halign: 'center' as const, textColor: Math.abs(r.gapPct) < 1 ? C.green : r.gapPct > 0 ? C.orange : C.cyan },
      },
      { content: fmtBRL(r.actualValue), styles: { halign: 'right' as const } },
    ])

    autoTable(doc, {
      startY: cy,
      margin: { left: ML, right: MR },
      head: [['Classe de Ativo', 'Atual', 'Alvo', 'Gap', 'Valor (BRL)']],
      body: allocRows,
      styles: { fontSize: 7.5, cellPadding: 2.5, lineColor: C.border, lineWidth: 0.2 },
      headStyles: { fillColor: C.navy, textColor: [255,255,255], fontStyle: 'bold', fontSize: 7 },
      columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 18 }, 2: { cellWidth: 18 }, 3: { cellWidth: 18 }, 4: { cellWidth: 'auto' } },
      alternateRowStyles: { fillColor: C.surface },
      theme: 'grid',
    })
    cy = (doc as any).lastAutoTable.finalY + 6
  }

  footer(doc, 1, 3)

  // ── PAGE 2: Offshore allocation + performance detail ─────────────────────
  doc.addPage()
  doc.setFillColor(...C.bg)
  doc.rect(0, 0, W, H, 'F')

  cy = 16

  if (p.allocationIntl.length > 0) {
    cy = sectionHeader(doc, cy, 'Alocação Offshore (USD)', 'Posição atual vs alvo · por classe de ativo')

    const allocRowsIntl = p.allocationIntl.slice(0, 17).map(r => [
      r.cls,
      { content: `${r.actualPct.toFixed(1)}%`, styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
      { content: `${r.targetPct.toFixed(1)}%`, styles: { halign: 'center' as const } },
      {
        content: `${r.gapPct >= 0 ? '+' : ''}${r.gapPct.toFixed(1)}%`,
        styles: { halign: 'center' as const, textColor: Math.abs(r.gapPct) < 1 ? C.green : r.gapPct > 0 ? C.orange : C.cyan },
      },
      { content: fmtBRL(r.actualValue), styles: { halign: 'right' as const } },
    ])

    autoTable(doc, {
      startY: cy,
      margin: { left: ML, right: MR },
      head: [['Classe de Ativo', 'Atual', 'Alvo', 'Gap', 'Valor (BRL)']],
      body: allocRowsIntl,
      styles: { fontSize: 7.5, cellPadding: 2.5, lineColor: C.border, lineWidth: 0.2 },
      headStyles: { fillColor: C.cyan, textColor: [255,255,255], fontStyle: 'bold', fontSize: 7 },
      columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 18 }, 2: { cellWidth: 18 }, 3: { cellWidth: 18 }, 4: { cellWidth: 'auto' } },
      alternateRowStyles: { fillColor: C.surface },
      theme: 'grid',
    })
    cy = (doc as any).lastAutoTable.finalY + 10
  }

  // Performance legend
  cy = sectionHeader(doc, cy, 'Legenda de Performance', 'Períodos fixos calculados por ativo')

  const perfLegendData = [
    ['Mês Atual (MTD)', 'Retorno do mês corrente desde o início do mês'],
    ['Mês Anterior', 'Retorno do mês calendário anterior completo'],
    ['YTD', 'Retorno acumulado desde 01/Jan do ano corrente'],
    ['12M', 'Retorno nos últimos 12 meses calendário'],
    ['24M', 'Retorno nos últimos 24 meses calendário'],
    ['Desde Início', 'Retorno total desde a data de compra do ativo'],
    ['—', 'Ativo adquirido dentro do período — cálculo não aplicável'],
  ]

  autoTable(doc, {
    startY: cy,
    margin: { left: ML, right: MR },
    head: [['Período', 'Definição']],
    body: perfLegendData,
    styles: { fontSize: 7.5, cellPadding: 2.5, lineColor: C.border, lineWidth: 0.2 },
    headStyles: { fillColor: C.navy, textColor: [255,255,255], fontStyle: 'bold', fontSize: 7 },
    columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 'auto' } },
    alternateRowStyles: { fillColor: C.surface },
    theme: 'grid',
  })

  footer(doc, 2, 3)

  // ── PAGE 3: Full Positions Table ─────────────────────────────────────────
  doc.addPage()
  doc.setFillColor(...C.bg)
  doc.rect(0, 0, W, H, 'F')

  cy = 16
  cy = sectionHeader(doc, cy, 'Posições Detalhadas', `${p.positions.length} ativos · valores em BRL`)

  const posHead = ['Ativo', 'Classe', 'Vencto', 'Posição (R$)', 'Aloc.', 'MTD', 'Mês Ant.', 'YTD', '12M', '24M', 'Início']

  const posBody = p.positions.map(pos => [
    { content: pos.name.length > 22 ? pos.name.slice(0, 21) + '…' : pos.name, styles: { fontStyle: 'bold' as const } },
    { content: pos.assetClass.length > 20 ? pos.assetClass.slice(0, 19) + '…' : pos.assetClass, styles: { fontSize: 6.5 } },
    { content: pos.maturity ?? '—', styles: { halign: 'center' as const, fontSize: 6.5 } },
    { content: fmtBRL(pos.position), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
    { content: `${pos.allocPct.toFixed(1)}%`, styles: { halign: 'center' as const } },
    { content: fmtPct(pos.pctMtd), styles: { halign: 'center' as const, textColor: pctColor(pos.pctMtd) } },
    { content: fmtPct(pos.pctPrevMonth), styles: { halign: 'center' as const, textColor: pctColor(pos.pctPrevMonth) } },
    { content: fmtPct(pos.pctYtd), styles: { halign: 'center' as const, textColor: pctColor(pos.pctYtd) } },
    { content: fmtPct(pos.pct12m), styles: { halign: 'center' as const, textColor: pctColor(pos.pct12m) } },
    { content: fmtPct(pos.pct24m), styles: { halign: 'center' as const, textColor: pctColor(pos.pct24m) } },
    { content: fmtPct(pos.pctInception), styles: { halign: 'center' as const, textColor: pctColor(pos.pctInception) } },
  ])

  autoTable(doc, {
    startY: cy,
    margin: { left: ML, right: MR },
    head: [posHead],
    body: posBody,
    styles: { fontSize: 6.8, cellPadding: 2, lineColor: C.border, lineWidth: 0.15, overflow: 'hidden' },
    headStyles: { fillColor: C.navy, textColor: [255,255,255], fontStyle: 'bold', fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 38 },  // name
      1: { cellWidth: 28 },  // class
      2: { cellWidth: 16 },  // maturity
      3: { cellWidth: 22 },  // position
      4: { cellWidth: 11 },  // alloc
      5: { cellWidth: 12 },  // mtd
      6: { cellWidth: 12 },  // prev month
      7: { cellWidth: 11 },  // ytd
      8: { cellWidth: 11 },  // 12m
      9: { cellWidth: 11 },  // 24m
      10:{ cellWidth: 11 },  // inception
    },
    alternateRowStyles: { fillColor: C.surface },
    theme: 'grid',
    didParseCell: (data) => {
      // Highlight position rows differently by location
    },
  })

  footer(doc, 3, 3)

  // ── Save ─────────────────────────────────────────────────────────────────
  const filename = `Luxor_Patrimônio_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(filename)
}
