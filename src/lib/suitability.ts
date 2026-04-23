// ─────────────────────────────────────────────
//  Suitability target matrices and asset class taxonomy
//  for the Luxor Portfolio Management redesign.
// ─────────────────────────────────────────────
import type { Investment } from './types'

export type SuitabilityProfile = 'Conservador' | 'Moderado' | 'Arrojado' | 'Agressivo'

export const SUITABILITY_PROFILES: SuitabilityProfile[] = [
  'Conservador', 'Moderado', 'Arrojado', 'Agressivo',
]

// ─── Local (BRL) targets ──────────────────────
// Indexes match SUITABILITY_PROFILES order.
const LOCAL_RAW: Record<string, [number, number, number, number]> = {
  'Pós-Fixado':                      [76, 42, 25, 18],
  'Prefixado':                       [1,  4,  7,  7.5],
  'IPCA Juro Real (Curto)':          [12, 17, 13, 9.5],
  'IPCA Juro Real (Longo)':          [1,  5,  11, 15],
  'Renda Fixa Ativo':                [3,  3,  0,  0],
  'Multimercados':                   [7,  8,  12, 10],
  'RV Ibovespa':                     [0,  4,  6,  13],
  'RV S&P (BRL)':                    [0,  3,  6,  7],
  'Alt. Crédito Estruturado':        [0,  10, 10, 9],
  'Alt. FII (Tijolo)':               [0,  4,  6,  6],
  'Alt. PE/VC/Real Assets':          [0,  0,  4,  5],
}

// ─── International (USD) targets ──────────────
const INTL_RAW: Record<string, [number, number, number, number]> = {
  'Cash/CD':                       [10,   5,    4,    3],
  'US Treasury':                   [22,   12.5, 6,    2.5],
  'US Investment Grade':           [10,   7.5,  5,    3],
  'Developed Govt/Corp':           [38,   28,   13.5, 5.5],
  'US High Yield':                 [8,    2,    2,    2.5],
  'EM Govt/Corp':                  [12,   5,    6,    6],
  'RV US':                         [0,    6,    12,   18],
  'RV Europe':                     [0,    5,    8.5,  10.5],
  'RV Asia':                       [0,    3.5,  5.5,  7],
  'RV Emerging':                   [0,    4.5,  8,    10.5],
  'Commodities':                   [0,    1.5,  2,    2],
  'Gold':                          [0,    3,    3,    3],
  'Crypto':                        [0,    0,    0,    1.5],
  'Hedge Funds':                   [0,    7,    8.5,  6],
  'Private Credit':                [0,    3,    4,    4],
  'Private Real Estate':           [0,    2,    3,    3],
  'Private Equity':                [0,    4.5,  9,    12],
}

function buildTargets(raw: Record<string, [number, number, number, number]>): Record<SuitabilityProfile, Record<string, number>> {
  const out: Record<SuitabilityProfile, Record<string, number>> = {
    Conservador: {}, Moderado: {}, Arrojado: {}, Agressivo: {},
  }
  for (const [cls, vals] of Object.entries(raw)) {
    out.Conservador[cls] = vals[0]
    out.Moderado[cls]    = vals[1]
    out.Arrojado[cls]    = vals[2]
    out.Agressivo[cls]   = vals[3]
  }
  return out
}

export const LOCAL_TARGETS = buildTargets(LOCAL_RAW)
export const INTL_TARGETS  = buildTargets(INTL_RAW)

export const LOCAL_CLASSES: string[] = Object.keys(LOCAL_RAW)
export const INTL_CLASSES:  string[] = Object.keys(INTL_RAW)

// ─── Mapping legacy/free-text asset classes → canonical bucket ────
// The user may have saved arbitrary class names. This helper maps the
// common ones to one of the canonical buckets above so the suitability
// engine still works for older data.
const LOCAL_ALIASES: Record<string, string> = {
  'Pós-Fixado': 'Pós-Fixado',
  'CDB': 'Pós-Fixado',
  'LCI': 'Pós-Fixado',
  'LCA': 'Pós-Fixado',
  'Prefixado': 'Prefixado',
  'Pré': 'Prefixado',
  'Tesouro Direto': 'Pós-Fixado',
  'IPCA Juro Real (Curto)': 'IPCA Juro Real (Curto)',
  'IPCA Juro Real Durações Curtas': 'IPCA Juro Real (Curto)',
  'IPCA Juro Real (Longo)': 'IPCA Juro Real (Longo)',
  'IPCA Juro Real Durações Longas': 'IPCA Juro Real (Longo)',
  'IPCA +': 'IPCA Juro Real (Curto)',
  'Renda Fixa Ativo': 'Renda Fixa Ativo',
  'RF Ativa': 'Renda Fixa Ativo',
  'Multimercados': 'Multimercados',
  'Multimercado': 'Multimercados',
  'RV Ibovespa': 'RV Ibovespa',
  'Renda Variável Ibovespa': 'RV Ibovespa',
  'Ações B3': 'RV Ibovespa',
  'RV S&P (BRL)': 'RV S&P (BRL)',
  'Renda Variável S&P em Reais': 'RV S&P (BRL)',
  'Alt. Crédito Estruturado': 'Alt. Crédito Estruturado',
  'Alternativos Credito Estruturado': 'Alt. Crédito Estruturado',
  'Alt. FII (Tijolo)': 'Alt. FII (Tijolo)',
  'Alternativos FII (Tijolo)': 'Alt. FII (Tijolo)',
  'FII': 'Alt. FII (Tijolo)',
  'Alt. PE/VC/Real Assets': 'Alt. PE/VC/Real Assets',
  'Alternativos Private Equity, Venture Capital e Real Assets': 'Alt. PE/VC/Real Assets',
}

const INTL_ALIASES: Record<string, string> = {
  'Cash/CD': 'Cash/CD',
  'Caixa/CD': 'Cash/CD',
  'USD Cash': 'Cash/CD',
  'US Treasury': 'US Treasury',
  'Renda Fixa US Treasury': 'US Treasury',
  'US Investment Grade': 'US Investment Grade',
  'Renda Fixa US Investment Grade': 'US Investment Grade',
  'Developed Govt/Corp': 'Developed Govt/Corp',
  'Renda Fixa Desenvolvidos Govt/Corp': 'Developed Govt/Corp',
  'US High Yield': 'US High Yield',
  'Renda Fixa US High Yield': 'US High Yield',
  'EM Govt/Corp': 'EM Govt/Corp',
  'Renda Fixa EM Govt/Corp USD': 'EM Govt/Corp',
  'RV US': 'RV US',
  'US Stocks': 'RV US',
  'Renda Variável Estados Unidos': 'RV US',
  'ETF': 'RV US',
  'RV Europe': 'RV Europe',
  'Renda Variável Europa': 'RV Europe',
  'RV Asia': 'RV Asia',
  'Renda Variável sia-Pacífico': 'RV Asia',
  'RV Emerging': 'RV Emerging',
  'Renda Variável Mercados Emergentes': 'RV Emerging',
  'Commodities': 'Commodities',
  'Alternativos Cesta de Commodidades': 'Commodities',
  'Alternativos Cesta de Commodities': 'Commodities',
  'Gold': 'Gold',
  'Alternativos Ouro': 'Gold',
  'Crypto': 'Crypto',
  'Alternativos Cryptos': 'Crypto',
  'Cryptos': 'Crypto',
  'Hedge Funds': 'Hedge Funds',
  'Alternativos Hedge Funds': 'Hedge Funds',
  'Private Credit': 'Private Credit',
  'Alternativos Private Credit': 'Private Credit',
  'Private Real Estate': 'Private Real Estate',
  'Alternativos Private Real Estate': 'Private Real Estate',
  'Private Equity': 'Private Equity',
  'Alternativos Private Equity': 'Private Equity',
}

export function canonicalLocalClass(raw: string): string {
  return LOCAL_ALIASES[raw] ?? raw
}
export function canonicalIntlClass(raw: string): string {
  return INTL_ALIASES[raw] ?? raw
}

// ─── Utility ──────────────────────────────────
export interface AllocationRow {
  cls: string
  actualValue: number   // in chosen base currency
  actualPct: number     // 0–100
  targetPct: number     // 0–100
  gapPct: number        // actual − target (positive = overweight)
  gapValue: number      // value to rebalance (in base currency)
}

/** Convert an asset value into a target currency given USD/BRL & EUR/BRL rates. */
export function convert(amount: number, from: 'BRL' | 'USD' | 'EUR', to: 'BRL' | 'USD' | 'EUR', usdToBrl: number, eurToBrl: number): number {
  const inBrl = from === 'USD' ? amount * usdToBrl : from === 'EUR' ? amount * eurToBrl : amount
  if (to === 'USD') return inBrl / usdToBrl
  if (to === 'EUR') return inBrl / eurToBrl
  return inBrl
}

/** Build allocation rows for a list of investments against a target table. */
export function buildAllocation(
  investments: Investment[],
  targets: Record<string, number>,
  canonicalize: (raw: string) => string,
  toBase: (amount: number, from: 'BRL' | 'USD' | 'EUR') => number,
): { rows: AllocationRow[]; totalValue: number } {
  // Sum value per canonical bucket (excludes physical real estate)
  const bucketValue = new Map<string, number>()
  let totalValue = 0
  investments.forEach(i => {
    if (i.location === 'physical-re') return
    const v = toBase(i.quantity * i.currentPrice, i.currency)
    if (v <= 0) return
    const bucket = canonicalize(i.assetClass)
    bucketValue.set(bucket, (bucketValue.get(bucket) ?? 0) + v)
    totalValue += v
  })

  // Build rows for every target bucket (and any extra buckets we found)
  const allBuckets = new Set<string>([
    ...Object.keys(targets),
    ...Array.from(bucketValue.keys()),
  ])

  // Preserve canonical target order; extras go after, sorted by actual desc
  const targetKeys = Object.keys(targets)
  const orderIndex = new Map<string, number>(targetKeys.map((k, i) => [k, i]))

  const rows: AllocationRow[] = Array.from(allBuckets).map(cls => {
    const actualValue = bucketValue.get(cls) ?? 0
    const actualPct   = totalValue > 0 ? (actualValue / totalValue) * 100 : 0
    const targetPct   = targets[cls] ?? 0
    const gapPct      = actualPct - targetPct
    const gapValue    = (gapPct / 100) * totalValue
    return { cls, actualValue, actualPct, targetPct, gapPct, gapValue }
  })

  rows.sort((a, b) => {
    const ai = orderIndex.has(a.cls) ? orderIndex.get(a.cls)! : Infinity
    const bi = orderIndex.has(b.cls) ? orderIndex.get(b.cls)! : Infinity
    if (ai !== bi) return ai - bi
    return b.actualPct - a.actualPct
  })

  return { rows, totalValue }
}
