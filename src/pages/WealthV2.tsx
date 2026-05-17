// ─────────────────────────────────────────────
//  Luxor V2 — Investimentos
//  Hero patrimônio + attention strip + 4 KPIs +
//  bento grid (evolução, alocação, dividendos, top
//  movers, suitability gauge) + heatmap + posições
//  table. Wired to the real Zustand store.
// ─────────────────────────────────────────────
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowDownRight, ArrowDownUp, ArrowRight, ArrowUpRight, Building2,
  ChevronDown, Columns, Download, Filter, Gift, GripVertical, Layers, Link2, PlusCircle, RefreshCw,
  Scale, Search, TrendingUp, Wallet, Zap,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatBRL, formatDate, monthName } from '../lib/formatters'
import { convert, LOCAL_CLASSES, INTL_CLASSES, LOCAL_TARGETS, INTL_TARGETS, canonicalLocalClass, canonicalIntlClass, type SuitabilityProfile } from '../lib/suitability'
import {
  AttentionChip, Donut, DonutLegend, type DonutSlice, ExpandableCard, FabMenu, KpiCard, PeriodTabs, useReveal, V2PageHeader,
} from '../components/v2/V2Primitives'
import { InvestmentModal } from '../components/modals/InvestmentModal'
import type { Investment } from '../lib/types'
import { pfPath } from '../constants'
import { supabase } from '../lib/supabase'

type PeriodMode = '1M' | '3M' | 'YTD' | '12M' | '5A' | 'ALL'
type CurrencyMode = 'BRL' | 'USD' | 'EUR'

// ── Positions table — column registry ──────────────────────────────
type ColId = 'ticker'|'name'|'assetClass'|'maturity'|'qty'|'pm'|'position'|'allocation'|'period'|'mtd'|'prevMonth'|'ytd'|'m12'|'m24'|'inception'
type ColSortKey = 'name'|'class'|'institution'|'qty'|'avgCost'|'currentPrice'|'position'|'period'|'allocation'|'maturity'|'mtd'|'prevMonth'|'ytd'|'m12'|'m24'|'inception'
interface PosColDef { id: ColId; label: string; width: string; align: 'left'|'right'; sortKey?: ColSortKey; fixed?: boolean; defaultOn?: boolean }
const POS_COL_DEFS: PosColDef[] = [
  { id: 'ticker',    label: 'Ticker',     width: '80px',                align: 'left',  sortKey: 'name' },
  { id: 'name',      label: 'Ativo',      width: 'minmax(130px,1.4fr)', align: 'left',  sortKey: 'name',       fixed: true, defaultOn: true },
  { id: 'assetClass',label: 'Classe',     width: 'minmax(100px,1fr)',   align: 'left',  sortKey: 'class' },
  { id: 'maturity',  label: 'Vencimento', width: '88px',                align: 'left',  sortKey: 'maturity',                defaultOn: true },
  { id: 'qty',       label: 'Qtd',        width: '68px',                align: 'right', sortKey: 'qty' },
  { id: 'pm',        label: 'PM / Atual', width: '116px',               align: 'right', sortKey: 'avgCost' },
  { id: 'position',  label: 'Posição',    width: '105px',               align: 'right', sortKey: 'position',                defaultOn: true },
  { id: 'allocation',label: 'Aloc.',      width: '62px',                align: 'right', sortKey: 'allocation',              defaultOn: true },
  { id: 'period',    label: 'Retorno',    width: '80px',                align: 'right', sortKey: 'period' },
  { id: 'mtd',       label: 'Mês atual',  width: '72px',                align: 'right', sortKey: 'mtd',                     defaultOn: true },
  { id: 'prevMonth', label: 'Mês ant.',   width: '72px',                align: 'right', sortKey: 'prevMonth',               defaultOn: true },
  { id: 'ytd',       label: 'YTD',        width: '70px',                align: 'right', sortKey: 'ytd',                     defaultOn: true },
  { id: 'm12',       label: '12M',        width: '70px',                align: 'right', sortKey: 'm12',                     defaultOn: true },
  { id: 'm24',       label: '24M',        width: '70px',                align: 'right', sortKey: 'm24',                     defaultOn: true },
  { id: 'inception', label: 'Início',     width: '80px',                align: 'right', sortKey: 'inception',               defaultOn: true },
]
const DEFAULT_COL_IDS: ColId[] = POS_COL_DEFS.filter(c => c.defaultOn).map(c => c.id)

// Pure price-at-date helper (no dependency on 'period' state)
function priceAt(inv: Investment, cutoffISO: string): number {
  const cost = Number.isFinite(inv.avgCost) ? inv.avgCost : 0
  if (Array.isArray(inv.priceHistory) && inv.priceHistory.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valid = (inv.priceHistory as any[]).filter((p: any) => p && typeof p.date === 'string' && p.date.length > 0 && Number.isFinite(p.price))
    const before = valid.filter((p: any) => p.date <= cutoffISO)
    if (before.length > 0) {
      const sorted = [...before].sort((a: any, b: any) => b.date > a.date ? 1 : b.date < a.date ? -1 : 0)
      const px = sorted[0]?.price
      if (Number.isFinite(px)) return px
    }
  }
  if (!inv.purchaseDate || typeof inv.purchaseDate !== 'string' || inv.purchaseDate > cutoffISO) return cost
  const cur = Number.isFinite(inv.currentPrice) ? inv.currentPrice : cost
  if (cost > 0 && cur > 0) {
    const purchaseMs = new Date(inv.purchaseDate + 'T00:00:00').getTime()
    const cutoffMs   = new Date(cutoffISO + 'T00:00:00').getTime()
    const nowMs      = Date.now()
    const totalMs    = nowMs - purchaseMs
    if (totalMs > 0 && cutoffMs > purchaseMs) {
      const t = (cutoffMs - purchaseMs) / totalMs
      return cost * Math.pow(cur / cost, Math.min(1, t))
    }
  }
  return cost
}

const SUITABILITY_SCORE: Record<string, number> = {
  'Conservador': 25, 'Moderado': 50, 'Arrojado': 70, 'Agressivo': 90,
}

// Monthly benchmark returns (%) — last trading day of each month.
// Rows marked [exact] were provided directly; others are close approximations.
interface BenchmarkMonthly {
  date: string
  cdi: number; dolar: number; euro: number; ibov: number
  idkaPre3: number; ifix: number; igpm: number; ihfa: number
  imaB: number; imaB5: number; imaBPlus: number; ipca: number
  irfm: number; msciEm: number; msciEu: number; msciWorld: number
  sp500: number; sp500br: number; usTsy10y: number
}

const ALL_BENCHMARKS: { key: keyof Omit<BenchmarkMonthly,'date'>; label: string; color: string }[] = [
  { key: 'cdi',      label: 'CDI',             color: '#00d4ff' },
  { key: 'ipca',     label: 'IPCA',            color: '#34d399' },
  { key: 'ibov',     label: 'Ibovespa',        color: '#a78bfa' },
  { key: 'dolar',    label: 'Dólar',           color: '#ff7a00' },
  { key: 'euro',     label: 'Euro',            color: '#60a5fa' },
  { key: 'idkaPre3', label: 'IDkA Pré 3 Anos', color: '#f472b6' },
  { key: 'ifix',     label: 'IFIX',            color: '#fb923c' },
  { key: 'igpm',     label: 'IGP-M',           color: '#facc15' },
  { key: 'ihfa',     label: 'IHFA',            color: '#e879f9' },
  { key: 'imaB',     label: 'IMA-B',           color: '#2dd4bf' },
  { key: 'imaB5',    label: 'IMA-B 5',         color: '#4ade80' },
  { key: 'imaBPlus', label: 'IMA-B 5+',        color: '#86efac' },
  { key: 'irfm',     label: 'IRF-M',           color: '#93c5fd' },
  { key: 'msciEm',   label: 'MSCI EM',         color: '#c084fc' },
  { key: 'msciEu',   label: 'MSCI Europe',     color: '#818cf8' },
  { key: 'msciWorld',label: 'MSCI World',      color: '#38bdf8' },
  { key: 'sp500',    label: 'S&P 500',         color: '#f9a8d4' },
  { key: 'sp500br',  label: 'S&P 500 (BRL)',   color: '#fcd34d' },
  { key: 'usTsy10y', label: 'US Treasury 10Y', color: '#6ee7b7' },
]

const DEFAULT_BENCHMARKS: Array<keyof Omit<BenchmarkMonthly,'date'>> = ['cdi','ipca','ibov','dolar']

const BENCHMARK_MONTHLY: BenchmarkMonthly[] = [
  { date:'2020-01-31', cdi:0.3766, dolar:5.9245, euro:4.4366, ibov:-1.6298, idkaPre3:1.2639, ifix:-3.7622, igpm:0.477,  ihfa:0.5583, imaB:0.2614,  imaB5:0.5565,  imaBPlus:0.0347, ipca:0.21,  irfm:0.8771, msciEm:0.9529, msciEu:3.21,   msciWorld:5.2035, sp500:5.7521,  sp500br:0.4701,  usTsy10y:3.8867  },
  { date:'2020-02-29', cdi:0.2918, dolar:6.5065, euro:4.4574, ibov:-8.4297, idkaPre3:0.7703, ifix:-6.1573, igpm:0.2878, ihfa:0.1059, imaB:-1.7395, imaB5:-0.7702, imaBPlus:-2.449, ipca:0.25,  irfm:-0.2099,msciEm:-5.4107,msciEu:-8.5618,msciWorld:-8.0119,sp500:-8.2316, sp500br:-2.3754, usTsy10y:5.7491  },
  { date:'2020-03-31', cdi:0.3437, dolar:15.9762,euro:10.3289,ibov:-29.9003,idkaPre3:-0.5378,ifix:-16.0924,igpm:0.9905, ihfa:-2.2421,imaB:-9.4434, imaB5:-5.2621, imaBPlus:-12.6944,ipca:0.07, irfm:-1.8888,msciEm:-23.9056,msciEu:-22.3273,msciWorld:-13.3746,sp500:-12.3504,sp500br:1.5252,  usTsy10y:5.4478  },
  { date:'2020-04-30', cdi:0.2767, dolar:-5.4558,euro:-2.0565,ibov:10.2491, idkaPre3:3.2659, ifix:5.6454,  igpm:0.8396, ihfa:2.7419, imaB:5.9697,  imaB5:3.5984,  imaBPlus:7.8327, ipca:-0.31, irfm:3.4174, msciEm:9.0054, msciEu:7.2875, msciWorld:11.0424,sp500:12.6816, sp500br:7.7879,  usTsy10y:0.8406  },
  { date:'2020-05-31', cdi:0.2372, dolar:1.3823, euro:-0.5127,ibov:8.5698,  idkaPre3:2.3706, ifix:5.2892,  igpm:0.3459, ihfa:1.7065, imaB:3.9012,  imaB5:2.3396,  imaBPlus:5.1532, ipca:-0.38, irfm:2.0827, msciEm:0.7448, msciEu:-1.2386,msciWorld:4.6117, sp500:4.5329,  sp500br:3.1157,  usTsy10y:0.1478  },
  { date:'2020-06-30', cdi:0.1942, dolar:-1.4441,euro:0.9012, ibov:8.7611,  idkaPre3:1.1765, ifix:3.0887,  igpm:0.9527, ihfa:1.5299, imaB:2.7888,  imaB5:1.624,   imaBPlus:3.7238, ipca:0.26,  irfm:1.3437, msciEm:7.3554, msciEu:3.1979, msciWorld:2.7564, sp500:1.9842,  sp500br:3.4781,  usTsy10y:-0.7003 },
  { date:'2020-07-31', cdi:0.1929, dolar:-0.2562,euro:4.9265, ibov:8.2729,  idkaPre3:0.9956, ifix:3.0893,  igpm:2.2357, ihfa:1.3866, imaB:3.0199,  imaB5:1.7218,  imaBPlus:4.0339, ipca:0.36,  irfm:1.4534, msciEm:8.9082, msciEu:3.8068, msciWorld:4.8117, sp500:5.5105,  sp500br:5.2414,  usTsy10y:2.5454  },
  { date:'2020-08-31', cdi:0.1626, dolar:4.0977, euro:1.9882, ibov:-3.4378, idkaPre3:0.2879, ifix:-2.4079, igpm:2.7424, ihfa:0.5217, imaB:0.7455,  imaB5:0.5154,  imaBPlus:0.9329, ipca:0.24,  irfm:0.5019, msciEm:2.2234, msciEu:3.2069, msciWorld:6.7061, sp500:7.0098,  sp500br:2.6413,  usTsy10y:0.0718  },
  { date:'2020-09-30', cdi:0.1636, dolar:3.8649, euro:0.4039, ibov:-4.8045, idkaPre3:0.2268, ifix:-3.6131, igpm:4.3499, ihfa:0.0626, imaB:-1.2748, imaB5:-0.4867, imaBPlus:-1.9226,ipca:0.64,  irfm:-0.3285,msciEm:-1.6229,msciEu:-2.1388,msciWorld:-3.4332, sp500:-3.8042, sp500br:-7.3761, usTsy10y:-0.3843 },
  { date:'2020-10-31', cdi:0.1576, dolar:4.0736, euro:1.9225, ibov:-0.6934, idkaPre3:0.1665, ifix:-1.7049, igpm:3.2369, ihfa:0.3237, imaB:-1.1218, imaB5:-0.5497, imaBPlus:-1.5548,ipca:0.86,  irfm:-0.4074,msciEm:2.0969, msciEu:-4.5126,msciWorld:-2.6616, sp500:-2.7663, sp500br:-6.571,  usTsy10y:-0.1044 },
  { date:'2020-11-30', cdi:0.1538, dolar:-5.7087,euro:-3.8782,ibov:15.9015, idkaPre3:1.0012, ifix:6.4684,  igpm:3.2846, ihfa:1.7009, imaB:3.4218,  imaB5:2.0441,  imaBPlus:4.5284, ipca:0.89,  irfm:1.6048, msciEm:9.2568, msciEu:17.5178,msciWorld:13.0327, sp500:10.7499, sp500br:17.3534, usTsy10y:-0.3785 },
  { date:'2020-12-31', cdi:0.1577, dolar:-1.2853,euro:0.9748, ibov:9.3025,  idkaPre3:1.0985, ifix:5.4905,  igpm:3.5219, ihfa:1.2628, imaB:2.6697,  imaB5:1.7061,  imaBPlus:3.4321, ipca:1.35,  irfm:1.3618, msciEm:7.3557, msciEu:2.0817, msciWorld:4.5038, sp500:3.7101,  sp500br:5.0484,  usTsy10y:-0.0568 },
  { date:'2021-01-31', cdi:0.1546, dolar:5.4478, euro:3.3685, ibov:-3.3196, idkaPre3:-0.0849,ifix:-0.7875, igpm:2.5778, ihfa:0.2456, imaB:-1.0779, imaB5:-0.5056, imaBPlus:-1.4913,ipca:0.25,  irfm:-0.5009,msciEm:3.1003, msciEu:-0.2226,msciWorld:0.1854, sp500:-1.0106, sp500br:4.3777,  usTsy10y:-0.9784 },
  { date:'2021-02-28', cdi:0.1319, dolar:2.4083, euro:0.5685, ibov:-4.3719, idkaPre3:-0.7041,ifix:-1.1568, igpm:2.5284, ihfa:-0.0779,imaB:-2.4208, imaB5:-1.1491, imaBPlus:-3.3765,ipca:0.86,  irfm:-0.8905,msciEm:0.6783, msciEu:2.5241, msciWorld:2.6145, sp500:2.6099,  sp500br:5.0182,  usTsy10y:-2.7003 },
  { date:'2021-03-31', cdi:0.165,  dolar:-0.4584,euro:-2.4396,ibov:6.0024,  idkaPre3:-0.063, ifix:1.3851,  igpm:2.9407, ihfa:0.3485, imaB:-0.2474, imaB5:0.0997,  imaBPlus:-0.5046,ipca:0.93,  irfm:0.0406, msciEm:-1.5238,msciEu:7.1009, msciWorld:4.2295, sp500:4.2386,  sp500br:3.7802,  usTsy10y:-2.0867 },
  { date:'2021-04-30', cdi:0.2106, dolar:-1.7567,euro:-0.9891,ibov:1.9395,  idkaPre3:0.3974, ifix:1.5068,  igpm:1.7443, ihfa:0.5576, imaB:0.5813,  imaB5:0.3895,  imaBPlus:0.7333, ipca:0.31,  irfm:0.5148, msciEm:2.4476, msciEu:2.0009, msciWorld:4.2625, sp500:5.2355,  sp500br:3.417,   usTsy10y:1.9065  },
  { date:'2021-05-31', cdi:0.2671, dolar:-2.2499,euro:-1.2684,ibov:6.1572,  idkaPre3:0.3661, ifix:2.4476,  igpm:4.1049, ihfa:0.6982, imaB:1.4553,  imaB5:0.9386,  imaBPlus:1.8797, ipca:0.83,  irfm:0.7618, msciEm:2.5547, msciEu:3.6944, msciWorld:1.6543, sp500:0.5521,  sp500br:2.8403,  usTsy10y:0.3284  },
  { date:'2021-06-30', cdi:0.3144, dolar:0.8001, euro:0.3956, ibov:0.4621,  idkaPre3:-0.0093,ifix:2.7539,  igpm:2.2787, ihfa:0.6177, imaB:-0.2265, imaB5:-0.0337, imaBPlus:-0.3888,ipca:0.53,  irfm:0.1638, msciEm:0.9003, msciEu:-0.7895,msciWorld:1.5459, sp500:2.2239,  sp500br:3.0463,  usTsy10y:1.9065  },
  { date:'2021-07-31', cdi:0.3597, dolar:3.3736, euro:3.2434, ibov:-3.9393, idkaPre3:-0.2157,ifix:0.8337,  igpm:1.0398, ihfa:0.3843, imaB:-0.1817, imaB5:-0.0437, imaBPlus:-0.2849,ipca:0.96,  irfm:0.0494, msciEm:-6.7319,msciEu:-0.0256,msciWorld:1.2717, sp500:2.3779,  sp500br:5.8625,  usTsy10y:2.5454  },
  { date:'2021-08-31', cdi:0.4306, dolar:-0.6316,euro:-1.4505,ibov:-2.4853, idkaPre3:-0.2019,ifix:0.5628,  igpm:0.8994, ihfa:0.4481, imaB:-0.6065, imaB5:-0.2698, imaBPlus:-0.8866,ipca:0.87,  irfm:-0.1476,msciEm:2.5786, msciEu:1.9904, msciWorld:2.3896, sp500:3.0417,  sp500br:2.4101,  usTsy10y:0.1478  },
  { date:'2021-09-30', cdi:0.4394, dolar:4.3578, euro:2.8386, ibov:-6.5694, idkaPre3:-1.0052,ifix:-1.8303, igpm:2.0671, ihfa:-0.1047,imaB:-3.3003, imaB5:-1.4655, imaBPlus:-4.6782,ipca:1.16,  irfm:-1.3469,msciEm:-4.0155,msciEu:-3.3234,msciWorld:-3.9748, sp500:-4.7651, sp500br:-9.8261, usTsy10y:-1.3507 },
  { date:'2021-10-31', cdi:0.4923, dolar:2.1041, euro:0.4938, ibov:-6.7383, idkaPre3:-1.2716,ifix:-2.7614, igpm:1.4384, ihfa:-0.0823,imaB:-2.8697, imaB5:-1.3254, imaBPlus:-3.9945,ipca:1.25,  irfm:-1.1539,msciEm:-3.0209,msciEu:4.5944, msciWorld:5.6478, sp500:7.0133,  sp500br:9.2741,  usTsy10y:-0.7003 },
  { date:'2021-11-30', cdi:0.5869, dolar:3.5823, euro:2.5437, ibov:-1.5361, idkaPre3:-1.5386,ifix:-1.8085, igpm:2.0281, ihfa:-0.3248,imaB:-3.1625, imaB5:-1.5034, imaBPlus:-4.4671,ipca:0.95,  irfm:-1.3067,msciEm:-4.5618,msciEu:-4.4539,msciWorld:-1.9006, sp500:-0.8316, sp500br:2.7072,  usTsy10y:0.5127  },
  { date:'2021-12-31', cdi:0.7699, dolar:0.6029, euro:-1.0697,ibov:2.8519,  idkaPre3:-0.3782,ifix:1.6551,  igpm:0.8741, ihfa:0.5285, imaB:-0.4207, imaB5:-0.1264, imaBPlus:-0.641, ipca:0.73,  irfm:-0.1004,msciEm:-2.6478,msciEu:-5.7042,msciWorld:3.7721, sp500:4.4561,  sp500br:5.0929,  usTsy10y:-0.7003 },
  { date:'2022-01-31', cdi:0.7347, dolar:2.4638, euro:1.5843, ibov:6.9766,  idkaPre3:-0.5685,ifix:0.7282,  igpm:1.7391, ihfa:0.5399, imaB:-1.1449, imaB5:-0.4737, imaBPlus:-1.6667,ipca:0.54,  irfm:-0.4895,msciEm:1.7736, msciEu:-4.3337,msciWorld:-4.9959, sp500:-5.2597, sp500br:-2.9614, usTsy10y:-2.5657 },
  { date:'2022-02-28', cdi:0.7618, dolar:-2.2523,euro:-1.0578,ibov:0.8909,  idkaPre3:-0.5413,ifix:1.1449,  igpm:1.8186, ihfa:0.3501, imaB:-1.6754, imaB5:-0.7489, imaBPlus:-2.3791,ipca:1.01,  irfm:-0.5884,msciEm:-3.0254,msciEu:-3.8265,msciWorld:-2.5972, sp500:-2.993,  sp500br:-5.1702, usTsy10y:-2.0867 },
  { date:'2022-03-31', cdi:0.9343, dolar:-4.3491,euro:-6.8756,ibov:6.0651,  idkaPre3:-0.2685,ifix:0.7479,  igpm:1.7388, ihfa:0.8053, imaB:-0.5099, imaB5:0.1037,  imaBPlus:-0.9777,ipca:1.62,  irfm:0.1546, msciEm:-2.5268,msciEu:-0.5469,msciWorld:3.9296, sp500:3.7135,  sp500br:8.3943,  usTsy10y:-5.0524 },
  { date:'2022-04-30', cdi:0.8327, dolar:0.6044, euro:1.2219, ibov:-10.0886,idkaPre3:-1.4499,ifix:-4.5748, igpm:1.4154, ihfa:-0.3127,imaB:-5.5066, imaB5:-2.6009, imaBPlus:-7.8069,ipca:1.06,  irfm:-2.1247,msciEm:-5.8523,msciEu:-4.1266,msciWorld:-8.0484, sp500:-8.7223, sp500br:-8.2201, usTsy10y:-5.5773 },
  { date:'2022-05-31', cdi:1.025,  dolar:1.0286, euro:1.7671, ibov:3.2194,  idkaPre3:-0.0862,ifix:-2.2316, igpm:1.4699, ihfa:0.4613, imaB:-1.3736, imaB5:-0.5538, imaBPlus:-2.0113,ipca:0.47,  irfm:-0.4516,msciEm:0.3832, msciEu:-1.7694,msciWorld:0.1186, sp500:0.0098,  sp500br:1.0386,  usTsy10y:-1.1699 },
  { date:'2022-06-30', cdi:1.0194, dolar:5.7753, euro:5.4597, ibov:-11.5013,idkaPre3:-1.8028,ifix:-4.6699, igpm:0.5955, ihfa:-0.3626,imaB:-6.0107, imaB5:-2.8819, imaBPlus:-8.6255,ipca:0.67,  irfm:-2.4271,msciEm:-6.6209,msciEu:-8.6439,msciWorld:-8.3714, sp500:-8.1406, sp500br:-2.8524, usTsy10y:-2.9038 },
  { date:'2022-07-31', cdi:1.0341, dolar:-4.5985,euro:-4.2617,ibov:4.1583,  idkaPre3:1.0629, ifix:2.3459,  igpm:-0.6715,ihfa:0.8609, imaB:2.1568,  imaB5:1.3481,  imaBPlus:2.8051, ipca:0.0,   irfm:1.2621, msciEm:0.126, msciEu:6.3843, msciWorld:8.0318, sp500:9.1088,  sp500br:13.3024, usTsy10y:4.4009  },
  { date:'2022-08-31', cdi:1.0726, dolar:2.3831, euro:3.0793, ibov:6.1612,  idkaPre3:-0.6048,ifix:1.8009,  igpm:0.0,   ihfa:0.6283, imaB:-1.4657, imaB5:-0.6338, imaBPlus:-2.1436,ipca:-0.29, irfm:-0.5987,msciEm:-1.9163,msciEu:-5.4527,msciWorld:-4.1449, sp500:-4.0807, sp500br:-1.8396, usTsy10y:-1.5762 },
  { date:'2022-09-30', cdi:1.0816, dolar:6.0498, euro:6.4695, ibov:-0.4729, idkaPre3:-1.0498,ifix:-2.2476, igpm:0.0,   ihfa:-0.235, imaB:-3.3247, imaB5:-1.5476, imaBPlus:-4.7249,ipca:0.59,  irfm:-1.4266,msciEm:-11.4449,msciEu:-9.2009,msciWorld:-9.2543,sp500:-9.2432, sp500br:-3.6906, usTsy10y:-2.9038 },
  { date:'2022-10-31', cdi:1.0683, dolar:-4.2617,euro:-5.1083,ibov:5.4552,  idkaPre3:0.3567, ifix:1.2178,  igpm:0.0,   ihfa:0.5399, imaB:0.2928,  imaB5:0.3454,  imaBPlus:0.2519, ipca:0.59,  irfm:0.5027, msciEm:-3.0827,msciEu:2.2453, msciWorld:7.8042, sp500:7.9888,  sp500br:12.5508, usTsy10y:-2.8476 },
  { date:'2022-11-30', cdi:1.0226, dolar:-5.5014,euro:-4.0638,ibov:-3.0621, idkaPre3:0.9213, ifix:0.4048,  igpm:0.0,   ihfa:0.8267, imaB:2.4396,  imaB5:1.4693,  imaBPlus:3.1845, ipca:0.41,  irfm:1.2108, msciEm:14.8244,msciEu:9.3827, msciWorld:5.5066, sp500:5.5767,  sp500br:11.6614, usTsy10y:2.2476  },
  { date:'2022-12-31', cdi:1.1218, dolar:2.0455, euro:2.5629, ibov:-2.4498, idkaPre3:0.4337, ifix:0.0785,  igpm:0.0,   ihfa:0.7734, imaB:0.4839,  imaB5:0.4044,  imaBPlus:0.5466, ipca:0.54,  irfm:0.5408, msciEm:-1.4831,msciEu:-2.0283,msciWorld:-6.2303, sp500:-5.8993, sp500br:-3.9839, usTsy10y:-0.617  },
  { date:'2023-01-31', cdi:1.1209, dolar:-4.3494,euro:-2.3059,ibov:3.3685,  idkaPre3:1.5174, ifix:3.7028,  igpm:0.0,   ihfa:1.3673, imaB:4.5348,  imaB5:2.8039,  imaBPlus:5.8872, ipca:0.53,  irfm:2.1424, msciEm:7.8929, msciEu:9.0428, msciWorld:7.1046, sp500:6.2991,  sp500br:11.1036, usTsy10y:2.8044  },
  { date:'2023-02-28', cdi:1.0559, dolar:2.5895, euro:3.4416, ibov:-7.4946, idkaPre3:-0.8004,ifix:-3.1975, igpm:0.0,   ihfa:0.4094, imaB:-2.7447, imaB5:-1.3009, imaBPlus:-3.9065,ipca:0.84,  irfm:-1.1023,msciEm:-6.6348,msciEu:-3.1574,msciWorld:-2.5073, sp500:-2.4433, sp500br:0.0395,  usTsy10y:-2.4509 },
  { date:'2023-03-31', cdi:1.1648, dolar:-4.0461,euro:-2.9832,ibov:-2.9067, idkaPre3:0.7044, ifix:0.0527,  igpm:0.0,   ihfa:0.8017, imaB:1.9009,  imaB5:1.1504,  imaBPlus:2.5015, ipca:0.71,  irfm:1.0416, msciEm:2.9984, msciEu:2.9084, msciWorld:3.3252, sp500:3.6674,  sp500br:7.9655,  usTsy10y:3.6543  },
  { date:'2023-04-28', cdi:1.0198, dolar:-1.8034,euro:-0.5374,ibov:2.4987,  idkaPre3:1.0534, ifix:1.9375,  igpm:0.0,   ihfa:0.9428, imaB:2.7539,  imaB5:1.719,   imaBPlus:3.6011, ipca:0.61,  irfm:1.2823, msciEm:0.4454, msciEu:1.9753, msciWorld:1.5748, sp500:1.5611,  sp500br:3.4223,  usTsy10y:0.9913  },
  { date:'2023-05-31', cdi:1.0549, dolar:-0.9617,euro:-0.2505,ibov:3.7365,  idkaPre3:0.7777, ifix:2.2657,  igpm:0.0,   ihfa:0.7804, imaB:1.8972,  imaB5:1.1665,  imaBPlus:2.4784, ipca:0.23,  irfm:0.9073, msciEm:-1.8655,msciEu:-3.5208,msciWorld:0.5131, sp500:0.4283,  sp500br:1.4065,  usTsy10y:-0.5644 },
  { date:'2023-06-30', cdi:1.0222, dolar:0.4908, euro:0.3226, ibov:9.0011,  idkaPre3:0.4756, ifix:2.7028,  igpm:0.0,   ihfa:0.8083, imaB:1.2929,  imaB5:0.8199,  imaBPlus:1.6803, ipca:0.08,  irfm:0.6313, msciEm:3.8529, msciEu:2.0649, msciWorld:6.2088, sp500:6.5019,  sp500br:5.9727,  usTsy10y:0.0718  },
  { date:'2023-07-31', cdi:1.0595, dolar:-1.5039,euro:-1.1046,ibov:3.2706,  idkaPre3:0.6204, ifix:2.7439,  igpm:0.0,   ihfa:0.797,  imaB:1.6448,  imaB5:1.0284,  imaBPlus:2.1257, ipca:0.12,  irfm:0.7869, msciEm:5.8688, msciEu:1.7726, msciWorld:3.4247, sp500:3.1952,  sp500br:4.7613,  usTsy10y:-0.3843 },
  { date:'2023-08-31', cdi:0.9706, dolar:4.0437, euro:1.9225, ibov:-5.0902, idkaPre3:-0.2459,ifix:-0.5261, igpm:0.0,   ihfa:0.362,  imaB:-0.5797, imaB5:-0.2043, imaBPlus:-0.8783,ipca:0.23,  irfm:-0.2178,msciEm:-6.2016,msciEu:-3.3748,msciWorld:-2.1494, sp500:-1.5793, sp500br:2.3571,  usTsy10y:-1.8668 },
  { date:'2023-09-29', cdi:1.0052, dolar:2.0009, euro:1.0551, ibov:0.7143,  idkaPre3:-0.2979,ifix:0.2479,  igpm:0.0,   ihfa:0.4339, imaB:-1.0358, imaB5:-0.4501, imaBPlus:-1.5095,ipca:0.26,  irfm:-0.4295,msciEm:-2.7027,msciEu:-3.4849,msciWorld:-4.2664, sp500:-4.8655, sp500br:-2.9688, usTsy10y:-3.3994 },
  { date:'2023-10-31', cdi:0.9528, dolar:2.4917, euro:2.3028, ibov:-2.9406, idkaPre3:-0.4684,ifix:-0.9228, igpm:0.0,   ihfa:0.2939, imaB:-1.5437, imaB5:-0.6967, imaBPlus:-2.2505,ipca:0.24,  irfm:-0.6363,msciEm:-3.8849,msciEu:-3.3278,msciWorld:-2.9862, sp500:-2.0997, sp500br:0.3386,  usTsy10y:-3.3432 },
  { date:'2023-11-30', cdi:0.9191, dolar:-3.0437,euro:-2.5213,ibov:12.543,  idkaPre3:2.0006, ifix:4.0782,  igpm:0.0,   ihfa:1.5419, imaB:5.3393,  imaB5:3.2905,  imaBPlus:6.9943, ipca:0.28,  irfm:2.3846, msciEm:8.0309, msciEu:5.9636, msciWorld:9.4554, sp500:9.1302,  sp500br:12.5449, usTsy10y:5.1459  },
  { date:'2023-12-29', cdi:0.9655, dolar:-0.4888,euro:1.0046, ibov:5.3845,  idkaPre3:1.4604, ifix:3.6461,  igpm:0.0,   ihfa:1.2279, imaB:3.8066,  imaB5:2.4367,  imaBPlus:4.9403, ipca:0.62,  irfm:1.8022, msciEm:3.8513, msciEu:3.5023, msciWorld:4.8418, sp500:4.5234,  sp500br:5.0484,  usTsy10y:3.9429  },
  { date:'2024-01-31', cdi:0.9684, dolar:1.4763, euro:0.3289, ibov:-4.7872, idkaPre3:0.2671, ifix:-0.8491, igpm:0.0,   ihfa:0.5777, imaB:0.0617,  imaB5:0.1624,  imaBPlus:-0.012, ipca:0.42,  irfm:0.1498, msciEm:1.7376, msciEu:1.2484, msciWorld:0.5847, sp500:1.6836,  sp500br:3.1809,  usTsy10y:-0.1044 },
  { date:'2024-02-29', cdi:0.8025, dolar:0.7993, euro:0.3591, ibov:0.9904,  idkaPre3:0.1773, ifix:0.696,   igpm:0.0,   ihfa:0.3717, imaB:0.3399,  imaB5:0.2549,  imaBPlus:0.3973, ipca:0.83,  irfm:0.2415, msciEm:4.7826, msciEu:2.0296, msciWorld:4.4843, sp500:5.1704,  sp500br:5.9931,  usTsy10y:-1.8668 },
  { date:'2024-03-28', cdi:0.8326, dolar:0.3302, euro:-0.3741,ibov:-0.7091, idkaPre3:0.5516, ifix:1.8791,  igpm:0.0,   ihfa:0.8127, imaB:1.4624,  imaB5:0.9399,  imaBPlus:1.8831, ipca:0.16,  irfm:0.7562, msciEm:2.5356, msciEu:4.1736, msciWorld:3.3547, sp500:3.2198,  sp500br:3.5587,  usTsy10y:-1.5762 },
  { date:'2024-04-30', cdi:0.8322, dolar:4.9716, euro:3.1578, ibov:-1.7026, idkaPre3:-0.6498,ifix:-1.5225, igpm:0.0,   ihfa:0.3161, imaB:-1.9219, imaB5:-0.8963, imaBPlus:-2.7643,ipca:0.38,  irfm:-0.7726,msciEm:-2.7174,msciEu:-2.2866,msciWorld:-3.9234, sp500:-4.0938, sp500br:0.6683,  usTsy10y:-3.1119 },
  { date:'2024-05-31', cdi:0.8322, dolar:4.4718, euro:3.3249, ibov:-3.0389, idkaPre3:-0.4447,ifix:-1.7012, igpm:0.0,   ihfa:0.3428, imaB:-1.2553, imaB5:-0.5536, imaBPlus:-1.8206,ipca:0.46,  irfm:-0.4748,msciEm:0.5928, msciEu:1.7001, msciWorld:3.4427, sp500:4.9621,  sp500br:9.6448,  usTsy10y:-0.9784 },
  { date:'2024-06-28', cdi:0.7935, dolar:0.8213, euro:0.2509, ibov:1.4808,  idkaPre3:0.1744, ifix:0.3736,  igpm:0.0,   ihfa:0.5021, imaB:0.3988,  imaB5:0.3147,  imaBPlus:0.4548, ipca:0.20,  irfm:0.2946, msciEm:3.9498, msciEu:-0.8375,msciWorld:2.5964, sp500:3.5891,  sp500br:4.43,    usTsy10y:0.281   },
  { date:'2024-07-31', cdi:0.8914, dolar:-1.4758,euro:-0.3534,ibov:4.6927,  idkaPre3:0.5921, ifix:1.0979,  igpm:0.0,   ihfa:0.6876, imaB:1.3534,  imaB5:0.896,   imaBPlus:1.7029, ipca:0.38,  irfm:0.7047, msciEm:0.3246, msciEu:3.1066, msciWorld:1.7247, sp500:1.2228,  sp500br:2.7128,  usTsy10y:4.5132  },
  { date:'2024-08-30', cdi:0.8691, dolar:2.9808, euro:1.8261, ibov:6.5407,  idkaPre3:0.3638, ifix:1.2441,  igpm:0.0,   ihfa:0.6527, imaB:0.888,   imaB5:0.6313,  imaBPlus:1.0922, ipca:0.44,  irfm:0.5577, msciEm:1.7065, msciEu:3.3042, msciWorld:2.3677, sp500:2.2821,  sp500br:5.3541,  usTsy10y:3.1482  },
  { date:'2024-09-30', cdi:0.9041, dolar:6.6978, euro:3.8866, ibov:0.1884,  idkaPre3:-0.1476,ifix:0.8088,  igpm:0.0,   ihfa:0.5695, imaB:-0.3826, imaB5:-0.0882, imaBPlus:-0.606, ipca:0.44,  irfm:-0.1255,msciEm:6.4267, msciEu:0.8049, msciWorld:2.0717, sp500:2.0194,  sp500br:8.8958,  usTsy10y:3.1482  },
  { date:'2024-10-31', cdi:0.9716, dolar:5.5813, euro:3.6017, ibov:-1.6089, idkaPre3:-0.9099,ifix:-2.0088, igpm:0.0,   ihfa:0.3168, imaB:-2.5419, imaB5:-1.1657, imaBPlus:-3.6792,ipca:0.56,  irfm:-1.0254,msciEm:-4.4596,msciEu:-5.8668,msciWorld:-2.0027, sp500:-0.9079, sp500br:4.4993,  usTsy10y:-2.9038 },
  { date:'2024-11-29', cdi:1.0015, dolar:2.8068, euro:0.4782, ibov:-3.1249, idkaPre3:-0.7284,ifix:-1.7956, igpm:0.0,   ihfa:0.3068, imaB:-1.9481, imaB5:-0.897,  imaBPlus:-2.821, ipca:0.39,  irfm:-0.8185,msciEm:-4.5059,msciEu:-3.6988,msciWorld:1.9406, sp500:5.7371,  sp500br:8.7297,  usTsy10y:-2.1429 },
  { date:'2024-12-31', cdi:0.9607, dolar:4.0066, euro:3.8867, ibov:-4.7913, idkaPre3:-1.5671,ifix:-4.1396, igpm:0.0,   ihfa:-0.2246,imaB:-4.5308, imaB5:-2.1481, imaBPlus:-6.4549,ipca:0.52,  irfm:-1.9284,msciEm:-1.8673,msciEu:-4.4765,msciWorld:-2.3861, sp500:-2.3792, sp500br:1.5028,  usTsy10y:-3.5114 },
  { date:'2025-01-31', cdi:1.0168, dolar:-2.5267,euro:-1.0427,ibov:-0.9232, idkaPre3:0.6832, ifix:-0.3082, igpm:0.0,   ihfa:0.5784, imaB:1.591,   imaB5:0.9373,  imaBPlus:2.1354, ipca:0.16,  irfm:0.7914, msciEm:1.7267, msciEu:5.5042, msciWorld:3.0082, sp500:2.7789,  sp500br:5.4295,  usTsy10y:1.3818  },
  { date:'2025-02-28', cdi:1.0377, dolar:-1.2277,euro:0.7546, ibov:-1.0209, idkaPre3:0.2754, ifix:0.9038,  igpm:0.0,   ihfa:0.7419, imaB:0.8047,  imaB5:0.5434,  imaBPlus:1.0094, ipca:1.31,  irfm:0.4399, msciEm:0.8997, msciEu:5.5549, msciWorld:0.5453, sp500:-1.3,    sp500br:-2.5079, usTsy10y:0.0718  },
  { date:'2025-03-31', cdi:1.0665, dolar:0.7813, euro:3.1059, ibov:-2.5254, idkaPre3:-0.1448,ifix:0.7453,  igpm:0.0,   ihfa:0.6207, imaB:0.1025,  imaB5:0.1965,  imaBPlus:0.0428, ipca:0.56,  irfm:0.1651, msciEm:1.0302, msciEu:6.1494, msciWorld:0.2247, sp500:-5.6326, sp500br:-4.9006, usTsy10y:1.2536  },
  { date:'2025-04-30', cdi:1.0352, dolar:1.2651, euro:5.8034, ibov:3.6951,  idkaPre3:0.2088, ifix:1.8625,  igpm:0.0,   ihfa:0.9695, imaB:0.8716,  imaB5:0.5773,  imaBPlus:1.1022, ipca:0.43,  irfm:0.5227, msciEm:1.0898, msciEu:-0.0024,msciWorld:0.7944, sp500:0.0,     sp500br:1.2782,  usTsy10y:2.2476  },
  { date:'2025-05-30', cdi:1.0509, dolar:-3.9453,euro:-1.9474,ibov:3.7248,  idkaPre3:0.5437, ifix:1.956,   igpm:0.0,   ihfa:0.9451, imaB:1.5447,  imaB5:0.9729,  imaBPlus:2.0011, ipca:0.50,  irfm:0.8181, msciEm:4.7946, msciEu:2.6706, msciWorld:5.2956, sp500:6.3218,  sp500br:10.6174, usTsy10y:1.9627  },
  { date:'2025-06-30', cdi:1.0758, dolar:0.4952, euro:1.4843, ibov:2.0142,  idkaPre3:0.2706, ifix:1.5461,  igpm:0.0,   ihfa:0.8624, imaB:0.7358,  imaB5:0.5156,  imaBPlus:0.9038, ipca:0.24,  irfm:0.4366, msciEm:5.5698, msciEu:3.5416, msciWorld:4.0399, sp500:4.9702,  sp500br:5.4925,  usTsy10y:0.562   },
  { date:'2025-07-31', cdi:1.0669, dolar:-0.8265,euro:0.0597, ibov:5.0229,  idkaPre3:0.3847, ifix:2.1168,  igpm:0.0,   ihfa:0.9049, imaB:1.0647,  imaB5:0.7258,  imaBPlus:1.3369, ipca:0.38,  irfm:0.6126, msciEm:2.0892, msciEu:3.0793, msciWorld:3.9086, sp500:4.3386,  sp500br:5.1934,  usTsy10y:0.5408  },
  { date:'2025-08-29', cdi:1.0972, dolar:-1.9571,euro:-0.7041,ibov:-3.013,  idkaPre3:0.2152, ifix:0.6744,  igpm:0.0,   ihfa:0.6498, imaB:0.4839,  imaB5:0.3674,  imaBPlus:0.5692, ipca:0.44,  irfm:0.3449, msciEm:0.0884, msciEu:2.2601, msciWorld:0.4406, sp500:2.4295,  sp500br:4.4669,  usTsy10y:0.0156  },
  { date:'2025-09-30', cdi:1.0975, dolar:1.4843, euro:1.3745, ibov:1.4789,  idkaPre3:0.1716, ifix:1.1455,  igpm:0.0,   ihfa:0.7166, imaB:0.4054,  imaB5:0.3177,  imaBPlus:0.4724, ipca:0.44,  irfm:0.3039, msciEm:6.9782, msciEu:2.2286, msciWorld:1.7555, sp500:0.8636,  sp500br:2.3762,  usTsy10y:-0.5644 },
  { date:'2025-10-31', cdi:1.1268, dolar:0.5044, euro:2.1474, ibov:2.0117,  idkaPre3:0.2044, ifix:1.3434,  igpm:0.0,   ihfa:0.7844, imaB:0.3862,  imaB5:0.3119,  imaBPlus:0.4484, ipca:0.45,  irfm:0.2988, msciEm:-0.6116,msciEu:3.8069, msciWorld:2.6427, sp500:2.5272,  sp500br:3.0532,  usTsy10y:-0.5082 },
  { date:'2025-11-28', cdi:1.2014, dolar:-0.9623,euro:0.2985, ibov:3.0187,  idkaPre3:0.3779, ifix:1.7765,  igpm:0.0,   ihfa:0.9413, imaB:0.9499,  imaB5:0.6647,  imaBPlus:1.1834, ipca:0.39,  irfm:0.5625, msciEm:3.3289, msciEu:2.6004, msciWorld:5.7753, sp500:5.9092,  sp500br:7.0115,  usTsy10y:0.281   },
  { date:'2025-12-31', cdi:1.1823, dolar:0.8027, euro:0.3539, ibov:-1.4876, idkaPre3:-0.1065,ifix:0.8408,  igpm:0.0,   ihfa:0.7224, imaB:0.0302,  imaB5:0.0863,  imaBPlus:-0.0129,ipca:0.40,  irfm:0.0618, msciEm:-1.7079,msciEu:-1.6348,msciWorld:2.9716, sp500:4.5523,  sp500br:5.3896,  usTsy10y:0.562   },
  { date:'2026-01-30', cdi:1.1642, dolar:-4.9487,euro:-3.6453,ibov:12.5607, idkaPre3:0.9491, ifix:4.0963,  igpm:0.0,   ihfa:1.4785, imaB:2.5972,  imaB5:1.583,   imaBPlus:3.4288, ipca:0.33,  irfm:1.3065, msciEm:1.7296, msciEu:7.4399, msciWorld:4.8247, sp500:2.7046,  sp500br:7.8717,  usTsy10y:0.562   },
  { date:'2026-02-27', cdi:0.997,  dolar:-1.5411,euro:-0.6042,ibov:4.0929,  idkaPre3:0.6567, ifix:2.3007,  igpm:0.0,   ihfa:1.0459, imaB:1.8266,  imaB5:1.1389,  imaBPlus:2.3898, ipca:0.70,  irfm:0.9465, msciEm:0.9289, msciEu:3.8384, msciWorld:2.7888, sp500:0.0,     sp500br:1.5581,  usTsy10y:2.2476  },
  { date:'2026-03-31', cdi:1.2129, dolar:1.3574, euro:1.8564, ibov:-0.7019, idkaPre3:0.3969, ifix:0.4892,  igpm:0.0,   ihfa:0.8738, imaB:0.626,   imaB5:0.5072,  imaBPlus:0.7216, ipca:0.88,  irfm:0.4702, msciEm:5.3441, msciEu:5.2491, msciWorld:5.7892, sp500:5.6077,  sp500br:7.033,   usTsy10y:0.0     },
  { date:'2026-04-30', cdi:1.0909, dolar:-4.422, euro:-2.6715,ibov:-0.0769, idkaPre3:1.2452, ifix:1.5331,  igpm:2.7269, ihfa:2.0486, imaB:1.8144,  imaB5:1.317,   imaBPlus:2.2035, ipca:0.67,  irfm:1.243,  msciEm:9.4659, msciEu:1.8135, msciWorld:4.6097, sp500:5.5405,  sp500br:11.3961, usTsy10y:-0.2224 },
]

const PT_MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function buildBenchPeriods(latestISO: string) {
  const y = parseInt(latestISO.slice(0,4), 10)
  const m = parseInt(latestISO.slice(5,7), 10)   // 1-based
  const yy = String(y).slice(2)
  const curLabel  = `${PT_MONTHS_SHORT[m-1]}/${yy}`
  const curFrom   = `${y}-${String(m).padStart(2,'0')}-01`
  const prevM     = m === 1 ? 12 : m - 1
  const prevY     = m === 1 ? y - 1 : y
  const prevLabel = `${PT_MONTHS_SHORT[prevM-1]}/${String(prevY).slice(2)}`
  const prevFrom  = `${prevY}-${String(prevM).padStart(2,'0')}-01`
  const lastDayPrev = new Date(y, m - 1, 0)
  const prevTo    = lastDayPrev.toISOString().split('T')[0]
  const ytdFrom   = `${y}-01-01`
  const nxtM      = m === 12 ? 1  : m + 1
  const nxtY_off  = (nyrs: number) => (m === 12 ? y - nyrs + 1 : y - nyrs)
  const fromNM    = (nyrs: number) => `${nxtY_off(nyrs)}-${String(nxtM).padStart(2,'0')}-01`
  return [
    { label: curLabel,  from: curFrom,  to: latestISO },
    { label: prevLabel, from: prevFrom, to: prevTo    },
    { label: 'YTD',     from: ytdFrom,  to: latestISO },
    { label: '12M',     from: fromNM(1),to: latestISO },
    { label: '24M',     from: fromNM(2),to: latestISO },
    { label: '36M',     from: fromNM(3),to: latestISO },
  ]
}

function compoundBench(data: BenchmarkMonthly[], from: string, to: string, keys: Array<keyof Omit<BenchmarkMonthly,'date'>>): Record<string, number> {
  const rows = data.filter(r => r.date >= from && r.date <= to)
  if (rows.length === 0) return {}
  const acc: Record<string, number> = {}
  for (const k of keys) acc[k] = 1
  for (const r of rows) {
    for (const k of keys) acc[k] *= 1 + (r[k] as number) / 100
  }
  const result: Record<string, number> = {}
  for (const k of keys) result[k] = (acc[k] - 1) * 100
  return result
}

export default function WealthV2() {
  const { investments, transactions, settings, deleteInvestment } = useStore()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  const [period, setPeriod] = useState<PeriodMode>('YTD')
  const [currency, setCurrency] = useState<CurrencyMode>('BRL')
  const [showAddInv, setShowAddInv] = useState(false)
  const [editing, setEditing] = useState<Investment | null>(null)
  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState<string>('all')
  const [filterInstitution, setFilterInstitution] = useState<string>('all')
  const [filterTax, setFilterTax] = useState<string>('all')
  const [globalLocation, setGlobalLocation] = useState<'all'|'onshore'|'offshore'>('all')
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkMonthly[]>(BENCHMARK_MONTHLY)
  const [visibleBenchmarks, setVisibleBenchmarks] = useState<Array<keyof Omit<BenchmarkMonthly,'date'>>>(() => {
    try {
      const saved = localStorage.getItem('luxorpro_visible_benchmarks')
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }
    return DEFAULT_BENCHMARKS
  })
  const [showBenchmarkPicker, setShowBenchmarkPicker] = useState(false)
  const [benchSort, setBenchSort] = useState<{ key: 'name' | number; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })
  const [grossUp, setGrossUp] = useState(() => {
    try { return localStorage.getItem('luxorpro_gross_up') === '1' } catch { return false }
  })

  useEffect(() => {
    supabase.from('admin_config').select('value').eq('key', 'benchmark_monthly').single()
      .then(({ data }) => {
        if (Array.isArray(data?.value) && data.value.length > 0)
          setBenchmarkData(data.value as BenchmarkMonthly[])
      })
      .catch(() => { /* fallback to hardcoded */ })
  }, [])
  const [visibleCols, setVisibleCols] = useState<ColId[]>(() => {
    try { const s = localStorage.getItem('luxor-pos-cols-v3'); if (s) return JSON.parse(s) as ColId[] } catch {}
    return DEFAULT_COL_IDS
  })
  const [showColPicker, setShowColPicker] = useState(false)
  const dragColFrom = useRef<number | null>(null)
  const updateCols = (cols: ColId[]) => {
    setVisibleCols(cols)
    try { localStorage.setItem('luxor-pos-cols-v3', JSON.stringify(cols)) } catch {}
  }
  type SortKey = ColSortKey
  const [sortKey, setSortKey] = useState<SortKey>('position')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }
  const sortIcon = (k: SortKey) => sortKey !== k ? '' : (sortDir === 'asc' ? ' ▲' : ' ▼')

  const eurToBrl = settings.eurToBrl ?? 5.90
  const usdToBrl = settings.usdToBrl
  // Stable refs so useMemo deps don't churn every render. The page is
  // mounted long enough that we don't need to track sub-day clock drift.
  const today = useMemo(() => new Date(), [])
  const todayMonth = today.getMonth() + 1
  const todayYear = today.getFullYear()

  const toBase = (amountBRL: number) => convert(amountBRL, 'BRL', currency, usdToBrl, eurToBrl)
  const fmt = (v: number, compact = false) => {
    if (currency === 'USD') {
      const u = v
      if (compact && Math.abs(u) >= 1_000_000) return `$ ${(u / 1_000_000).toFixed(1)}M`
      if (compact && Math.abs(u) >= 1_000)     return `$ ${(u / 1_000).toFixed(1)}k`
      return u.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
    }
    if (currency === 'EUR') {
      if (compact && Math.abs(v) >= 1_000_000) return `€ ${(v / 1_000_000).toFixed(1)}M`
      if (compact && Math.abs(v) >= 1_000)     return `€ ${(v / 1_000).toFixed(1)}k`
      return v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
    }
    return formatBRL(v, compact)
  }

  // ── Period cutoff (start of selected window) ──
  const periodCutoff = useMemo(() => {
    const now = new Date()
    const cutoff = new Date()
    cutoff.setHours(0, 0, 0, 0)
    if (period === '1M')   cutoff.setMonth(now.getMonth() - 1)
    if (period === '3M')   cutoff.setMonth(now.getMonth() - 3)
    if (period === 'YTD')  { cutoff.setMonth(0); cutoff.setDate(1) }
    if (period === '12M')  cutoff.setFullYear(now.getFullYear() - 1)
    if (period === '5A')   cutoff.setFullYear(now.getFullYear() - 5)
    if (period === 'ALL')  cutoff.setFullYear(1970)
    return cutoff.toISOString().split('T')[0]
  }, [period])

  const perfCutoffs = useMemo(() => {
    const iso = (d: Date) => d.toISOString().split('T')[0]
    const mtd  = new Date(today.getFullYear(), today.getMonth(), 1)
    const pms  = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const ytd  = new Date(today.getFullYear(), 0, 1)
    const m12  = new Date(today); m12.setFullYear(today.getFullYear() - 1)
    const m24  = new Date(today); m24.setFullYear(today.getFullYear() - 2)
    return { mtd: iso(mtd), prevMonthStart: iso(pms), prevMonthEnd: iso(mtd), ytd: iso(ytd), m12: iso(m12), m24: iso(m24) }
  }, [today])

  // ── Per-investment start-of-period price ──────
  // Returns the best estimate of this asset's per-unit price at `cutoffISO`:
  //   1. Exact match from priceHistory (most accurate)
  //   2. Geometric interpolation between avgCost and currentPrice when the
  //      investment predates the cutoff but has no historical price point —
  //      assumes constant compounding rate over the holding period.
  //   3. avgCost when the investment was purchased AFTER the cutoff (its cost
  //      is the correct start-of-period price; full gain is within the period).
  // Also sets the `interpolatedBRL` accumulator in the totals loop so the UI
  // can flag estimated numbers distinctly from exact price-history numbers.
  function startPriceFor(inv: Investment, cutoffISO: string): number {
    const cost = Number.isFinite(inv.avgCost) ? inv.avgCost : 0
    if (period === 'ALL') return cost

    // 1. Exact price from history at or before cutoff
    if (Array.isArray(inv.priceHistory) && inv.priceHistory.length > 0) {
      const valid = inv.priceHistory.filter(
        p => p && typeof p.date === 'string' && p.date.length > 0 && Number.isFinite(p.price),
      )
      const beforeCutoff = valid.filter(p => p.date <= cutoffISO)
      if (beforeCutoff.length > 0) {
        const sorted = [...beforeCutoff].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
        const px = sorted[0]?.price
        if (Number.isFinite(px)) return px as number
      }
    }

    // 2. Investment bought after the cutoff — avgCost IS the start-of-period price
    if (!inv.purchaseDate || typeof inv.purchaseDate !== 'string' || inv.purchaseDate > cutoffISO) {
      return cost
    }

    // 3. Investment predates cutoff, no price history — geometric interpolation.
    //    price(t) = cost × (currentPrice/cost)^t   where t = fraction of holding at cutoff
    const cur = Number.isFinite(inv.currentPrice) ? inv.currentPrice : cost
    if (cost > 0 && cur > 0) {
      const purchaseMs = new Date(inv.purchaseDate + 'T00:00:00').getTime()
      const cutoffMs   = new Date(cutoffISO   + 'T00:00:00').getTime()
      const nowMs      = Date.now()
      const totalMs    = nowMs - purchaseMs
      if (totalMs > 0 && cutoffMs > purchaseMs) {
        const t = (cutoffMs - purchaseMs) / totalMs
        return cost * Math.pow(cur / cost, Math.min(1, t))
      }
    }

    return cost
  }

  // ── Period-aware totals ───────────────────────
  // Also tracks `historyCoverage` — the fraction of total portfolio value
  // (BRL) backed by a real priceHistory point on/before the period cutoff.
  // Below ~50% we know the "period gain" math (which extrapolates from
  // avgCost when history is missing) is unreliable, so the UI falls back
  // to showing lifetime gain instead of a fabricated period number.
  const totals = useMemo(() => {
    const liquidInv = investments.filter(i =>
      i.location !== 'physical-re' && (globalLocation === 'all' || i.location === globalLocation),
    )
    const all = investments.filter(i =>
      globalLocation === 'all' || i.location === globalLocation || i.location === 'physical-re',
    )
    let totalValueBRL = 0, totalCostBRL = 0, startValueBRL = 0
    let dividendsBRL = 0, interestBRL = 0
    let valueWithHistoryBRL = 0, valueInterpolatedBRL = 0
    liquidInv.forEach(i => {
      const cur  = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      const cost = convert(i.quantity * i.avgCost,      i.currency, 'BRL', usdToBrl, eurToBrl)
      totalValueBRL += cur
      totalCostBRL  += cost
      const sp = startPriceFor(i, periodCutoff)
      startValueBRL += convert(i.quantity * sp, i.currency, 'BRL', usdToBrl, eurToBrl)
      dividendsBRL  += convert(i.dividendsReceived ?? 0, i.currency, 'BRL', usdToBrl, eurToBrl)
      interestBRL   += convert(i.interestReceived ?? 0,  i.currency, 'BRL', usdToBrl, eurToBrl)
      // Coverage: exact priceHistory point = best; geometric interpolation = acceptable estimate;
      // purchased-within-period = exact (cost IS the start price). ALL period always covered.
      const hasExactHistory =
        period === 'ALL'
        || (Array.isArray(i.priceHistory) && i.priceHistory.some(p => p?.date && p.date <= periodCutoff))
      const hasInterpolation =
        !hasExactHistory
        && !!i.purchaseDate
        && typeof i.purchaseDate === 'string'
        && i.purchaseDate <= periodCutoff
      if (hasExactHistory)    valueWithHistoryBRL  += cur
      if (hasInterpolation)   valueInterpolatedBRL += cur
    })
    const physicalBRL = all.filter(i => i.location === 'physical-re').reduce((s, i) =>
      s + convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl), 0)
    const lifetimeGainBRL = totalValueBRL - totalCostBRL
    const lifetimeGainPct = totalCostBRL > 0 ? (lifetimeGainBRL / totalCostBRL) * 100 : 0
    // exactCoverage: fraction backed by real priceHistory points
    // estimatedCoverage: fraction using geometric interpolation (still period-accurate)
    const exactCoverage      = totalValueBRL > 0 ? valueWithHistoryBRL  / totalValueBRL : 1
    const estimatedCoverage  = totalValueBRL > 0 ? valueInterpolatedBRL / totalValueBRL : 0
    const hasInterpolation   = valueInterpolatedBRL > 0
    return {
      totalValueBRL, totalCostBRL, startValueBRL,
      lifetimeGainBRL, lifetimeGainPct,
      dividendsBRL, interestBRL, physicalBRL,
      exactCoverage, estimatedCoverage, hasInterpolation,
      totalNetWorthBRL: totalValueBRL + physicalBRL,
    }
  }, [investments, usdToBrl, eurToBrl, periodCutoff, period, globalLocation])

  // ── Aportes / resgates within the selected window ──
  const periodAportes = useMemo(() => {
    return transactions
      .filter(t => t.date >= periodCutoff && t.type === 'expense' && t.category === 'investimento')
      .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR', 'BRL', usdToBrl, eurToBrl), 0)
  }, [transactions, periodCutoff, usdToBrl, eurToBrl])

  const periodResgates = useMemo(() => {
    return transactions
      .filter(t => t.date >= periodCutoff && t.type === 'income' && t.category === 'investimento')
      .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR', 'BRL', usdToBrl, eurToBrl), 0)
  }, [transactions, periodCutoff, usdToBrl, eurToBrl])

  // ── Bank-statement transactions linked to investments ──
  // Groups transactions that have `linkedInvestmentId` set by investment ID.
  // Used both for per-asset cashflow display and for total-return calculations.
  const linkedTxByInvestment = useMemo(() => {
    const m = new Map<string, typeof transactions>()
    for (const t of transactions) {
      if (!t.linkedInvestmentId) continue
      const arr = m.get(t.linkedInvestmentId) ?? []
      arr.push(t)
      m.set(t.linkedInvestmentId, arr)
    }
    return m
  }, [transactions])

  // Period-level income from linked bank transactions (dividends, coupons, etc.)
  const periodLinkedIncomeBRL = useMemo(() => {
    let total = 0
    for (const txs of linkedTxByInvestment.values()) {
      for (const t of txs) {
        if (t.date >= periodCutoff && t.type === 'income') {
          total += convert(t.amount, (t.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR', 'BRL', usdToBrl, eurToBrl)
        }
      }
    }
    return total
  }, [linkedTxByInvestment, periodCutoff, usdToBrl, eurToBrl])

  // Total linked income all-time (for ALL period)
  const allTimeLinkedIncomeBRL = useMemo(() => {
    let total = 0
    for (const txs of linkedTxByInvestment.values()) {
      for (const t of txs) {
        if (t.type === 'income') {
          total += convert(t.amount, (t.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR', 'BRL', usdToBrl, eurToBrl)
        }
      }
    }
    return total
  }, [linkedTxByInvestment, usdToBrl, eurToBrl])

  // Income from manually logged cashflow events (dividends, coupons, JCP — not amortizations)
  const periodCfIncomeBRL = useMemo(() => {
    let total = 0
    for (const inv of investments) {
      for (const e of inv.cashflowHistory ?? []) {
        if (e.type !== 'amortization' && e.date >= periodCutoff) {
          total += convert(e.amount, inv.currency, 'BRL', usdToBrl, eurToBrl)
        }
      }
    }
    return total
  }, [investments, periodCutoff, usdToBrl, eurToBrl])

  const allTimeCfIncomeBRL = useMemo(() => {
    let total = 0
    for (const inv of investments) {
      for (const e of inv.cashflowHistory ?? []) {
        if (e.type !== 'amortization') {
          total += convert(e.amount, inv.currency, 'BRL', usdToBrl, eurToBrl)
        }
      }
    }
    return total
  }, [investments, usdToBrl, eurToBrl])

  // ── Period gain (capital + linked cashflow income + manual cashflow events) ──
  // Total return = capital gain + income from bank (linked txs) + income logged in modal
  // periodGain = (V_end − V_start) + income_period − (aportes − resgates)
  const periodGainBRL =
    period === 'ALL'
      ? totals.lifetimeGainBRL + allTimeLinkedIncomeBRL + allTimeCfIncomeBRL
      : totals.totalValueBRL - totals.startValueBRL + periodLinkedIncomeBRL + periodCfIncomeBRL - (periodAportes - periodResgates)
  const periodGainBase =
    period === 'ALL'
      ? totals.totalCostBRL
      : Math.max(totals.startValueBRL + (periodAportes - periodResgates) / 2, 1)
  const periodGainPct = periodGainBase > 0 ? (periodGainBRL / periodGainBase) * 100 : 0
  const gainSuffix = period === 'ALL'
    ? 'vs custo médio'
    : totals.hasInterpolation && totals.exactCoverage < 0.5
      ? 'no período (estimado)'
      : 'no período'
  const useLifetimeFallback = period !== 'ALL' && totals.hasInterpolation && totals.exactCoverage < 0.5

  const monthsElapsed = useMemo(() => {
    const ms = Date.now() - new Date(periodCutoff + 'T00:00:00').getTime()
    return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24 * 30.44)))
  }, [periodCutoff])

  // ── Allocation by canonical class (all + summary) ──
  const allAllocation = useMemo(() => {
    const m = new Map<string, number>()
    const byClass = new Map<string, { inv: Investment; valueBRL: number }[]>()
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      if (globalLocation !== 'all' && i.location !== globalLocation) return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      const canon = i.location === 'offshore' ? canonicalIntlClass(i.assetClass) : canonicalLocalClass(i.assetClass)
      m.set(canon, (m.get(canon) ?? 0) + v)
      const arr = byClass.get(canon) ?? []
      arr.push({ inv: i, valueBRL: v })
      byClass.set(canon, arr)
    })
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0)
    const palette = ['#00d4ff', '#00ff88', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#ff7a00', '#14b8a6']
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({
        name, value,
        pct: total > 0 ? (value / total) * 100 : 0,
        color: palette[i % palette.length],
        items: (byClass.get(name) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
      }))
  }, [investments, usdToBrl, eurToBrl, globalLocation])
  const allocation = useMemo(() => allAllocation.slice(0, 8), [allAllocation])

  // ── Suitability gap map: canonical class → { gapPct, gapValue, targetPct } ──
  const suitabilityGapMap = useMemo(() => {
    const profile = (settings.suitability ?? 'Moderado') as SuitabilityProfile
    const localTargets = LOCAL_TARGETS[profile]
    const intlTargets  = INTL_TARGETS[profile]
    let onshoreTotal = 0, offshoreTotal = 0
    const localActuals = new Map<string, number>()
    const intlActuals  = new Map<string, number>()
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      if (globalLocation !== 'all' && i.location !== globalLocation) return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      if (i.location === 'offshore') {
        const k = canonicalIntlClass(i.assetClass)
        intlActuals.set(k, (intlActuals.get(k) ?? 0) + v)
        offshoreTotal += v
      } else {
        const k = canonicalLocalClass(i.assetClass)
        localActuals.set(k, (localActuals.get(k) ?? 0) + v)
        onshoreTotal += v
      }
    })
    const gaps = new Map<string, { gapPct: number; gapValue: number; targetPct: number; actualPct: number }>()
    LOCAL_CLASSES.forEach(cls => {
      const actualVal = localActuals.get(cls) ?? 0
      const actualPct = onshoreTotal > 0 ? (actualVal / onshoreTotal) * 100 : 0
      const targetPct = localTargets[cls] ?? 0
      const gapPct    = actualPct - targetPct
      gaps.set(cls, { gapPct, gapValue: (gapPct / 100) * onshoreTotal, targetPct, actualPct })
    })
    INTL_CLASSES.forEach(cls => {
      const actualVal = intlActuals.get(cls) ?? 0
      const actualPct = offshoreTotal > 0 ? (actualVal / offshoreTotal) * 100 : 0
      const targetPct = intlTargets[cls] ?? 0
      const gapPct    = actualPct - targetPct
      gaps.set(cls, { gapPct, gapValue: (gapPct / 100) * offshoreTotal, targetPct, actualPct })
    })
    return gaps
  }, [investments, usdToBrl, eurToBrl, settings.suitability, globalLocation])

  // ── Generic breakdown helper: aggregates BRL value by some key ──
  // Returns rows with `items` — the list of investments in each bucket —
  // so the breakdown modals can expand a category to show the underlying
  // positions.
  function breakdownBy<K extends string>(
    keyFn: (i: Investment) => K,
    palette: string[],
    keyOrder?: K[],
  ): {
    slices: DonutSlice[]; total: number;
    rows: { key: K; value: number; pct: number; color: string; items: { inv: Investment; valueBRL: number }[] }[]
  } {
    const m = new Map<K, number>()
    const byKey = new Map<K, { inv: Investment; valueBRL: number }[]>()
    let total = 0
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      if (globalLocation !== 'all' && i.location !== globalLocation) return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      const k = keyFn(i)
      m.set(k, (m.get(k) ?? 0) + v)
      const arr = byKey.get(k) ?? []
      arr.push({ inv: i, valueBRL: v })
      byKey.set(k, arr)
      total += v
    })
    const entries = keyOrder
      ? keyOrder.filter(k => m.has(k)).map(k => [k, m.get(k)!] as [K, number])
      : Array.from(m.entries()).sort((a, b) => b[1] - a[1])
    const rows = entries.map(([key, value], i) => ({
      key, value,
      pct: total > 0 ? (value / total) * 100 : 0,
      color: palette[i % palette.length],
      items: (byKey.get(key) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
    }))
    const slices: DonutSlice[] = rows.map(r => ({
      label: String(r.key),
      value: r.value,
      color: r.color,
    }))
    return { slices, total, rows }
  }

  // ── Liquidity breakdown ─────────────────────────
  const LIQ_ORDER = ['D+0', 'D+1', 'D+2', 'D+3', 'D+5', 'D+7', 'D+10', 'D+15', 'D+30', 'D+60', 'D+90', 'D+180', 'D+360', 'Vencimento', 'Não definido']
  const liquidityBreakdown = useMemo(() => {
    // Cyan → blue → purple gradient = fast → slow
    const palette = ['#00ff88', '#00d4ff', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#ff7a00', '#ff4466', '#55556a', '#55556a']
    return breakdownBy(
      i => (i.liquidity && i.liquidity.trim().length > 0 ? i.liquidity : 'Não definido'),
      palette,
      LIQ_ORDER,
    )
  }, [investments, usdToBrl, eurToBrl, globalLocation])

  // ── Tax treatment breakdown ────────────────────
  const taxLabel: Record<string, string> = {
    'taxable':       'Tributável',
    'tax-deferred':  'Imposto diferido',
    'tax-exempt':    'Isento de IR',
    'unset':         'Não classificado',
  }
  const taxBreakdown = useMemo(() => {
    const palette = ['#ff4466', '#f59e0b', '#00ff88', '#55556a']
    const m = new Map<string, number>()
    const byKey = new Map<string, { inv: Investment; valueBRL: number }[]>()
    let total = 0
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      if (globalLocation !== 'all' && i.location !== globalLocation) return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      const k = i.taxTreatment ?? 'unset'
      m.set(k, (m.get(k) ?? 0) + v)
      const arr = byKey.get(k) ?? []
      arr.push({ inv: i, valueBRL: v })
      byKey.set(k, arr)
      total += v
    })
    const order = ['taxable', 'tax-deferred', 'tax-exempt', 'unset']
    const rows = order.filter(k => m.has(k)).map(k => ({
      key: k, value: m.get(k)!,
      pct: total > 0 ? (m.get(k)! / total) * 100 : 0,
      color: palette[order.indexOf(k)],
      items: (byKey.get(k) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
    }))
    const slices: DonutSlice[] = rows.map(r => ({ label: taxLabel[r.key] ?? r.key, value: r.value, color: r.color }))
    return { slices, total, rows }
  }, [investments, usdToBrl, eurToBrl, globalLocation])

  // ── Institution / broker breakdown ─────────────
  const institutionBreakdown = useMemo(() => {
    const palette = ['#00d4ff', '#00ff88', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#ff7a00', '#14b8a6', '#a855f7', '#84cc16']
    return breakdownBy(
      i => (i.institution && i.institution.trim().length > 0 ? i.institution : 'Sem instituição'),
      palette,
    )
  }, [investments, usdToBrl, eurToBrl, globalLocation])

  // ── Risk level breakdown ───────────────────────
  const riskLabel: Record<string, string> = {
    '1': 'Muito baixo',
    '2': 'Baixo',
    '3': 'Moderado',
    '4': 'Alto',
    '5': 'Muito alto',
    'unset': 'Sem rating',
  }
  // ── Onshore canonical asset class breakdown ─────
  // Maps internal canonical classes to the public-facing label set the
  // user wants displayed, in the requested order.
  const ONSHORE_CLASS_ORDER = [
    'Pós Fixado',
    'Prefixado',
    'Inflação',
    'Renda Fixa Ativo',
    'Multimercado',
    'Ações',
    'FIIs Tijolo',
    'Crédito Estruturado',
    'PE/VC/Real Assets',
  ] as const
  const ONSHORE_CLASS_PALETTE: Record<string, string> = {
    'Pós Fixado':            '#00d4ff',
    'Prefixado':             '#3b82f6',
    'Inflação':              '#8b5cf6',
    'Renda Fixa Ativo':      '#6366f1',
    'Multimercado':          '#a855f7',
    'Ações':                 '#00ff88',
    'FIIs Tijolo':           '#ec4899',
    'Crédito Estruturado':   '#f59e0b',
    'PE/VC/Real Assets':     '#ff7a00',
  }
  function mapOnshoreCanon(canon: string): string | null {
    const m: Record<string, string> = {
      'Pós-Fixado':                'Pós Fixado',
      'Prefixado':                 'Prefixado',
      'IPCA Juro Real (Curto)':    'Inflação',
      'IPCA Juro Real (Longo)':    'Inflação',
      'Renda Fixa Ativo':          'Renda Fixa Ativo',
      'Multimercados':             'Multimercado',
      'RV Ibovespa':               'Ações',
      'RV S&P (BRL)':              'Ações',
      'Alt. FII (Tijolo)':         'FIIs Tijolo',
      'Alt. Crédito Estruturado':  'Crédito Estruturado',
      'Alt. PE/VC/Real Assets':    'PE/VC/Real Assets',
    }
    return m[canon] ?? null
  }
  const onshoreClassBreakdown = useMemo(() => {
    if (globalLocation === 'onshore') {
      // Canonical 9-class mapping for onshore
      const m = new Map<string, number>()
      const byLabel = new Map<string, { inv: Investment; valueBRL: number }[]>()
      let total = 0
      let unmapped = 0
      investments.forEach(i => {
        if (i.location !== 'onshore') return
        const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
        if (v <= 0) return
        const canon = canonicalLocalClass(i.assetClass)
        const label = mapOnshoreCanon(canon)
        if (label) {
          m.set(label, (m.get(label) ?? 0) + v)
          const arr = byLabel.get(label) ?? []
          arr.push({ inv: i, valueBRL: v })
          byLabel.set(label, arr)
          total += v
        } else {
          unmapped += v
        }
      })
      const rows = ONSHORE_CLASS_ORDER.map(label => ({
        label,
        value: m.get(label) ?? 0,
        pct: total > 0 ? ((m.get(label) ?? 0) / total) * 100 : 0,
        color: ONSHORE_CLASS_PALETTE[label] ?? '#55556a',
        items: (byLabel.get(label) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
      }))
      return { rows, total, unmapped }
    }
    // offshore / all: group by raw asset class, sorted by value
    const palette = ['#00d4ff', '#00ff88', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#ff7a00', '#14b8a6', '#a855f7', '#84cc16', '#6366f1', '#ff4466']
    const m = new Map<string, number>()
    const byLabel = new Map<string, { inv: Investment; valueBRL: number }[]>()
    let total = 0
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      if (globalLocation !== 'all' && i.location !== globalLocation) return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      const label = i.assetClass || 'Não classificado'
      m.set(label, (m.get(label) ?? 0) + v)
      const arr = byLabel.get(label) ?? []
      arr.push({ inv: i, valueBRL: v })
      byLabel.set(label, arr)
      total += v
    })
    const rows = Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], idx) => ({
        label, value,
        pct: total > 0 ? (value / total) * 100 : 0,
        color: palette[idx % palette.length],
        items: (byLabel.get(label) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
      }))
    return { rows, total, unmapped: 0 }
  }, [investments, usdToBrl, eurToBrl, globalLocation])

  // ── Onshore product type breakdown (alphabetical) ──
  const ONSHORE_PRODUCT_TYPES = [
    'Ações', 'CDB', 'CDCA', 'COE', 'CPR Compromissada', 'CRA', 'CRI',
    'Debênture', 'Debênture Incentivada', 'Derivativos', 'FDIC', 'FGTS',
    'FI', 'FIA', 'FIAGRO', 'FII', 'FI-Infra', 'FIM',
    'LCA', 'LCI', 'LF', 'LFT', 'LIG', 'LTN',
    'NTN-B Cuponada', 'NTN-B Principal', 'NTN-C', 'NTN-F',
    'Outros', 'Tesouro Educa+', 'Tesouro Renda+',
  ] as const
  function inferProductType(inv: Investment): string {
    // 1. Explicit título type
    if (inv.tituloType && inv.tituloType.trim().length > 0) return inv.tituloType.trim()
    // 2. Explicit fund type
    if (inv.fundType && inv.fundType.trim().length > 0)   return inv.fundType.trim()
    // 3. ProductType high-level
    if (inv.productType === 'acao')  return 'Ações'
    if (inv.productType === 'coe')   return 'COE'
    // 4. Heuristics from assetClass / name
    const cls = (inv.assetClass || '').toLowerCase()
    const name = (inv.name || '').toLowerCase()
    const hay = `${cls} ${name}`
    const map: { match: RegExp; label: string }[] = [
      { match: /\bcdb\b/, label: 'CDB' },
      { match: /\blci\b/, label: 'LCI' },
      { match: /\blca\b/, label: 'LCA' },
      { match: /\bcri\b/, label: 'CRI' },
      { match: /\bcra\b/, label: 'CRA' },
      { match: /debênture incentivada|debenture incentivada/, label: 'Debênture Incentivada' },
      { match: /debênture|debenture/, label: 'Debênture' },
      { match: /\blig\b/, label: 'LIG' },
      { match: /\blft\b/, label: 'LFT' },
      { match: /\bltn\b/, label: 'LTN' },
      { match: /ntn-b principal/, label: 'NTN-B Principal' },
      { match: /ntn-b cuponada|ntn-b/, label: 'NTN-B Cuponada' },
      { match: /ntn-c/, label: 'NTN-C' },
      { match: /ntn-f/, label: 'NTN-F' },
      { match: /tesouro renda/, label: 'Tesouro Renda+' },
      { match: /tesouro educa/, label: 'Tesouro Educa+' },
      { match: /\bfgts\b/, label: 'FGTS' },
      { match: /\bfii\b|fundo imobili/, label: 'FII' },
      { match: /\bfia\b/, label: 'FIA' },
      { match: /\bfim\b|multimerc/, label: 'FIM' },
      { match: /\bfdic\b/, label: 'FDIC' },
      { match: /fiagro/, label: 'FIAGRO' },
      { match: /fi-?infra|infraestrut/, label: 'FI-Infra' },
      { match: /\blf\b/, label: 'LF' },
      { match: /\bcdca\b/, label: 'CDCA' },
      { match: /cpr compromiss/, label: 'CPR Compromissada' },
      { match: /\bcoe\b/, label: 'COE' },
      { match: /derivativ|opção|opcao|futuro/, label: 'Derivativos' },
      { match: /ação|acao|ações|acoes|equity|stock/, label: 'Ações' },
    ]
    for (const r of map) if (r.match.test(hay)) return r.label
    if (inv.productType === 'fundo') return 'FI'
    if (inv.productType === 'titulo') return 'Outros'
    return 'Outros'
  }
  const onshoreProductBreakdown = useMemo(() => {
    const m = new Map<string, number>()
    const byLabel = new Map<string, { inv: Investment; valueBRL: number }[]>()
    let total = 0
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      if (globalLocation !== 'all' && i.location !== globalLocation) return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      const t = inferProductType(i)
      m.set(t, (m.get(t) ?? 0) + v)
      const arr = byLabel.get(t) ?? []
      arr.push({ inv: i, valueBRL: v })
      byLabel.set(t, arr)
      total += v
    })
    // Alphabetical (pt-BR) — but use the requested canonical list as the
    // primary set; any extras go after.
    const seen = new Set<string>()
    const palette = ['#00d4ff', '#00ff88', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#ff7a00', '#14b8a6', '#a855f7', '#84cc16', '#6366f1', '#ff4466']
    const rows: { label: string; value: number; pct: number; color: string; items: { inv: Investment; valueBRL: number }[] }[] = []
    const sorted = [...ONSHORE_PRODUCT_TYPES].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    sorted.forEach((t, i) => {
      const v = m.get(t) ?? 0
      seen.add(t)
      rows.push({
        label: t, value: v,
        items: (byLabel.get(t) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
        pct: total > 0 ? (v / total) * 100 : 0,
        color: palette[i % palette.length],
      })
    })
    // Types not in the canonical list get their own rows (so they're expandable)
    const extras = Array.from(m.entries())
      .filter(([k]) => !seen.has(k))
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    extras.forEach(([k, v], idx) => {
      rows.push({
        label: k,
        value: v,
        items: (byLabel.get(k) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
        pct: total > 0 ? (v / total) * 100 : 0,
        color: palette[(sorted.length + idx) % palette.length],
      })
    })
    return { rows, total }
  }, [investments, usdToBrl, eurToBrl, globalLocation])

  const riskBreakdown = useMemo(() => {
    // Green → yellow → red gradient
    const palette = ['#00ff88', '#84cc16', '#f59e0b', '#ff7a00', '#ff4466', '#55556a']
    const m = new Map<string, number>()
    const byKey = new Map<string, { inv: Investment; valueBRL: number }[]>()
    let total = 0
    investments.forEach(i => {
      if (i.location === 'physical-re') return
      if (globalLocation !== 'all' && i.location !== globalLocation) return
      const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      if (v <= 0) return
      const k = i.riskLevel ? String(i.riskLevel) : 'unset'
      m.set(k, (m.get(k) ?? 0) + v)
      const arr = byKey.get(k) ?? []
      arr.push({ inv: i, valueBRL: v })
      byKey.set(k, arr)
      total += v
    })
    const order = ['1', '2', '3', '4', '5', 'unset']
    const rows = order.filter(k => m.has(k)).map(k => ({
      key: k, value: m.get(k)!,
      pct: total > 0 ? (m.get(k)! / total) * 100 : 0,
      color: palette[order.indexOf(k)],
      items: (byKey.get(k) ?? []).sort((a, b) => b.valueBRL - a.valueBRL),
    }))
    const slices: DonutSlice[] = rows.map(r => ({ label: riskLabel[r.key] ?? r.key, value: r.value, color: r.color }))
    return { slices, total, rows }
  }, [investments, usdToBrl, eurToBrl, globalLocation])

  // ── Emissor breakdown ──────────────────────────
  const emisssorBreakdown = useMemo(() => {
    const palette = ['#00d4ff', '#00ff88', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#ff7a00', '#14b8a6', '#a855f7', '#84cc16', '#6366f1', '#ff4466']
    return breakdownBy(
      i => (i.issuer && i.issuer.trim().length > 0 ? i.issuer.trim() : 'Não informado'),
      palette,
    )
  }, [investments, usdToBrl, eurToBrl, globalLocation])

  // ── Holding breakdown ──────────────────────────
  const holdingBreakdown = useMemo(() => {
    const palette = ['#f59e0b', '#00d4ff', '#8b5cf6', '#00ff88', '#ec4899', '#3b82f6', '#ff7a00', '#14b8a6', '#a855f7', '#84cc16', '#6366f1', '#ff4466']
    return breakdownBy(
      i => (i.holding && i.holding.trim().length > 0 ? i.holding.trim() : 'Não informado'),
      palette,
    )
  }, [investments, usdToBrl, eurToBrl, globalLocation])

  // ── Vencimento (maturity bucket) breakdown ─────
  const maturityBreakdown = useMemo(() => {
    const palette = ['#00ff88', '#84cc16', '#f59e0b', '#ff7a00', '#ff4466', '#8b5cf6', '#55556a']
    const today = new Date()
    function bucket(inv: Investment): string {
      if (!inv.maturityDate) return 'Sem vencimento'
      const diff = (new Date(inv.maturityDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
      if (diff < 0)  return 'Vencido'
      if (diff < 1)  return '< 1 ano'
      if (diff < 2)  return '1–2 anos'
      if (diff < 3)  return '2–3 anos'
      if (diff < 5)  return '3–5 anos'
      if (diff < 10) return '5–10 anos'
      return '+ 10 anos'
    }
    const BUCKET_ORDER = ['< 1 ano', '1–2 anos', '2–3 anos', '3–5 anos', '5–10 anos', '+ 10 anos', 'Vencido', 'Sem vencimento']
    return breakdownBy(bucket, palette, BUCKET_ORDER)
  }, [investments, usdToBrl, eurToBrl, globalLocation])

  // ── Payment frequency breakdown ────────────────
  const paymentFreqBreakdown = useMemo(() => {
    const palette = ['#00d4ff', '#8b5cf6', '#00ff88', '#f59e0b', '#ec4899', '#3b82f6', '#ff7a00', '#55556a']
    return breakdownBy(
      i => (i.paymentFrequency && i.paymentFrequency.trim().length > 0 ? i.paymentFrequency.trim() : 'Não informado'),
      palette,
    )
  }, [investments, usdToBrl, eurToBrl, globalLocation])

  // ── Sector breakdown ────────────────────────────
  const sectorBreakdown = useMemo(() => {
    const palette = ['#00d4ff', '#00ff88', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#ff7a00', '#14b8a6', '#a855f7', '#84cc16', '#6366f1', '#ff4466']
    return breakdownBy(
      i => (i.sector && i.sector.trim().length > 0 ? i.sector.trim() : 'Não informado'),
      palette,
    )
  }, [investments, usdToBrl, eurToBrl, globalLocation])

  // ── Benchmark breakdown ─────────────────────────
  const benchmarkBreakdown = useMemo(() => {
    const palette = ['#00ff88', '#00d4ff', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6', '#ff7a00', '#55556a']
    return breakdownBy(
      i => (i.benchmark && i.benchmark.trim().length > 0 ? i.benchmark.trim() : 'Sem benchmark'),
      palette,
    )
  }, [investments, usdToBrl, eurToBrl, globalLocation])

  // ── Per-investment period metrics (used by movers + posições) ──
  const movers = useMemo(() => {
    return investments
      .filter(i => i.location !== 'physical-re' && (globalLocation === 'all' || i.location === globalLocation))
      .map(i => {
        const cur  = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
        const cost = convert(i.quantity * i.avgCost,      i.currency, 'BRL', usdToBrl, eurToBrl)
        const startPrice = startPriceFor(i, periodCutoff)
        const startVal = convert(i.quantity * startPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
        const linked = linkedTxByInvestment.get(i.id) ?? []
        const linkedIncomePer = linked.filter(t => t.date >= periodCutoff && t.type === 'income')
          .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL'|'USD'|'EUR', 'BRL', usdToBrl, eurToBrl), 0)
        const linkedIncomeAll = linked.filter(t => t.type === 'income')
          .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL'|'USD'|'EUR', 'BRL', usdToBrl, eurToBrl), 0)
        // Manually logged cashflow events (excludes amortizations — return of principal)
        const cfPer = (i.cashflowHistory ?? []).filter(e => e.type !== 'amortization' && e.date >= periodCutoff)
          .reduce((s, e) => s + convert(e.amount, i.currency, 'BRL', usdToBrl, eurToBrl), 0)
        const cfAll = (i.cashflowHistory ?? []).filter(e => e.type !== 'amortization')
          .reduce((s, e) => s + convert(e.amount, i.currency, 'BRL', usdToBrl, eurToBrl), 0)
        const periodGain = period === 'ALL' ? (cur - cost + linkedIncomeAll + cfAll) : (cur - startVal + linkedIncomePer + cfPer)
        const periodPct  = period === 'ALL'
          ? (cost > 0 ? (periodGain / cost) * 100 : 0)
          : (startVal > 0 ? (periodGain / startVal) * 100 : 0)
        const lifeGain = cur - cost + linkedIncomeAll + cfAll
        const lifePct  = cost > 0 ? (lifeGain / cost) * 100 : 0
        const gu = (pct: number) => grossUp && i.taxTreatment === 'tax-exempt' ? pct / (1 - (i.grossUpRate ?? 0.15)) : pct
        return {
          inv: i,
          current: cur, cost, startVal,
          gain: periodGain, pct: gu(periodPct),
          lifeGain, lifePct: gu(lifePct),
        }
      })
  }, [investments, usdToBrl, eurToBrl, periodCutoff, period, linkedTxByInvestment, globalLocation, grossUp])

  const topGainers = useMemo(() => [...movers].filter(m => m.gain > 0).sort((a, b) => b.gain - a.gain).slice(0, 3), [movers])
  const topLosers  = useMemo(() => [...movers].filter(m => m.gain < 0).sort((a, b) => a.gain - b.gain).slice(0, 3), [movers])

  // ── Concentration ─────────────────────────────
  const concentration = useMemo(() => {
    if (totals.totalValueBRL <= 0) return null
    const sorted = movers.sort((a, b) => b.current - a.current)
    if (!sorted.length) return null
    const top = sorted[0]
    return { name: top.inv.ticker || top.inv.name, pct: (top.current / totals.totalValueBRL) * 100 }
  }, [movers, totals.totalValueBRL])

  // ── Total dividends / income return ────────────
  const totalDivIncomeBRL = totals.dividendsBRL + totals.interestBRL

  // ── Patrimônio sparkline scoped to the selected period ──
  // Anchors to the period window: index 0 = period start, last = today.
  // Number of buckets adapts to the period length.
  const sparkData = useMemo(() => {
    const cutoffDate = new Date(periodCutoff + 'T00:00:00')
    const totalDays = Math.max(7, Math.ceil((today.getTime() - cutoffDate.getTime()) / 86400000))
    // 12 buckets for periods ≤ 1 year, 24 for longer
    const buckets = totalDays > 366 ? 24 : 12
    const stepDays = totalDays / buckets
    const points: number[] = []
    // Walk forward from cutoff: for each bucket, snapshot[i] =
    //   start + cumulative_aportes_through(i) - cumulative_resgates_through(i)
    //   + periodGain * (i / (buckets - 1))
    // periodGain is allocated linearly across buckets — illustrative
    // but anchored to real start (periodCutoff) and end (current value).
    const startVal = period === 'ALL' ? totals.totalCostBRL : totals.startValueBRL
    for (let i = 0; i < buckets; i++) {
      const tDate = new Date(cutoffDate.getTime() + stepDays * (i + 1) * 86400000)
      const tISO = tDate.toISOString().split('T')[0]
      const ap = transactions
        .filter(t => t.date >= periodCutoff && t.date <= tISO && t.type === 'expense' && t.category === 'investimento')
        .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR', 'BRL', usdToBrl, eurToBrl), 0)
      const re = transactions
        .filter(t => t.date >= periodCutoff && t.date <= tISO && t.type === 'income' && t.category === 'investimento')
        .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL' | 'USD' | 'EUR', 'BRL', usdToBrl, eurToBrl), 0)
      const gainShare = periodGainBRL * ((i + 1) / buckets)
      points.push(startVal + (ap - re) + gainShare)
    }
    // Pin the first point to startVal so the line opens at the period start.
    return [startVal, ...points]
  }, [periodCutoff, totals.startValueBRL, totals.totalCostBRL, periodGainBRL, transactions, period, usdToBrl, eurToBrl, today])

  const sparkSafe = sparkData.filter(v => Number.isFinite(v))
  const sparkMin = sparkSafe.length > 0 ? Math.min(...sparkSafe, 0) : 0
  const sparkMax = sparkSafe.length > 0 ? Math.max(...sparkSafe, 1) : 1
  const sparkRange = Math.max(sparkMax - sparkMin, 1)


  // ── Filtered positions ──────────────────────────
  const positions = useMemo(() => {
    let out = investments.map(i => {
      const cur  = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
      const cost = convert(i.quantity * i.avgCost,      i.currency, 'BRL', usdToBrl, eurToBrl)
      const sp   = startPriceFor(i, periodCutoff)
      const startVal = convert(i.quantity * sp, i.currency, 'BRL', usdToBrl, eurToBrl)
      const linked = linkedTxByInvestment.get(i.id) ?? []
      const linkedIncomePer  = linked.filter(t => t.date >= periodCutoff && t.type === 'income')
        .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL'|'USD'|'EUR', 'BRL', usdToBrl, eurToBrl), 0)
      const linkedIncomeAll  = linked.filter(t => t.type === 'income')
        .reduce((s, t) => s + convert(t.amount, (t.currency ?? 'BRL') as 'BRL'|'USD'|'EUR', 'BRL', usdToBrl, eurToBrl), 0)
      // Manually logged cashflow income (excludes amortizations — return of principal)
      const cfHistory = i.cashflowHistory ?? []
      const cfAll = cfHistory.filter(e => e.type !== 'amortization')
        .reduce((s, e) => s + convert(e.amount, i.currency, 'BRL', usdToBrl, eurToBrl), 0)
      const cfPer = cfHistory.filter(e => e.type !== 'amortization' && e.date >= periodCutoff)
        .reduce((s, e) => s + convert(e.amount, i.currency, 'BRL', usdToBrl, eurToBrl), 0)
      const gainLife = cur - cost + linkedIncomeAll + cfAll
      const pctLife  = cost > 0 ? (gainLife / cost) * 100 : 0
      const gainPer  = period === 'ALL' ? gainLife : (cur - startVal + linkedIncomePer + cfPer)
      const pctPer   = period === 'ALL' ? pctLife  : (startVal > 0 ? (gainPer / startVal) * 100 : 0)
      // Fixed performance period returns — null when asset not old enough for the window
      // Uses per-unit amounts so no currency conversion needed (all in asset native currency)
      const cfNative = (from: string, to?: string) =>
        cfHistory.filter(e => e.type !== 'amortization' && e.date >= from && (to === undefined || e.date < to))
          .reduce((s, e) => s + e.amount, 0)
      const pctFor = (cutISO: string): number | null => {
        if (!i.purchaseDate || i.purchaseDate >= cutISO) return null
        const s2 = priceAt(i, cutISO)
        const startPosVal = i.quantity * s2
        if (startPosVal <= 0) return 0
        const income = cfNative(cutISO)
        return ((i.quantity * i.currentPrice - startPosVal + income) / startPosVal) * 100
      }
      const pctPrevMonth: number | null = (() => {
        if (!i.purchaseDate || i.purchaseDate >= perfCutoffs.prevMonthStart) return null
        const s2 = priceAt(i, perfCutoffs.prevMonthStart)
        const e2 = priceAt(i, perfCutoffs.prevMonthEnd)
        const startPosVal = i.quantity * s2
        if (startPosVal <= 0) return 0
        const income = cfNative(perfCutoffs.prevMonthStart, perfCutoffs.prevMonthEnd)
        return ((i.quantity * e2 - startPosVal + income) / startPosVal) * 100
      })()
      const gu = (pct: number | null) =>
        pct !== null && grossUp && i.taxTreatment === 'tax-exempt'
          ? pct / (1 - (i.grossUpRate ?? 0.15))
          : pct
      return {
        ...i, currentBRL: cur, costBRL: cost, startBRL: startVal,
        gain: gainPer, pct: gu(pctPer) ?? pctPer, gainLife, pctLife: gu(pctLife) ?? pctLife,
        linkedIncomePer, linkedIncomeAll, linkedCount: linked.length, linkedTxs: linked,
        pctMtd: gu(pctFor(perfCutoffs.mtd)),
        pctPrevMonth: gu(pctPrevMonth),
        pctYtd: gu(pctFor(perfCutoffs.ytd)),
        pct12m: gu(pctFor(perfCutoffs.m12)),
        pct24m: gu(pctFor(perfCutoffs.m24)),
        pctInception: gu(pctLife) ?? pctLife,
        allocPct: 0,
      }
    })
    if (globalLocation !== 'all') out = out.filter(i => i.location === globalLocation)
    if (filterClass !== 'all') out = out.filter(i => i.assetClass === filterClass)
    if (filterInstitution !== 'all') out = out.filter(i => (i.institution || '') === filterInstitution)
    if (filterTax !== 'all') out = out.filter(i => (i.taxTreatment ?? 'unset') === filterTax)
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.ticker ?? '').toLowerCase().includes(q) ||
        i.assetClass.toLowerCase().includes(q) ||
        (i.institution ?? '').toLowerCase().includes(q),
      )
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return out.sort((a, b) => {
      switch (sortKey) {
        case 'name':         return dir * a.name.localeCompare(b.name, 'pt-BR')
        case 'class':        return dir * a.assetClass.localeCompare(b.assetClass, 'pt-BR')
        case 'institution':  return dir * (a.institution || '').localeCompare(b.institution || '', 'pt-BR')
        case 'qty':          return dir * (a.quantity - b.quantity)
        case 'avgCost':      return dir * (a.avgCost - b.avgCost)
        case 'currentPrice': return dir * (a.currentPrice - b.currentPrice)
        case 'period':       return dir * (a.pct - b.pct)
        case 'allocation':   return dir * (a.allocPct - b.allocPct)
        case 'maturity':     return dir * ((a.maturityDate ?? '9999-12-31') < (b.maturityDate ?? '9999-12-31') ? -1 : 1)
        case 'mtd':          { const an = a.pctMtd      ?? -Infinity * dir, bn = b.pctMtd      ?? -Infinity * dir; return dir * (an - bn) }
        case 'prevMonth':    { const an = a.pctPrevMonth ?? -Infinity * dir, bn = b.pctPrevMonth ?? -Infinity * dir; return dir * (an - bn) }
        case 'ytd':          { const an = a.pctYtd      ?? -Infinity * dir, bn = b.pctYtd      ?? -Infinity * dir; return dir * (an - bn) }
        case 'm12':          { const an = a.pct12m      ?? -Infinity * dir, bn = b.pct12m      ?? -Infinity * dir; return dir * (an - bn) }
        case 'm24':          { const an = a.pct24m      ?? -Infinity * dir, bn = b.pct24m      ?? -Infinity * dir; return dir * (an - bn) }
        case 'inception':    return dir * (a.pctInception - b.pctInception)
        case 'position':
        default:             return dir * (a.currentBRL - b.currentBRL)
      }
    })
  }, [investments, search, filterClass, filterInstitution, filterTax, globalLocation, usdToBrl, eurToBrl, periodCutoff, period, sortKey, sortDir, linkedTxByInvestment, perfCutoffs, grossUp])

  const positionsWithAlloc = useMemo(() => {
    const total = positions.reduce((s, p) => s + p.currentBRL, 0)
    return positions.map(p => ({ ...p, allocPct: total > 0 ? (p.currentBRL / total) * 100 : 0 }))
  }, [positions])

  const groupedPositions = useMemo(() => {
    const ORDER = [...LOCAL_CLASSES, ...INTL_CLASSES]
    const map = new Map<string, typeof positionsWithAlloc[number][]>()
    for (const p of positionsWithAlloc) {
      const canon = p.location === 'offshore'
        ? canonicalIntlClass(p.assetClass)
        : canonicalLocalClass(p.assetClass)
      const key = ORDER.includes(canon) ? canon : p.assetClass
      const arr = map.get(key) ?? []
      arr.push(p)
      map.set(key, arr)
    }
    const knownKeys   = ORDER.filter(k => map.has(k))
    const unknownKeys = Array.from(map.keys()).filter(k => !ORDER.includes(k)).sort()
    return [...knownKeys, ...unknownKeys].map(key => {
      const items        = map.get(key)!
      const totalBRL     = items.reduce((s, p) => s + p.currentBRL, 0)
      const totalGain    = items.reduce((s, p) => s + p.gain, 0)
      const totalBase    = period === 'ALL'
        ? items.reduce((s, p) => s + p.costBRL, 0)
        : items.reduce((s, p) => s + p.startBRL, 0)
      const totalAllocPct = items.reduce((s, p) => s + p.allocPct, 0)
      const gainPct = totalBase > 0 ? (totalGain / totalBase) * 100 : 0

      // Value-weighted average return for each fixed period.
      // Items that return null for a period (not old enough) are excluded
      // from that period's calculation. If all items are null → null.
      const wavg = (getPct: (p: typeof items[0]) => number | null): number | null => {
        let sumW = 0, sumWR = 0
        for (const p of items) {
          const v = getPct(p)
          if (v !== null) { sumW += p.currentBRL; sumWR += p.currentBRL * v }
        }
        return sumW > 0 ? sumWR / sumW : null
      }

      return {
        key, items, totalBRL, gainPct, totalAllocPct,
        grpMtd:       wavg(p => p.pctMtd),
        grpPrevMonth: wavg(p => p.pctPrevMonth),
        grpYtd:       wavg(p => p.pctYtd),
        grp12m:       wavg(p => p.pct12m),
        grp24m:       wavg(p => p.pct24m),
        grpInception: wavg(p => p.pctInception),
      }
    })
  }, [positionsWithAlloc, period])

  const allClassesForFilter = useMemo(() => {
    const s = new Set<string>()
    investments.forEach(i => s.add(i.assetClass))
    return Array.from(s).sort()
  }, [investments])

  // ── Reveal animations ──────────────────────────
  useReveal(containerRef, [investments.length, period, currency])

  // Suitability gauge angle
  const gaugeScore = SUITABILITY_SCORE[settings.suitability ?? 'Moderado'] ?? 50
  const gaugeAngle = (gaugeScore / 100) * 180 // 0..180°
  // Convert to coords on a 70-radius arc starting at (20,100) end (160,100)
  const rad = ((180 - gaugeAngle) * Math.PI) / 180
  const needleX = 90 + 70 * Math.cos(rad)
  const needleY = 100 - 70 * Math.sin(rad)

  // Periods to label on the hero CDI line
  const periodLabel = period === 'YTD' ? 'YTD' : period === 'ALL' ? 'Total' : period

  // ── PDF download ────────────────────────────────────────────────────────
  const [pdfLoading, setPdfLoading] = useState(false)

  const handleDownloadPDF = async () => {
    setPdfLoading(true)
    try {
      const { generateWealthPDF } = await import('../lib/wealthPDF')
      const profile = (settings.suitability ?? 'Moderado') as SuitabilityProfile

      // Build allocation rows for PDF
      const buildPdfAlloc = (classes: string[], actuals: Map<string, number>, total: number, targets: Record<string, number>) =>
        classes.map(cls => {
          const actualValue = actuals.get(cls) ?? 0
          const actualPct   = total > 0 ? (actualValue / total) * 100 : 0
          const targetPct   = targets[cls] ?? 0
          return { cls, actualPct, targetPct, gapPct: actualPct - targetPct, actualValue }
        }).filter(r => r.actualValue > 0 || r.targetPct > 0)

      const localActuals = new Map<string, number>()
      const intlActuals  = new Map<string, number>()
      let onshoreTotal = 0, offshoreTotal = 0
      investments.forEach(i => {
        if (i.location === 'physical-re') return
        if (globalLocation !== 'all' && i.location !== globalLocation) return
        const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
        if (v <= 0) return
        if (i.location === 'offshore') {
          intlActuals.set(canonicalIntlClass(i.assetClass), (intlActuals.get(canonicalIntlClass(i.assetClass)) ?? 0) + v)
          offshoreTotal += v
        } else {
          localActuals.set(canonicalLocalClass(i.assetClass), (localActuals.get(canonicalLocalClass(i.assetClass)) ?? 0) + v)
          onshoreTotal += v
        }
      })

      // Benchmark periods — dynamic based on latest data row
      const latestBenchDate = benchmarkData[benchmarkData.length - 1]?.date ?? '2026-04-30'
      const BENCH_PERIODS = buildBenchPeriods(latestBenchDate)
      const pdfBenchKeys: Array<keyof Omit<BenchmarkMonthly,'date'>> = ['cdi','ipca','ibov','dolar']
      const benchmarkPeriods = BENCH_PERIODS.map(bp => {
        const c = compoundBench(benchmarkData, bp.from, bp.to, pdfBenchKeys)
        return { label: bp.label, cdi: c['cdi'] ?? null, dolar: c['dolar'] ?? null, ibov: c['ibov'] ?? null, ipca: c['ipca'] ?? null }
      })

      const iliquidBRL = investments
        .filter(i => i.location === 'physical-re' && (globalLocation === 'all' || i.location === globalLocation))
        .reduce((s, i) => s + convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl), 0)

      generateWealthPDF({
        totalBRL:    totals.totalValueBRL,
        totalUSD:    totals.totalValueBRL / usdToBrl,
        pctPeriod:   periodGainPct,
        pctYtd:      periodGainPct,  // best approximation available
        pct12m:      totals.lifetimeGainPct,
        pct24m:      totals.lifetimeGainPct,
        pctInception: totals.lifetimeGainPct,
        liquidBRL:   totals.totalValueBRL - iliquidBRL,
        iliquidBRL,
        suitabilityProfile: profile,
        location:    globalLocation,
        currency,
        usdToBrl,
        allocationLocal: buildPdfAlloc(LOCAL_CLASSES, localActuals, onshoreTotal, LOCAL_TARGETS[profile]),
        allocationIntl:  buildPdfAlloc(INTL_CLASSES, intlActuals, offshoreTotal, INTL_TARGETS[profile]),
        benchmarkPeriods,
        positions: positionsWithAlloc.map(pos => ({
          name:         pos.name,
          ticker:       pos.ticker,
          assetClass:   pos.assetClass,
          maturity:     pos.maturityDate,
          position:     pos.currentBRL,
          allocPct:     pos.allocPct,
          pctMtd:       pos.pctMtd,
          pctPrevMonth: pos.pctPrevMonth,
          pctYtd:       pos.pctYtd,
          pct12m:       pos.pct12m,
          pct24m:       pos.pct24m,
          pctInception: pos.pctInception,
          location:     pos.location,
        })),
        generatedAt: new Date(),
      })
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="v2-root min-w-0" ref={containerRef}>
      <V2PageHeader
        title="Investimentos"
        subtitle={`${investments.length} ativos · perfil ${settings.suitability ?? 'Moderado'}`}
        right={
          <>
            <PeriodTabs
              value={period}
              onChange={setPeriod}
              options={[
                { value: '1M',  label: '1M' },
                { value: '3M',  label: '3M' },
                { value: 'YTD', label: 'YTD' },
                { value: '12M', label: '12M' },
                { value: '5A',  label: '5A' },
                { value: 'ALL', label: 'Tudo' },
              ]}
            />
            <PeriodTabs
              value={currency}
              onChange={setCurrency}
              options={[
                { value: 'BRL', label: 'BRL' },
                { value: 'USD', label: 'USD' },
                { value: 'EUR', label: 'EUR' },
              ]}
            />
            <PeriodTabs
              value={globalLocation}
              onChange={setGlobalLocation}
              options={[
                { value: 'all',      label: 'Global' },
                { value: 'onshore',  label: 'Brasil' },
                { value: 'offshore', label: 'Exterior' },
              ]}
            />
            <button
              onClick={() => {
                const next = !grossUp
                setGrossUp(next)
                try { localStorage.setItem('luxorpro_gross_up', next ? '1' : '0') } catch { /* ignore */ }
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border"
              style={grossUp
                ? { background: 'rgba(255,122,0,0.15)', color: '#ff7a00', borderColor: 'rgba(255,122,0,0.4)' }
                : { background: 'rgba(255,255,255,0.04)', color: '#6b7280', borderColor: 'rgba(255,255,255,0.08)' }}
              title={grossUp ? 'Gross-up ativo (÷0,85)' : 'Ativar gross-up para isentos'}
            >
              Gross-up
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={pdfLoading}
              className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border"
              style={{ background: 'rgba(0,212,255,0.08)', color: '#00d4ff', borderColor: 'rgba(0,212,255,0.25)' }}
              title="Baixar relatório PDF"
            >
              {pdfLoading
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Download className="w-3.5 h-3.5" />}
              {pdfLoading ? 'Gerando…' : 'PDF'}
            </button>
            <button
              onClick={() => setShowAddInv(true)}
              className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              style={{ background: '#ff7a00', color: '#0a0a0f' }}
            >
              <PlusCircle className="w-3.5 h-3.5" /> Adicionar investimento
            </button>
          </>
        }
      />

      <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">

        {/* HERO */}
        <section className="v2-card-emph v2-card-emph-cyan v2-dot-grid p-6 sm:p-8 v2-reveal">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="flex-1 min-w-0">
              <p className="v2-caption">Patrimônio investido · {periodLabel}</p>
              <div className="flex items-baseline gap-3 mt-1.5 flex-wrap">
                <span className="v2-num text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
                  {fmt(toBase(totals.totalValueBRL))}
                </span>
                <span className="v2-pill" style={{
                  background: periodGainBRL >= 0 ? 'rgba(0,255,136,.12)' : 'rgba(255,68,102,.12)',
                  color: periodGainBRL >= 0 ? '#00ff88' : '#ff4466',
                  border: `1px solid ${periodGainBRL >= 0 ? 'rgba(0,255,136,.25)' : 'rgba(255,68,102,.25)'}`,
                }}
                title={useLifetimeFallback ? 'Mostrando ganho vs custo médio porque seu histórico de preços ainda não cobre o início do período. Para retorno do período exato, cadastre o preço do ativo na data de início ou conecte uma corretora que reporte histórico de preço.' : undefined}
                >
                  {periodGainBRL >= 0
                    ? <ArrowUpRight   className="w-3 h-3"/>
                    : <ArrowDownRight className="w-3 h-3"/>}
                  {periodGainBRL >= 0 ? '+' : '−'}{fmt(toBase(Math.abs(periodGainBRL)), true)} · {periodGainPct >= 0 ? '+' : '−'}{Math.abs(periodGainPct).toFixed(1)}% {gainSuffix}
                </span>
              </div>
              <div className="mt-4 flex items-center gap-3 text-xs text-[#8888aa] flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" style={{ color: '#00d4ff' }}/>
                  {period === 'ALL' ? 'Custo médio' : 'Início do período'}: <span className="v2-num text-white font-semibold">{fmt(toBase(period === 'ALL' ? totals.totalCostBRL : totals.startValueBRL), true)}</span>
                </span>
                <span className="text-[#2a2a3e]">·</span>
                <span className="flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5" style={{ color: '#ff7a00' }}/>
                  Proventos: <span className="v2-num text-white font-semibold">{fmt(toBase(totalDivIncomeBRL), true)}</span>
                </span>
                {totals.physicalBRL > 0 && (
                  <>
                    <span className="text-[#2a2a3e]">·</span>
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5"/>
                      Imobilizado: <span className="v2-num text-white font-semibold">{fmt(toBase(totals.physicalBRL), true)}</span>
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Sparkline */}
            <div className="lg:w-80 lg:flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <p className="v2-caption">Evolução · {periodLabel}</p>
                <span className="text-[10px] text-[#8888aa]">Ilustrativo</span>
              </div>
              <svg viewBox="0 0 320 90" className="w-full h-24" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="wealthGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#00ff88" stopOpacity="0.25"/>
                    <stop offset="100%" stopColor="#00ff88" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <line x1="0" y1="78" x2="320" y2="78" stroke="#1e1e30" strokeWidth="1" strokeDasharray="2 4"/>
                {sparkData.length > 1 && (() => {
                  const pts = sparkData.map((v, i) => {
                    const x = (i / (sparkData.length - 1)) * 320
                    const y = 80 - ((v - sparkMin) / sparkRange) * 70
                    return `${x},${y}`
                  })
                  return (
                    <>
                      <path d={`M${pts.join(' L')} L320,90 L0,90 Z`} fill="url(#wealthGrad)"/>
                      <path d={`M${pts.join(' L')}`} fill="none" stroke="#00ff88" strokeWidth="2"/>
                      {(() => {
                        const last = pts[pts.length - 1].split(',')
                        return (
                          <>
                            <circle cx={last[0]} cy={last[1]} r="3" fill="#00ff88"/>
                            <circle cx={last[0]} cy={last[1]} r="6" fill="#00ff88" opacity="0.25" className="v2-pulse"/>
                          </>
                        )
                      })()}
                    </>
                  )
                })()}
              </svg>
            </div>
          </div>
        </section>

        {/* ATTENTION STRIP */}
        <section className="space-y-2.5 v2-reveal">
          <p className="v2-caption">Vale sua atenção</p>
          <div className="grid md:grid-cols-3 gap-2.5">
            {concentration && concentration.pct >= 15 ? (
              <AttentionChip
                icon={AlertTriangle}
                tone="amber"
                title={`Concentração em ${concentration.name} · ${concentration.pct.toFixed(0)}%`}
                subtitle="Acima do limite sugerido de 10–15% por ativo"
              />
            ) : (
              <AttentionChip icon={Scale} tone="green" title="Carteira diversificada" subtitle="Nenhum ativo concentrando mais de 15%"/>
            )}
            {totalDivIncomeBRL > 0 ? (
              <AttentionChip
                icon={Gift}
                tone="cyan"
                title={`Proventos acumulados ${fmt(toBase(totalDivIncomeBRL), true)}`}
                subtitle="Dividendos + JCP + cupons recebidos"
              />
            ) : (
              <AttentionChip icon={Gift} tone="muted" title="Sem proventos lançados" subtitle="Cadastre dividendos no investimento para ver aqui"/>
            )}
            {periodGainPct < 0 ? (
              <AttentionChip
                icon={TrendingUp}
                tone="red"
                title={`Carteira em −${Math.abs(periodGainPct).toFixed(1)}% ${gainSuffix}`}
                subtitle={`Perda de ${fmt(toBase(Math.abs(periodGainBRL)), true)} ${useLifetimeFallback ? '· histórico de preços insuficiente' : ''}`}
              />
            ) : (
              <AttentionChip
                icon={TrendingUp}
                tone="green"
                title={`Rentabilidade +${periodGainPct.toFixed(1)}% ${gainSuffix}`}
                subtitle={`Ganho de ${fmt(toBase(periodGainBRL), true)} ${useLifetimeFallback ? '· histórico de preços insuficiente' : ''}`}
              />
            )}
          </div>
        </section>

        {/* KPIs */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 v2-reveal">
          <KpiCard
            caption={useLifetimeFallback ? 'Ganho vs custo médio' : `Rentabilidade ${periodLabel}`}
            value={`${periodGainPct >= 0 ? '+' : '−'}${Math.abs(periodGainPct).toFixed(1)}%`}
            valueColor={periodGainPct >= 0 ? '#00ff88' : '#ff4466'}
            secondary={`${periodGainBRL >= 0 ? '+' : '−'}${fmt(toBase(Math.abs(periodGainBRL)), true)} ${useLifetimeFallback ? '· histórico insuficiente' : 'nominal'}`}
            pillText={useLifetimeFallback ? 'aprox.' : periodGainPct >= 0 ? 'positiva' : 'negativa'}
            pillColor={useLifetimeFallback ? 'amber' : periodGainPct >= 0 ? 'green' : 'red'}
          />
          <KpiCard
            caption={`Aportes ${periodLabel}`}
            value={fmt(toBase(periodAportes), true)}
            valueColor="#00d4ff"
            secondary={`${monthsElapsed} ${monthsElapsed === 1 ? 'mês' : 'meses'} · média ${fmt(toBase(periodAportes / monthsElapsed), true)}/mês`}
            pillText={periodAportes > 0 ? 'ativo' : 'sem'}
            pillColor={periodAportes > 0 ? 'cyan' : 'muted'}
          />
          <KpiCard
            caption={`Resgates ${periodLabel}`}
            value={fmt(toBase(periodResgates), true)}
            valueColor="#ff7a00"
            secondary="Saídas para conta corrente no período"
            pillText={periodResgates > 0 ? 'sim' : 'sem'}
            pillColor={periodResgates > 0 ? 'orange' : 'muted'}
          />
          <KpiCard
            caption="Proventos totais"
            value={fmt(toBase(totalDivIncomeBRL), true)}
            valueColor="#ff7a00"
            secondary="Dividendos + JCP + cupons"
            pillText="acumulado"
            pillColor="orange"
          />
        </section>

        {/* BENTO */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 v2-reveal">

          {/* Evolução do patrimônio (large) */}
          <ExpandableCard
            gridClass="lg:col-span-2"
            title={`Evolução do patrimônio · ${periodLabel}`}
            subtitle={`${sparkData.length} pontos · ${fmt(toBase(period === 'ALL' ? totals.totalCostBRL : totals.startValueBRL), true)} → ${fmt(toBase(totals.totalValueBRL), true)}`}
            modalSize="xl"
            detail={
              <div>
                <svg viewBox="0 0 800 320" className="w-full h-72" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="wealthBigModal" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#00ff88" stopOpacity="0.30"/>
                      <stop offset="100%" stopColor="#00ff88" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  <line x1="0" y1="60"  x2="800" y2="60"  stroke="#1e1e30" strokeWidth="1"/>
                  <line x1="0" y1="160" x2="800" y2="160" stroke="#1e1e30" strokeWidth="1"/>
                  <line x1="0" y1="260" x2="800" y2="260" stroke="#1e1e30" strokeWidth="1"/>
                  {sparkData.length > 1 && (() => {
                    const pts = sparkData.map((v, i) => {
                      const x = (i / (sparkData.length - 1)) * 800
                      const y = 290 - ((v - sparkMin) / sparkRange) * 240
                      return `${x},${y}`
                    })
                    return (
                      <>
                        <path d={`M${pts.join(' L')} L800,320 L0,320 Z`} fill="url(#wealthBigModal)"/>
                        <path d={`M${pts.join(' L')}`} fill="none" stroke="#00ff88" strokeWidth="2"/>
                        {pts.map((p, i) => {
                          const [x, y] = p.split(',')
                          return <circle key={i} cx={x} cy={y} r="3" fill="#00ff88"/>
                        })}
                      </>
                    )
                  })()}
                </svg>
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="v2-card p-4">
                    <p className="v2-caption">Início</p>
                    <p className="v2-num text-base font-bold mt-1">{fmt(toBase(period === 'ALL' ? totals.totalCostBRL : totals.startValueBRL), true)}</p>
                  </div>
                  <div className="v2-card p-4">
                    <p className="v2-caption">Aportes período</p>
                    <p className="v2-num text-base font-bold mt-1" style={{ color: '#00d4ff' }}>+{fmt(toBase(periodAportes), true)}</p>
                  </div>
                  <div className="v2-card p-4">
                    <p className="v2-caption">Resgates período</p>
                    <p className="v2-num text-base font-bold mt-1" style={{ color: '#ff7a00' }}>−{fmt(toBase(periodResgates), true)}</p>
                  </div>
                  <div className="v2-card p-4">
                    <p className="v2-caption">Ganho/Perda</p>
                    <p className="v2-num text-base font-bold mt-1" style={{ color: periodGainBRL >= 0 ? '#00ff88' : '#ff4466' }}>
                      {periodGainBRL >= 0 ? '+' : ''}{fmt(toBase(periodGainBRL), true)}
                    </p>
                  </div>
                </div>
              </div>
            }
          >
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2 pr-9">
              <div>
                <p className="v2-caption">Evolução do patrimônio</p>
                <p className="text-sm text-[#8888aa] mt-0.5">{periodLabel} · estimativa baseada em aportes e ganho linearizado</p>
              </div>
            </div>
            <svg viewBox="0 0 600 200" className="w-full h-48 mt-3" preserveAspectRatio="none">
              <defs>
                <linearGradient id="wealthBig" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#00ff88" stopOpacity="0.30"/>
                  <stop offset="100%" stopColor="#00ff88" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <line x1="0" y1="40" x2="600" y2="40" stroke="#1e1e30" strokeWidth="1"/>
              <line x1="0" y1="100" x2="600" y2="100" stroke="#1e1e30" strokeWidth="1"/>
              <line x1="0" y1="160" x2="600" y2="160" stroke="#1e1e30" strokeWidth="1"/>
              {sparkData.length > 1 && (() => {
                const pts = sparkData.map((v, i) => {
                  const x = (i / (sparkData.length - 1)) * 600
                  const y = 180 - ((v - sparkMin) / sparkRange) * 160
                  return `${x},${y}`
                })
                return (
                  <>
                    <path d={`M${pts.join(' L')} L600,200 L0,200 Z`} fill="url(#wealthBig)"/>
                    <path d={`M${pts.join(' L')}`} fill="none" stroke="#00ff88" strokeWidth="2"/>
                  </>
                )
              })()}
            </svg>
            <div className="mt-3 grid grid-cols-3 gap-3 pt-3 border-t border-[#1e1e30]">
              <div><p className="v2-caption">Início ({periodLabel})</p><p className="v2-num text-base font-bold mt-0.5 text-[#8888aa]">{fmt(toBase(period === 'ALL' ? totals.totalCostBRL : totals.startValueBRL), true)}</p></div>
              <div><p className="v2-caption">Aportes (período)</p><p className="v2-num text-base font-bold mt-0.5" style={{ color: '#00d4ff' }}>+{fmt(toBase(periodAportes), true)}</p></div>
              <div><p className="v2-caption">Atual</p><p className="v2-num text-base font-bold mt-0.5">{fmt(toBase(totals.totalValueBRL), true)}</p></div>
            </div>
          </ExpandableCard>

          {/* Alocação por classe */}
          <ExpandableCard
            title="Alocação por classe · todas"
            subtitle={`${allAllocation.length} classes · ${fmt(toBase(totals.totalValueBRL), true)} totais · perfil ${settings.suitability ?? 'Moderado'}`}
            modalSize="lg"
            detail={
              allAllocation.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Adicione investimentos para ver a alocação.</p>
              ) : (
                <div className="space-y-2">
                  {allAllocation.map(a => (
                    <CategoryRow
                      key={a.name}
                      label={a.name}
                      color={a.color}
                      value={a.value}
                      pct={a.pct}
                      items={a.items}
                      fmt={(v) => fmt(toBase(v), true)}
                      setEditing={setEditing}
                    />
                  ))}
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Alocação por classe</p>
            <p className="text-sm text-[#8888aa] mt-0.5">{allocation.length} classes · perfil {settings.suitability ?? 'Moderado'}</p>
            <div className="mt-4 space-y-3">
              {allocation.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Adicione investimentos para ver a alocação.</p>
              ) : allocation.map(a => {
                const gap = suitabilityGapMap.get(a.name)
                const showGap = gap && gap.targetPct > 0 && Math.abs(gap.gapPct) >= 0.5
                return (
                  <div key={a.name}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.color }}/>
                        <span className="font-medium truncate">{a.name}</span>
                      </span>
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="v2-num font-semibold">{a.pct.toFixed(0)}%</span>
                        {showGap && (
                          <span
                            className="text-[9px] font-bold px-1 py-0.5 rounded"
                            style={{
                              background: gap.gapPct > 0 ? 'rgba(245,158,11,.15)' : 'rgba(0,212,255,.15)',
                              color: gap.gapPct > 0 ? '#f59e0b' : '#00d4ff',
                            }}
                            title={`Alvo: ${gap.targetPct.toFixed(1)}% · ${gap.gapPct > 0 ? 'Reduzir' : 'Aumentar'} ${fmt(toBase(Math.abs(gap.gapValue)), true)}`}
                          >
                            {gap.gapPct > 0 ? '▼' : '▲'} {Math.abs(gap.gapPct).toFixed(0)}pp
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#1e1e30] overflow-hidden">
                      <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(a.pct, 1)}%`, background: a.color }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          </ExpandableCard>

          {/* Top movers (large) */}
          <ExpandableCard
            gridClass="lg:col-span-2"
            title={`Top movers · todos · ${periodLabel}`}
            subtitle={`${movers.length} ativos ranqueados pelo retorno do período`}
            modalSize="xl"
            detail={
              movers.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem ativos para ranquear.</p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[640px] overflow-hidden rounded-xl border border-[#1e1e30] divide-y divide-[#1e1e30]">
                    <div className="grid grid-cols-[40px_1fr_120px_140px_120px] items-center px-3 py-2 text-[10px] uppercase tracking-wider text-[#55556a]">
                      <span>#</span>
                      <span>Ativo · classe</span>
                      <span className="text-right">Posição</span>
                      <span className="text-right">Ganho/Perda</span>
                      <span className="text-right">Retorno</span>
                    </div>
                    {[...movers].sort((a, b) => b.gain - a.gain).map((m, i) => (
                      <div key={m.inv.id} className="grid grid-cols-[40px_1fr_120px_140px_120px] items-center px-3 py-2.5 text-xs v2-row-hover">
                        <span className="text-[#55556a] v2-num">{i + 1}</span>
                        <span className="min-w-0">
                          <span className="block font-semibold truncate flex items-center gap-2">
                            {m.inv.ticker || m.inv.name}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 font-mono">{m.inv.institution}</span>
                          </span>
                          <span className="text-[10px] text-[#55556a]">{m.inv.assetClass}</span>
                        </span>
                        <span className="v2-num text-right font-semibold">{fmt(toBase(m.current), true)}</span>
                        <span className="v2-num text-right font-bold" style={{ color: m.gain >= 0 ? '#00ff88' : '#ff4466' }}>
                          {m.gain >= 0 ? '+' : ''}{fmt(toBase(m.gain), true)}
                        </span>
                        <span className="v2-num text-right" style={{ color: m.pct >= 0 ? '#00ff88' : '#ff4466' }}>
                          {m.pct >= 0 ? '+' : ''}{m.pct.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            }
          >
            <div className="flex items-center justify-between mb-3 pr-9">
              <div>
                <p className="v2-caption">Top movers · {periodLabel}</p>
                <p className="text-sm text-[#8888aa] mt-0.5">Quem mais valorizou e quem mais derrubou no período</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6">
              <div>
                <p className="v2-caption mb-2" style={{ color: '#00ff88' }}>Maiores ganhos</p>
                <div className="space-y-1">
                  {topGainers.length === 0 ? (
                    <p className="text-[11px] text-[#55556a] py-2">Sem ganhos registrados.</p>
                  ) : topGainers.map((m, i) => (
                    <div key={m.inv.id} className="v2-row-hover flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer">
                      <span className="text-xs text-[#55556a] w-4 v2-num">{i + 1}</span>
                      <span className="flex-1 min-w-0">
                        <span className="text-sm font-semibold truncate flex items-center gap-2">
                          {m.inv.ticker || m.inv.name}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 font-mono">{m.inv.institution}</span>
                        </span>
                        <span className="text-[11px] text-[#55556a]">{m.inv.assetClass}</span>
                      </span>
                      <span className="text-right whitespace-nowrap">
                        <span className="v2-num text-sm font-bold block" style={{ color: '#00ff88' }}>+{fmt(toBase(m.gain), true)}</span>
                        <span className="v2-num text-[10px]" style={{ color: '#00ff88' }}>+{m.pct.toFixed(1)}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 sm:mt-0">
                <p className="v2-caption mb-2" style={{ color: '#ff4466' }}>Maiores perdas</p>
                <div className="space-y-1">
                  {topLosers.length === 0 ? (
                    <p className="text-[11px] text-[#55556a] py-2">Sem perdas registradas.</p>
                  ) : topLosers.map((m, i) => (
                    <div key={m.inv.id} className="v2-row-hover flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer">
                      <span className="text-xs text-[#55556a] w-4 v2-num">{i + 1}</span>
                      <span className="flex-1 min-w-0">
                        <span className="text-sm font-semibold truncate flex items-center gap-2">
                          {m.inv.ticker || m.inv.name}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 font-mono">{m.inv.institution}</span>
                        </span>
                        <span className="text-[11px] text-[#55556a]">{m.inv.assetClass}</span>
                      </span>
                      <span className="text-right whitespace-nowrap">
                        <span className="v2-num text-sm font-bold block" style={{ color: '#ff4466' }}>−{fmt(toBase(Math.abs(m.gain)), true)}</span>
                        <span className="v2-num text-[10px]" style={{ color: '#ff4466' }}>{m.pct.toFixed(1)}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ExpandableCard>

          {/* Suitability gauge */}
          <ExpandableCard
            title={`Perfil · ${settings.suitability ?? 'Moderado'}`}
            subtitle="Carteira recomendada vs sua composição atual"
            modalSize="xl"
            detail={
              (() => {
                const profile: SuitabilityProfile = (settings.suitability ?? 'Moderado') as SuitabilityProfile
                const localTargets = LOCAL_TARGETS[profile]
                const intlTargets  = INTL_TARGETS[profile]
                // Actuals by canonical class (BRL)
                const localActuals = new Map<string, number>()
                const intlActuals  = new Map<string, number>()
                let onshoreTotal = 0, offshoreTotal = 0
                investments.forEach(i => {
                  if (i.location === 'physical-re') return
                  const v = convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl)
                  if (v <= 0) return
                  if (i.location === 'offshore') {
                    const k = canonicalIntlClass(i.assetClass)
                    intlActuals.set(k, (intlActuals.get(k) ?? 0) + v)
                    offshoreTotal += v
                  } else {
                    const k = canonicalLocalClass(i.assetClass)
                    localActuals.set(k, (localActuals.get(k) ?? 0) + v)
                    onshoreTotal += v
                  }
                })
                const renderTable = (
                  classes: string[],
                  targets: Record<string, number>,
                  actuals: Map<string, number>,
                  total: number,
                ) => (
                  <div className="overflow-hidden rounded-xl border border-[#1e1e30] divide-y divide-[#1e1e30]">
                    <div className="grid grid-cols-[1fr_70px_70px_70px] items-center px-3 py-2 text-[10px] uppercase tracking-wider text-[#55556a]">
                      <span>Classe</span>
                      <span className="text-right">Alvo</span>
                      <span className="text-right">Atual</span>
                      <span className="text-right">Δ</span>
                    </div>
                    {classes.map(cls => {
                      const targetPct = targets[cls] ?? 0
                      const actualVal = actuals.get(cls) ?? 0
                      const actualPct = total > 0 ? (actualVal / total) * 100 : 0
                      const gap = actualPct - targetPct
                      return (
                        <div key={cls} className="grid grid-cols-[1fr_70px_70px_70px] items-center px-3 py-2.5 text-xs v2-row-hover">
                          <span className="truncate">{cls}</span>
                          <span className="v2-num text-right text-[#8888aa]">{targetPct.toFixed(1)}%</span>
                          <span className="v2-num text-right font-semibold">{actualPct.toFixed(1)}%</span>
                          <span className="v2-num text-right font-semibold" style={{
                            color: Math.abs(gap) < 1 ? '#8888aa' : (gap > 0 ? '#f59e0b' : '#00d4ff'),
                          }}>
                            {gap >= 0 ? '+' : ''}{gap.toFixed(1)}pp
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
                return (
                  <div>
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <div className="v2-card p-4">
                        <p className="v2-caption">Perfil declarado</p>
                        <p className="text-xl font-bold mt-1">{profile}</p>
                      </div>
                      <div className="v2-card p-4">
                        <p className="v2-caption">Total investido</p>
                        <p className="v2-num text-xl font-bold mt-1">{fmt(toBase(totals.totalValueBRL), true)}</p>
                      </div>
                    </div>
                    <div className="grid lg:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="v2-caption">Onshore (BRL)</p>
                          <span className="v2-num text-xs text-[#8888aa]">{fmt(toBase(onshoreTotal), true)}</span>
                        </div>
                        {renderTable(LOCAL_CLASSES, localTargets, localActuals, onshoreTotal)}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="v2-caption">Offshore (USD)</p>
                          <span className="v2-num text-xs text-[#8888aa]">{fmt(toBase(offshoreTotal), true)}</span>
                        </div>
                        {renderTable(INTL_CLASSES, intlTargets, intlActuals, offshoreTotal)}
                      </div>
                    </div>
                    <p className="mt-4 text-[11px] text-[#55556a] leading-relaxed">
                      Alvos oficiais Luxor por perfil de suitability. Δ positiva (laranja) = sobreponderado vs alvo;
                      Δ negativa (ciano) = subponderado.
                    </p>
                    <button
                      onClick={() => navigate(pfPath('/settings') + '#investidor')}
                      className="w-full mt-4 px-3 py-2.5 rounded-xl text-xs font-semibold border border-[#1e1e30] bg-[#0f1018] text-[#00d4ff] hover:border-[#00d4ff]/40"
                    >
                      Ajustar perfil em Configurações → Perfil de Investidor
                    </button>
                  </div>
                )
              })()
            }
          >
            <div className="flex items-center justify-between pr-9">
              <div>
                <p className="v2-caption">Perfil · Suitability</p>
                <p className="text-sm text-[#8888aa] mt-0.5">{settings.suitability ?? 'Moderado'}</p>
              </div>
            </div>
            <div className="mt-3 flex justify-center">
              <svg viewBox="0 0 180 110" className="w-44">
                <defs>
                  <linearGradient id="gaugeGrad" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%"   stopColor="#00d4ff"/>
                    <stop offset="50%"  stopColor="#00ff88"/>
                    <stop offset="100%" stopColor="#ff7a00"/>
                  </linearGradient>
                </defs>
                <path d="M 20 100 A 70 70 0 0 1 160 100" fill="none" stroke="#1e1e30" strokeWidth="14" strokeLinecap="round"/>
                <path d="M 20 100 A 70 70 0 0 1 160 100" fill="none" stroke="url(#gaugeGrad)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(gaugeScore / 100) * 220} 999`}/>
                <line x1="90" y1="100" x2={needleX} y2={needleY} stroke="#e8e8f0" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="90" cy="100" r="5" fill="#e8e8f0"/>
                <text x="90" y="92" textAnchor="middle" fill="#e8e8f0" fontSize="14" fontWeight="700" fontFamily="Inter">{gaugeScore}</text>
                <text x="20" y="108" fill="#55556a" fontSize="9" fontFamily="Inter">Conservador</text>
                <text x="160" y="108" textAnchor="end" fill="#55556a" fontSize="9" fontFamily="Inter">Agressivo</text>
              </svg>
            </div>
            <div className="mt-2 pt-3 border-t border-[#1e1e30] space-y-1.5 text-xs">
              <div className="flex items-center justify-between"><span className="text-[#8888aa]">Ativos</span><span className="v2-num font-semibold">{investments.length}</span></div>
              <div className="flex items-center justify-between"><span className="text-[#8888aa]">Classes</span><span className="v2-num font-semibold">{allocation.length}</span></div>
              <div className="flex items-center justify-between"><span className="text-[#8888aa]">Offshore</span><span className="v2-num font-semibold">
                {totals.totalValueBRL > 0
                  ? `${((investments.filter(i => i.location === 'offshore').reduce((s, i) => s + convert(i.quantity * i.currentPrice, i.currency, 'BRL', usdToBrl, eurToBrl), 0) / totals.totalValueBRL) * 100).toFixed(0)}%`
                  : '—'}
              </span></div>
            </div>
          </ExpandableCard>

        </section>

        {/* ─── TAXONOMIES · CLASS + PRODUCT TYPE ──────── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 v2-reveal">

          {/* Class breakdown */}
          <ExpandableCard
            title={`Carteira ${globalLocation === 'all' ? 'Global' : globalLocation === 'onshore' ? 'Onshore' : 'Offshore'} · por classe`}
            subtitle={`${onshoreClassBreakdown.rows.filter(r => r.value > 0).length} classes · ${fmt(toBase(onshoreClassBreakdown.total), true)} totais`}
            modalSize="lg"
            detail={
              onshoreClassBreakdown.total <= 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem ativos para classificar.</p>
              ) : (
                <div className="space-y-2">
                  {onshoreClassBreakdown.rows.map(r => (
                    <CategoryRow
                      key={r.label}
                      label={r.label}
                      color={r.color}
                      value={r.value}
                      pct={r.pct}
                      items={r.items}
                      fmt={(v) => fmt(toBase(v), true)}
                      setEditing={setEditing}
                    />
                  ))}
                </div>
              )
            }
          >
            <div className="flex items-center justify-between mb-1 pr-9">
              <p className="v2-caption">{globalLocation === 'all' ? 'Global' : globalLocation === 'onshore' ? 'Onshore' : 'Offshore'} · por classe</p>
            </div>
            <p className="text-sm text-[#8888aa] mt-0.5">{onshoreClassBreakdown.rows.filter(r => r.value > 0).length} classes · {globalLocation === 'onshore' ? 'ordem fixa' : 'por valor'}</p>
            <div className="mt-4 space-y-2.5">
              {onshoreClassBreakdown.total <= 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem ativos.</p>
              ) : onshoreClassBreakdown.rows.map(r => (
                <div key={r.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }}/>
                      <span className="font-medium truncate">{r.label}</span>
                    </span>
                    <span className="v2-num font-semibold flex-shrink-0">{r.pct.toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(r.pct, 0.5)}%`, background: r.color }}/>
                  </div>
                </div>
              ))}
            </div>
          </ExpandableCard>

          {/* Product type breakdown */}
          <ExpandableCard
            title={`Carteira ${globalLocation === 'all' ? 'Global' : globalLocation === 'onshore' ? 'Onshore' : 'Offshore'} · por tipo de produto`}
            subtitle={`${onshoreProductBreakdown.rows.filter(r => r.value > 0).length} tipos com posição · ${fmt(toBase(onshoreProductBreakdown.total), true)} totais`}
            modalSize="xl"
            detail={
              onshoreProductBreakdown.total <= 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem ativos para classificar.</p>
              ) : (
                <div className="space-y-2">
                  {onshoreProductBreakdown.rows.filter(r => r.value > 0).map(r => (
                    <CategoryRow
                      key={r.label}
                      label={r.label}
                      color={r.color}
                      value={r.value}
                      pct={r.pct}
                      items={r.items}
                      fmt={(v) => fmt(toBase(v), true)}
                      setEditing={setEditing}
                    />
                  ))}
                </div>
              )
            }
          >
            <div className="flex items-center justify-between mb-1 pr-9">
              <p className="v2-caption">{globalLocation === 'all' ? 'Global' : globalLocation === 'onshore' ? 'Onshore' : 'Offshore'} · por produto</p>
            </div>
            <p className="text-sm text-[#8888aa] mt-0.5">{onshoreProductBreakdown.rows.filter(r => r.value > 0).length} tipos com posição · alfabético</p>
            <div className="mt-4 space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
              {onshoreProductBreakdown.total <= 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem ativos.</p>
              ) : onshoreProductBreakdown.rows.filter(r => r.value > 0).map(r => (
                <div key={r.label}>
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: r.color }}/>
                      <span className="truncate">{r.label}</span>
                    </span>
                    <span className="v2-num font-semibold flex-shrink-0">{r.pct.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(r.pct, 0.5)}%`, background: r.color }}/>
                  </div>
                </div>
              ))}
            </div>
          </ExpandableCard>

        </section>

        {/* ─── BREAKDOWNS · 4 DONUT CARDS ───────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 v2-reveal">

          {/* Liquidez */}
          <ExpandableCard
            title="Liquidez · prazo de resgate"
            subtitle={`${liquidityBreakdown.rows.length} prazos representados na carteira`}
            modalSize="lg"
            detail={
              liquidityBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem ativos para classificar.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={liquidityBreakdown.slices} size={200} centerLabel="Liquidez"/></div>
                  <div className="space-y-2">
                    {liquidityBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Liquidez</p>
            <p className="text-sm text-[#8888aa] mt-0.5">D+0 → Vencimento</p>
            <div className="mt-4">
              {liquidityBreakdown.rows.filter(r => r.value > 0).length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem liquidez informada.</p>
              ) : (
                <>
                  <div className="h-5 rounded-lg overflow-hidden flex gap-px">
                    {liquidityBreakdown.rows.filter(r => r.value > 0).map(r => (
                      <div key={r.key} style={{ width: `${Math.max(r.pct, 1)}%`, background: r.color, flexShrink: 0 }} title={`${r.key}: ${r.pct.toFixed(1)}%`}/>
                    ))}
                  </div>
                  <div className="mt-3 space-y-1.5 max-h-[160px] overflow-y-auto">
                    {liquidityBreakdown.rows.filter(r => r.value > 0).map(r => (
                      <div key={r.key} className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: r.color }}/>
                          <span className="truncate">{r.key}</span>
                        </span>
                        <span className="v2-num font-semibold flex-shrink-0 ml-2">{r.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </ExpandableCard>

          {/* Tributação */}
          <ExpandableCard
            title="Tributação · regime fiscal"
            subtitle="Distribuição entre tributável, isento e diferido"
            modalSize="lg"
            detail={
              taxBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem ativos com tributação informada.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={taxBreakdown.slices} size={200} centerLabel="Tributação"/></div>
                  <div className="space-y-2">
                    {taxBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={taxLabel[r.key] ?? r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                        footnote={
                          r.key === 'taxable'      ? 'CDB, LF, COE, ações — tributação na fonte ou come-cotas' :
                          r.key === 'tax-deferred' ? 'PGBL, VGBL — tributação só no resgate' :
                          r.key === 'tax-exempt'   ? 'LCI, LCA, CRI, CRA, debêntures incentivadas — isento de IR' :
                          r.key === 'unset'        ? 'Cadastre o regime no formulário do investimento' :
                                                     undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Tributação</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Regime fiscal</p>
            <div className="mt-4 space-y-2">
              {taxBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem tributação informada.</p>
              ) : taxBreakdown.rows.map(r => (
                <div key={r.key} className="relative rounded-lg overflow-hidden px-3 py-2.5 flex items-center justify-between" style={{ background: `${r.color}12`, border: `1px solid ${r.color}28` }}>
                  <div className="absolute left-0 top-0 bottom-0 rounded-l-lg opacity-25" style={{ width: `${Math.max(r.pct, 2)}%`, background: r.color }}/>
                  <span className="relative text-xs font-medium truncate">{taxLabel[r.key] ?? r.key}</span>
                  <span className="relative v2-num text-sm font-bold flex-shrink-0 ml-2" style={{ color: r.color }}>{r.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </ExpandableCard>

          {/* Instituição / corretora */}
          <ExpandableCard
            title="Instituições · corretoras e bancos"
            subtitle={`${institutionBreakdown.rows.length} instituições · ${fmt(toBase(institutionBreakdown.total), true)} totais`}
            modalSize="lg"
            detail={
              institutionBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem instituições cadastradas.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={institutionBreakdown.slices} size={200} centerLabel="Instituições"/></div>
                  <div className="space-y-2">
                    {institutionBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Instituição</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Corretora / Banco</p>
            <div className="mt-4 space-y-2.5">
              {institutionBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem instituições.</p>
              ) : institutionBreakdown.rows.slice(0, 6).map(r => (
                <div key={r.key} className="flex items-center gap-2 text-[11px]">
                  <span className="w-14 text-[#8888aa] truncate text-right flex-shrink-0">{r.key}</span>
                  <div className="flex-1 h-2 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(r.pct, 1)}%`, background: r.color }}/>
                  </div>
                  <span className="v2-num font-semibold w-8 flex-shrink-0">{r.pct.toFixed(0)}%</span>
                </div>
              ))}
              {institutionBreakdown.rows.length > 6 && (
                <p className="text-[10px] text-[#55556a]">+ {institutionBreakdown.rows.length - 6} mais</p>
              )}
            </div>
          </ExpandableCard>

          {/* Risco */}
          <ExpandableCard
            title="Risco · classificação dos ativos"
            subtitle="Escala 1 (muito baixo) → 5 (muito alto)"
            modalSize="lg"
            detail={
              riskBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem ativos com nível de risco informado.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={riskBreakdown.slices} size={200} centerLabel="Risco"/></div>
                  <div className="space-y-2">
                    {riskBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={`${r.key === 'unset' ? '—' : r.key} · ${riskLabel[r.key] ?? r.key}`}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Risco</p>
            <p className="text-sm text-[#8888aa] mt-0.5">1 Muito baixo → 5 Muito alto</p>
            <div className="mt-4">
              <div className="h-2.5 rounded-full" style={{ background: 'linear-gradient(to right, #00ff88, #84cc16, #f59e0b, #ff7a00, #ff4466)' }}/>
              <div className="mt-3 grid grid-cols-5 gap-1">
                {(['1','2','3','4','5'] as const).map(lvl => {
                  const row = riskBreakdown.rows.find(r => r.key === lvl)
                  const cols: Record<string, string> = { '1': '#00ff88', '2': '#84cc16', '3': '#f59e0b', '4': '#ff7a00', '5': '#ff4466' }
                  const col = cols[lvl]
                  const labels = ['MB','B','M','A','MA']
                  return (
                    <div key={lvl} className="text-center space-y-1">
                      <div className="h-10 rounded-md flex items-end justify-center pb-1.5" style={{
                        background: row ? `${col}18` : '#0f1018',
                        border: `1px solid ${row ? col + '30' : '#1e1e30'}`,
                      }}>
                        <span className="v2-num text-[11px] font-bold" style={{ color: row ? col : '#2a2a40' }}>
                          {row ? `${row.pct.toFixed(0)}%` : '—'}
                        </span>
                      </div>
                      <p className="text-[9px] text-[#55556a]">{labels[parseInt(lvl)-1]}</p>
                    </div>
                  )
                })}
              </div>
              {riskBreakdown.rows.some(r => r.key === 'unset') && (
                <p className="mt-2 text-[10px] text-[#55556a]">
                  {riskBreakdown.rows.find(r => r.key === 'unset')?.pct.toFixed(0)}% sem classificação
                </p>
              )}
            </div>
          </ExpandableCard>

        </section>

        {/* ─── ANÁLISE · 6 DONUT CARDS ───────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 v2-reveal">

          {/* Emissor */}
          <ExpandableCard
            title="Emissor · por emissor do ativo"
            subtitle={`${emisssorBreakdown.rows.filter(r => r.value > 0).length} emissores · ${fmt(toBase(emisssorBreakdown.total), true)} totais`}
            modalSize="lg"
            detail={
              emisssorBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem emissores cadastrados.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={emisssorBreakdown.slices} size={200} centerLabel="Emissor"/></div>
                  <div className="space-y-2">
                    {emisssorBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Emissor</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Por emissor do ativo</p>
            <div className="mt-4 space-y-2">
              {emisssorBreakdown.rows.filter(r => r.value > 0).length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem emissores cadastrados.</p>
              ) : emisssorBreakdown.rows.filter(r => r.value > 0).slice(0, 6).map(r => (
                <div key={r.key} className="flex items-center gap-2 text-[11px]">
                  <span className="w-16 text-[#8888aa] truncate text-right flex-shrink-0">{r.key}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(r.pct, 1)}%`, background: r.color }}/>
                  </div>
                  <span className="v2-num font-semibold w-8 flex-shrink-0">{r.pct.toFixed(0)}%</span>
                </div>
              ))}
              {emisssorBreakdown.rows.filter(r => r.value > 0).length > 6 && (
                <p className="text-[10px] text-[#55556a]">+ {emisssorBreakdown.rows.filter(r => r.value > 0).length - 6} mais</p>
              )}
            </div>
          </ExpandableCard>

          {/* Holding */}
          <ExpandableCard
            title="Holding · grupo econômico"
            subtitle={`${holdingBreakdown.rows.filter(r => r.value > 0).length} holdings · ${fmt(toBase(holdingBreakdown.total), true)} totais`}
            modalSize="lg"
            detail={
              holdingBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem holdings cadastradas.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={holdingBreakdown.slices} size={200} centerLabel="Holding"/></div>
                  <div className="space-y-2">
                    {holdingBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Holding</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Grupo econômico</p>
            <div className="mt-4 space-y-2">
              {holdingBreakdown.rows.filter(r => r.value > 0).length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem holdings cadastradas.</p>
              ) : holdingBreakdown.rows.filter(r => r.value > 0).slice(0, 6).map(r => (
                <div key={r.key} className="flex items-center gap-2 text-[11px]">
                  <span className="w-16 text-[#8888aa] truncate text-right flex-shrink-0">{r.key}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(r.pct, 1)}%`, background: r.color }}/>
                  </div>
                  <span className="v2-num font-semibold w-8 flex-shrink-0">{r.pct.toFixed(0)}%</span>
                </div>
              ))}
              {holdingBreakdown.rows.filter(r => r.value > 0).length > 6 && (
                <p className="text-[10px] text-[#55556a]">+ {holdingBreakdown.rows.filter(r => r.value > 0).length - 6} mais</p>
              )}
            </div>
          </ExpandableCard>

          {/* Vencimento */}
          <ExpandableCard
            title="Vencimento · prazo dos ativos"
            subtitle={`${maturityBreakdown.rows.filter(r => r.value > 0).length} faixas de prazo representadas`}
            modalSize="lg"
            detail={
              maturityBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem datas de vencimento informadas.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={maturityBreakdown.slices} size={200} centerLabel="Vencimento"/></div>
                  <div className="space-y-2">
                    {maturityBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Vencimento</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Curto → Longo prazo</p>
            <div className="mt-4">
              {maturityBreakdown.rows.filter(r => r.value > 0).length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem vencimentos informados.</p>
              ) : (
                <>
                  <div className="h-5 rounded-lg overflow-hidden flex gap-px">
                    {maturityBreakdown.rows.filter(r => r.value > 0).map(r => (
                      <div key={r.key} style={{ width: `${Math.max(r.pct, 1)}%`, background: r.color, flexShrink: 0 }} title={`${r.key}: ${r.pct.toFixed(1)}%`}/>
                    ))}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {maturityBreakdown.rows.filter(r => r.value > 0).map(r => (
                      <div key={r.key} className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: r.color }}/>
                          <span className="truncate">{r.key}</span>
                        </span>
                        <span className="v2-num font-semibold flex-shrink-0 ml-2">{r.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </ExpandableCard>

          {/* Frequência de pagamento de juros */}
          <ExpandableCard
            title="Frequência de juros · pagamento de cupons"
            subtitle={`${paymentFreqBreakdown.rows.filter(r => r.value > 0).length} frequências representadas`}
            modalSize="lg"
            detail={
              paymentFreqBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem frequência de pagamento informada.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={paymentFreqBreakdown.slices} size={200} centerLabel="Frequência"/></div>
                  <div className="space-y-2">
                    {paymentFreqBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Freq. de Juros</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Pagamento de cupons</p>
            <div className="mt-4 space-y-2">
              {paymentFreqBreakdown.rows.filter(r => r.value > 0).length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem freq. informada.</p>
              ) : paymentFreqBreakdown.rows.filter(r => r.value > 0).map(r => (
                <div key={r.key} className="relative rounded-lg overflow-hidden px-3 py-2.5 flex items-center justify-between" style={{ background: `${r.color}12`, border: `1px solid ${r.color}28` }}>
                  <div className="absolute left-0 top-0 bottom-0 rounded-l-lg opacity-25" style={{ width: `${Math.max(r.pct, 2)}%`, background: r.color }}/>
                  <span className="relative text-xs font-medium truncate">{r.key}</span>
                  <span className="relative v2-num text-sm font-bold flex-shrink-0 ml-2" style={{ color: r.color }}>{r.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </ExpandableCard>

          {/* Setor */}
          <ExpandableCard
            title="Setor · exposição setorial"
            subtitle={`${sectorBreakdown.rows.filter(r => r.value > 0).length} setores · ${fmt(toBase(sectorBreakdown.total), true)} totais`}
            modalSize="lg"
            detail={
              sectorBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem setores cadastrados.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={sectorBreakdown.slices} size={200} centerLabel="Setor"/></div>
                  <div className="space-y-2">
                    {sectorBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Setor</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Exposição setorial</p>
            <div className="mt-4 space-y-2">
              {sectorBreakdown.rows.filter(r => r.value > 0).length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem setores cadastrados.</p>
              ) : sectorBreakdown.rows.filter(r => r.value > 0).slice(0, 6).map(r => (
                <div key={r.key} className="flex items-center gap-2 text-[11px]">
                  <span className="w-16 text-[#8888aa] truncate text-right flex-shrink-0">{r.key}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(r.pct, 1)}%`, background: r.color }}/>
                  </div>
                  <span className="v2-num font-semibold w-8 flex-shrink-0">{r.pct.toFixed(0)}%</span>
                </div>
              ))}
              {sectorBreakdown.rows.filter(r => r.value > 0).length > 6 && (
                <p className="text-[10px] text-[#55556a]">+ {sectorBreakdown.rows.filter(r => r.value > 0).length - 6} mais</p>
              )}
            </div>
          </ExpandableCard>

          {/* Benchmark */}
          <ExpandableCard
            title="Benchmark · índice de referência"
            subtitle={`${benchmarkBreakdown.rows.filter(r => r.value > 0).length} benchmarks representados`}
            modalSize="lg"
            detail={
              benchmarkBreakdown.rows.length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-8">Sem benchmark informado.</p>
              ) : (
                <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="flex justify-center"><Donut data={benchmarkBreakdown.slices} size={200} centerLabel="Benchmark"/></div>
                  <div className="space-y-2">
                    {benchmarkBreakdown.rows.map(r => (
                      <CategoryRow
                        key={r.key}
                        label={r.key}
                        color={r.color}
                        value={r.value}
                        pct={r.pct}
                        items={r.items}
                        fmt={(v) => fmt(toBase(v), true)}
                        setEditing={setEditing}
                      />
                    ))}
                  </div>
                </div>
              )
            }
          >
            <p className="v2-caption pr-9">Benchmark</p>
            <p className="text-sm text-[#8888aa] mt-0.5">Índice de referência</p>
            <div className="mt-4 space-y-2">
              {benchmarkBreakdown.rows.filter(r => r.value > 0).length === 0 ? (
                <p className="text-xs text-[#55556a] text-center py-6">Sem benchmark informado.</p>
              ) : benchmarkBreakdown.rows.filter(r => r.value > 0).slice(0, 6).map(r => (
                <div key={r.key} className="flex items-center gap-2 text-[11px]">
                  <span className="w-16 text-[#8888aa] truncate text-right flex-shrink-0">{r.key}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#1e1e30] overflow-hidden">
                    <div className="v2-cat-bar h-full rounded-full" style={{ width: `${Math.max(r.pct, 1)}%`, background: r.color }}/>
                  </div>
                  <span className="v2-num font-semibold w-8 flex-shrink-0">{r.pct.toFixed(0)}%</span>
                </div>
              ))}
              {benchmarkBreakdown.rows.filter(r => r.value > 0).length > 6 && (
                <p className="text-[10px] text-[#55556a]">+ {benchmarkBreakdown.rows.filter(r => r.value > 0).length - 6} mais</p>
              )}
            </div>
          </ExpandableCard>

        </section>

        {/* BENCHMARKS */}
        {(() => {
          const latestBenchDate = benchmarkData[benchmarkData.length - 1]?.date ?? '2026-04-30'
          const BENCH_PERIODS = buildBenchPeriods(latestBenchDate)
          const latestLabel = `${PT_MONTHS_SHORT[parseInt(latestBenchDate.slice(5,7),10)-1]}/${latestBenchDate.slice(2,4)}`
          const activeRows = ALL_BENCHMARKS.filter(b => visibleBenchmarks.includes(b.key))
          const availableToAdd = ALL_BENCHMARKS.filter(b => !visibleBenchmarks.includes(b.key))
          const cells = BENCH_PERIODS.map(p => compoundBench(benchmarkData, p.from, p.to, visibleBenchmarks))
          const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

          const toggleBenchSort = (key: 'name' | number) => {
            setBenchSort(prev =>
              prev.key === key
                ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
                : { key, dir: key === 'name' ? 'asc' : 'desc' }
            )
          }
          const sortedRows = [...activeRows].sort((a, b) => {
            if (benchSort.key === 'name') {
              const cmp = a.label.localeCompare(b.label, 'pt-BR')
              return benchSort.dir === 'asc' ? cmp : -cmp
            }
            const pi = benchSort.key as number
            const av = cells[pi]?.[a.key] ?? (benchSort.dir === 'desc' ? -Infinity : Infinity)
            const bv = cells[pi]?.[b.key] ?? (benchSort.dir === 'desc' ? -Infinity : Infinity)
            return benchSort.dir === 'desc' ? bv - av : av - bv
          })
          const SortIcon = ({ col }: { col: 'name' | number }) => {
            const active = benchSort.key === col
            return (
              <svg className="inline-block ml-1 w-2.5 h-2.5" viewBox="0 0 10 12" fill="none">
                <path d="M5 1L5 11M2 4L5 1L8 4" stroke={active && benchSort.dir === 'asc' ? '#00d4ff' : '#55556a'} strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M5 11L5 1M2 8L5 11L8 8" stroke={active && benchSort.dir === 'desc' ? '#00d4ff' : '#55556a'} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )
          }

          const addBenchmark = (key: keyof Omit<BenchmarkMonthly,'date'>) => {
            const next = [...visibleBenchmarks, key]
            setVisibleBenchmarks(next)
            try { localStorage.setItem('luxorpro_visible_benchmarks', JSON.stringify(next)) } catch { /* ignore */ }
            setShowBenchmarkPicker(false)
          }
          const removeBenchmark = (key: keyof Omit<BenchmarkMonthly,'date'>) => {
            const next = visibleBenchmarks.filter(k => k !== key)
            setVisibleBenchmarks(next)
            try { localStorage.setItem('luxorpro_visible_benchmarks', JSON.stringify(next)) } catch { /* ignore */ }
          }

          return (
            <section className="v2-reveal">
              <div className="v2-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,212,255,.1)', color: '#00d4ff' }}>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    </span>
                    <div>
                      <p className="text-sm font-semibold tracking-wide">Benchmarks</p>
                      <p className="text-xs text-[#55556a] mt-0.5">Retornos acumulados por período · até {latestLabel}</p>
                    </div>
                  </div>
                  <div className="relative">
                    {availableToAdd.length > 0 && (
                      <button
                        onClick={() => setShowBenchmarkPicker(v => !v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#1e1e30] bg-[#0a0a0f] text-[#8888aa] hover:text-[#00d4ff] hover:border-[#00d4ff]/30 transition-colors"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Adicionar
                      </button>
                    )}
                    {showBenchmarkPicker && availableToAdd.length > 0 && (
                      <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-xl border border-[#1e1e30] bg-[#0d0e1a] shadow-2xl overflow-hidden">
                        {availableToAdd.map(b => (
                          <button
                            key={b.key}
                            onClick={() => addBenchmark(b.key)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left hover:bg-[#161729] transition-colors"
                          >
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }}/>
                            <span className="text-[#c8c8e0]">{b.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left pb-3 pr-4 w-36">
                          <button
                            onClick={() => toggleBenchSort('name')}
                            className="text-[10px] font-semibold uppercase tracking-widest transition-colors hover:text-[#00d4ff]"
                            style={{ color: benchSort.key === 'name' ? '#00d4ff' : '#55556a' }}
                          >
                            Índice<SortIcon col="name"/>
                          </button>
                        </th>
                        {BENCH_PERIODS.map((p, pi) => (
                          <th key={p.label} className="text-right pb-3 px-2">
                            <button
                              onClick={() => toggleBenchSort(pi)}
                              className="text-[10px] font-semibold uppercase tracking-widest transition-colors hover:text-[#00d4ff]"
                              style={{ color: benchSort.key === pi ? '#00d4ff' : '#55556a' }}
                            >
                              {p.label}<SortIcon col={pi}/>
                            </button>
                          </th>
                        ))}
                        <th className="w-6 pb-3"/>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((row, ri) => (
                        <tr key={row.key} style={{ borderTop: ri === 0 ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(255,255,255,0.03)' }}>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }}/>
                              <span className="text-xs font-semibold" style={{ color: row.color }}>{row.label}</span>
                            </div>
                          </td>
                          {cells.map((c, ci) => {
                            const val = c[row.key] ?? null
                            return (
                              <td key={ci} className="py-3 px-2 text-right">
                                {val === null || val === undefined
                                  ? <span className="text-xs text-[#2a2a3e]">—</span>
                                  : <span
                                      className="text-xs font-semibold v2-num tabular-nums"
                                      style={{
                                        color: val >= 0 ? '#00ff88' : '#ff4466',
                                        background: val >= 0 ? 'rgba(0,255,136,0.08)' : 'rgba(255,68,102,0.08)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                      }}
                                    >
                                      {fmtPct(val)}
                                    </span>
                                }
                              </td>
                            )
                          })}
                          <td className="py-3 pl-1">
                            {visibleBenchmarks.length > 1 && (
                              <button
                                onClick={() => removeBenchmark(row.key)}
                                className="w-5 h-5 flex items-center justify-center rounded text-[#55556a] hover:text-[#ff4466] hover:bg-[#ff446610] transition-colors opacity-0 group-hover:opacity-100"
                                style={{ opacity: 0.4 }}
                                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                                onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )
        })()}

        {/* POSIÇÕES */}
        <section className="v2-reveal">
          <details className="v2-card group" open>
            <summary className="cursor-pointer list-none flex items-center justify-between p-5 hover:bg-[#161729] transition-colors rounded-2xl">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,212,255,.1)', color: '#00d4ff' }}><Layers className="w-4 h-4"/></span>
                <div>
                  <p className="text-sm font-semibold">Todas as posições · {investments.length} ativos</p>
                  <p className="text-xs text-[#55556a]">Use os filtros para refinar por classe ou ticker</p>
                </div>
              </div>
              <span className="flex items-center gap-3">
                <span className="v2-caption v2-num">{positions.length} ativos</span>
                <ChevronDown className="w-4 h-4 text-[#55556a] transition-transform group-open:rotate-180"/>
              </span>
            </summary>
            <div className="px-5 pb-5">
              {/* ── Filter bar ── */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <div className="flex-1 min-w-[160px] relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#55556a]"/>
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar ticker, ativo, instituição…"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-[#0a0a0f] border border-[#1e1e30] text-[#e8e8f0] placeholder:text-[#55556a] focus:outline-none focus:border-[#00d4ff]/40"
                  />
                </div>
                <select value={filterClass} onChange={e => setFilterClass(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-medium border border-[#1e1e30] bg-[#0a0a0f] text-[#8888aa] max-w-[180px]">
                  <option value="all">Classe: todas</option>
                  {allClassesForFilter.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filterInstitution} onChange={e => setFilterInstitution(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-medium border border-[#1e1e30] bg-[#0a0a0f] text-[#8888aa] max-w-[180px]">
                  <option value="all">Instituição: todas</option>
                  {Array.from(new Set(investments.map(i => i.institution).filter(Boolean))).sort().map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filterTax} onChange={e => setFilterTax(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-medium border border-[#1e1e30] bg-[#0a0a0f] text-[#8888aa]">
                  <option value="all">Tributação: todas</option>
                  <option value="taxable">Tributável</option>
                  <option value="tax-deferred">Imp. diferido</option>
                  <option value="tax-exempt">Isento</option>
                  <option value="unset">Não classif.</option>
                </select>
                {(filterClass !== 'all' || filterInstitution !== 'all' || filterTax !== 'all' || search) && (
                  <button
                    onClick={() => { setFilterClass('all'); setFilterInstitution('all'); setFilterTax('all'); setSearch('') }}
                    className="px-3 py-2 rounded-lg text-xs font-medium border border-[#1e1e30] bg-[#0a0a0f] text-[#ff7a00] hover:border-[#ff7a00]/40"
                  >Limpar filtros</button>
                )}
                {/* Column picker */}
                <div className="relative ml-auto flex-shrink-0">
                  <button
                    onClick={() => setShowColPicker(v => !v)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border bg-[#0a0a0f] flex items-center gap-1.5 transition-colors ${showColPicker ? 'border-[#00d4ff]/50 text-[#00d4ff]' : 'border-[#1e1e30] text-[#8888aa] hover:text-[#e8e8f0]'}`}
                  >
                    <Columns className="w-3.5 h-3.5"/>
                    Colunas
                  </button>
                  {showColPicker && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowColPicker(false)}/>
                      <div className="absolute top-full right-0 mt-1.5 w-52 rounded-xl border border-[#1e1e30] bg-[#13142a] shadow-2xl z-50 p-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#55556a]">Colunas</span>
                          <button onClick={() => updateCols(DEFAULT_COL_IDS)} className="text-[9px] text-[#00d4ff] hover:underline">Restaurar</button>
                        </div>
                        {POS_COL_DEFS.filter(c => c.fixed).map(col => (
                          <div key={col.id} className="flex items-center gap-2 py-1 px-1 rounded text-[11px] text-[#55556a]">
                            <span className="w-3 h-3"/>
                            <span className="w-3.5 h-3.5 rounded bg-[#1e1e30] flex items-center justify-center text-[8px]">✓</span>
                            <span>{col.label}</span>
                            <span className="ml-auto text-[9px] opacity-50">fixo</span>
                          </div>
                        ))}
                        <div className="my-1.5 border-t border-[#1e1e30]"/>
                        {POS_COL_DEFS.filter(c => !c.fixed).map(col => {
                          const isOn = visibleCols.includes(col.id)
                          const visIdx = visibleCols.indexOf(col.id)
                          return (
                            <div
                              key={col.id}
                              draggable={isOn}
                              onDragStart={() => { dragColFrom.current = visIdx }}
                              onDragOver={e => { if (isOn) e.preventDefault() }}
                              onDrop={() => {
                                if (!isOn || dragColFrom.current === null || dragColFrom.current === visIdx) return
                                const nc = [...visibleCols]
                                const [m] = nc.splice(dragColFrom.current, 1)
                                nc.splice(visIdx, 0, m)
                                updateCols(nc)
                                dragColFrom.current = null
                              }}
                              onClick={() => isOn ? updateCols(visibleCols.filter(id => id !== col.id)) : updateCols([...visibleCols, col.id])}
                              className="flex items-center gap-2 py-1 px-1 rounded text-[11px] cursor-pointer hover:bg-[#1e1e30]/60 select-none"
                            >
                              {isOn
                                ? <GripVertical className="w-3 h-3 text-[#55556a] cursor-grab flex-shrink-0"/>
                                : <span className="w-3 h-3 flex-shrink-0"/>
                              }
                              <span
                                className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 text-[8px] font-bold leading-none"
                                style={{ background: isOn ? 'rgba(0,212,255,.2)' : 'transparent', border: `1px solid ${isOn ? '#00d4ff' : '#1e1e30'}`, color: '#00d4ff' }}
                              >{isOn ? '✓' : ''}</span>
                              <span style={{ color: isOn ? '#c8c8e0' : '#55556a' }}>{col.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
              {/* ── Table ── */}
              <div className="overflow-x-auto">
                {(() => {
                  const gridTemplate = visibleCols.map(id => POS_COL_DEFS.find(c => c.id === id)!.width).join(' ') + ' 32px'
                  const pctCell = (pct: number | null) => pct === null
                    ? <span className="v2-num text-right tabular-nums text-[11px]" style={{ color: '#2a2a3e' }}>—</span>
                    : <span className="v2-num text-right font-semibold tabular-nums text-[11px]" style={{ color: pct >= 0 ? '#00ff88' : '#ff4466' }}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
                  return (
                    <div className="min-w-full overflow-hidden rounded-xl border border-[#1e1e30]">
                      {/* Column header */}
                      <div
                        className="grid items-center gap-1 px-4 py-2.5"
                        style={{ gridTemplateColumns: gridTemplate, background: '#080910', borderBottom: '1px solid #1e1e30' }}
                      >
                        {visibleCols.map(colId => {
                          const col = POS_COL_DEFS.find(c => c.id === colId)!
                          const label = col.id === 'period' ? `Retorno ${periodLabel}` : col.label
                          return col.sortKey ? (
                            <button
                              key={colId}
                              onClick={() => toggleSort(col.sortKey!)}
                              className={`text-[10px] font-semibold uppercase tracking-widest transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'} w-full`}
                              style={{ color: sortKey === col.sortKey ? '#00d4ff' : '#44445a' }}
                            >
                              {label}{sortIcon(col.sortKey)}
                            </button>
                          ) : (
                            <span key={colId} className={`text-[10px] font-semibold uppercase tracking-widest ${col.align === 'right' ? 'text-right' : 'text-left'}`} style={{ color: '#44445a' }}>{label}</span>
                          )
                        })}
                        <span/>
                      </div>

                      {/* Body */}
                      {positions.length === 0 ? (
                        <div className="px-4 py-10 text-center text-xs text-[#55556a]">Nenhum ativo encontrado.</div>
                      ) : groupedPositions.flatMap(({ key, items, totalBRL, gainPct, totalAllocPct, grpMtd, grpPrevMonth, grpYtd, grp12m, grp24m, grpInception }) => [

                        /* ── Group header — same grid as rows for pixel-perfect column alignment ── */
                        <div
                          key={`grp-${key}`}
                          className="grid items-center gap-1 px-4"
                          style={{
                            gridTemplateColumns: gridTemplate,
                            paddingTop: '8px',
                            paddingBottom: '8px',
                            background: 'linear-gradient(90deg, rgba(0,212,255,0.06) 0%, rgba(0,212,255,0.02) 40%, transparent 100%)',
                            borderTop: '1px solid rgba(0,212,255,0.12)',
                            borderBottom: '1px solid rgba(0,212,255,0.08)',
                          }}
                        >
                          {(() => {
                            // Columns that show a value — everything to the left is label territory
                            const VALUE_COLS = new Set(['allocation','position','period','mtd','prevMonth','ytd','m12','m24','inception'])
                            const pivotIdx = visibleCols.findIndex(id => VALUE_COLS.has(id))
                            const spanCount = pivotIdx >= 0 ? pivotIdx : visibleCols.length
                            const valueCols = pivotIdx >= 0 ? visibleCols.slice(pivotIdx) : []
                            // Perf return: show on whichever of period/ytd/inception appears first
                            const showReturnOn = valueCols.find(id => id === 'period' || id === 'ytd' || id === 'inception')
                            return (
                              <>
                                {/* Label — spans all pre-value columns */}
                                <div
                                  className="flex items-center gap-2 min-w-0"
                                  style={{ gridColumn: `1 / ${spanCount + 1}` }}
                                >
                                  <div className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(180deg, #00d4ff, #0066aa)' }}/>
                                  <span className="text-[11px] font-bold uppercase tracking-widest truncate" style={{ color: '#00d4ff', letterSpacing: '0.08em' }}>{key}</span>
                                </div>

                                {/* One cell per value column */}
                                {valueCols.map(colId => {
                                  if (colId === 'allocation') return (
                                    <span key={colId} className="v2-num text-right tabular-nums text-[11px] font-semibold" style={{ color: '#6688aa' }}>
                                      {totalAllocPct.toFixed(1)}%
                                    </span>
                                  )
                                  if (colId === 'position') return (
                                    <span key={colId} className="v2-num text-right tabular-nums text-[13px] font-bold" style={{ color: '#ffffff' }}>
                                      {fmt(toBase(totalBRL), true)}
                                    </span>
                                  )
                                  // Per-period group aggregates
                                  const grpPct: number | null =
                                    colId === 'period'     ? gainPct :
                                    colId === 'mtd'        ? grpMtd :
                                    colId === 'prevMonth'  ? grpPrevMonth :
                                    colId === 'ytd'        ? grpYtd :
                                    colId === 'm12'        ? grp12m :
                                    colId === 'm24'        ? grp24m :
                                    colId === 'inception'  ? grpInception :
                                    null
                                  if (grpPct !== undefined) return grpPct === null
                                    ? <span key={colId} className="v2-num text-right tabular-nums text-[11px]" style={{ color: '#2a2a3e' }}>—</span>
                                    : <span key={colId} className="v2-num text-right tabular-nums text-[11px] font-semibold" style={{ color: grpPct >= 0 ? '#00ff88' : '#ff4466' }}>
                                        {grpPct >= 0 ? '+' : ''}{grpPct.toFixed(1)}%
                                      </span>
                                  return <span key={colId}/>
                                })}

                                {/* Delete column spacer */}
                                <span/>
                              </>
                            )
                          })()}
                        </div>,

                        /* ── Item rows ── */
                        ...items.map((p, rowIdx) => {
                          const isPluggy = !!p.notes?.match(/pluggy:[^\s]+/)
                          const isEven = rowIdx % 2 === 0
                          return (
                            <div
                              key={p.id}
                              onClick={() => setEditing(p as Investment)}
                              className="grid items-center gap-1 px-4 cursor-pointer group transition-colors duration-75"
                              style={{
                                gridTemplateColumns: gridTemplate,
                                paddingTop: '9px',
                                paddingBottom: '9px',
                                background: isEven ? 'transparent' : 'rgba(255,255,255,0.012)',
                                borderBottom: '1px solid rgba(30,30,48,0.6)',
                              }}
                              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,212,255,0.04)' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isEven ? 'transparent' : 'rgba(255,255,255,0.012)' }}
                              title="Clique para editar"
                            >
                              {visibleCols.map(colId => {
                                switch (colId) {
                                  case 'ticker': return (
                                    <span key={colId} className="font-mono font-bold text-[11px] truncate tabular-nums" style={{ color: '#00d4ff' }}>
                                      {p.ticker || p.name.slice(0, 8)}
                                    </span>
                                  )
                                  case 'name': return (
                                    <span key={colId} className="text-[12px] font-medium truncate flex items-center gap-2" style={{ color: '#c8c8e0' }}>
                                      <span className="truncate">{p.name}</span>
                                      {isPluggy && (
                                        <span
                                          className="text-[8px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                                          style={{ background: 'rgba(236,72,153,.12)', color: '#ec4899', border: '1px solid rgba(236,72,153,.25)' }}
                                        >OF</span>
                                      )}
                                    </span>
                                  )
                                  case 'assetClass': return (
                                    <span key={colId} className="text-[11px] truncate" style={{ color: '#55556a' }}>{p.assetClass}</span>
                                  )
                                  case 'maturity': return (
                                    <span key={colId} className="text-[11px] tabular-nums text-left truncate" style={{ color: p.maturityDate ? '#8888aa' : '#33334a' }}>
                                      {p.maturityDate ? formatDate(p.maturityDate) : '—'}
                                    </span>
                                  )
                                  case 'qty': return (
                                    <span key={colId} className="v2-num text-right tabular-nums text-[11px]" style={{ color: '#66667a' }}>
                                      {p.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                                    </span>
                                  )
                                  case 'pm': return (
                                    <span key={colId} className="v2-num text-right tabular-nums text-[11px]" style={{ color: '#66667a' }}>
                                      {p.avgCost.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                                      <span style={{ color: '#33334a' }}> / </span>
                                      {p.currentPrice.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                                    </span>
                                  )
                                  case 'position': return (
                                    <span key={colId} className="v2-num text-right tabular-nums text-[12px] font-semibold" style={{ color: '#e8e8f0' }}>{fmt(toBase(p.currentBRL), true)}</span>
                                  )
                                  case 'allocation': return (
                                    <span key={colId} className="v2-num text-right tabular-nums text-[11px]" style={{ color: '#6688aa' }}>{p.allocPct.toFixed(1)}%</span>
                                  )
                                  case 'period': return (
                                    <span key={colId} className="v2-num text-right flex flex-col items-end gap-0.5">
                                      <span className="tabular-nums text-[12px] font-semibold" style={{ color: p.pct >= 0 ? '#00ff88' : '#ff4466' }}>
                                        {p.pct >= 0 ? '+' : ''}{p.pct.toFixed(1)}%
                                      </span>
                                      {p.linkedIncomeAll > 0 && (
                                        <span
                                          className="text-[9px] font-semibold px-1 py-0.5 rounded"
                                          style={{ background: 'rgba(0,212,255,.1)', color: '#00d4ff' }}
                                          title={`Rendimentos vinculados: ${fmt(toBase(p.linkedIncomeAll), true)}`}
                                        >+{fmt(toBase(p.linkedIncomeAll), true)} rend.</span>
                                      )}
                                    </span>
                                  )
                                  case 'mtd':       return <span key={colId} className="flex justify-end">{pctCell(p.pctMtd)}</span>
                                  case 'prevMonth': return <span key={colId} className="flex justify-end">{pctCell(p.pctPrevMonth)}</span>
                                  case 'ytd':       return <span key={colId} className="flex justify-end">{pctCell(p.pctYtd)}</span>
                                  case 'm12':       return <span key={colId} className="flex justify-end">{pctCell(p.pct12m)}</span>
                                  case 'm24':       return <span key={colId} className="flex justify-end">{pctCell(p.pct24m)}</span>
                                  case 'inception': return <span key={colId} className="flex justify-end">{pctCell(p.pctInception)}</span>
                                  default: return <span key={colId}/>
                                }
                              })}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const msg = isPluggy
                                    ? `Excluir "${p.name}"?\n\nEste ativo foi importado do Open Finance. A exclusão é permanente: ele NÃO volta automaticamente em syncs futuros, mesmo que ainda apareça na sua corretora.`
                                    : `Excluir "${p.name}"?`
                                  if (confirm(msg)) {
                                    deleteInvestment(p.id).catch(err => {
                                      console.error('[WealthV2] delete failed', err)
                                      alert('Falha ao excluir. Tente novamente.')
                                    })
                                  }
                                }}
                                className="w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity mx-auto text-sm"
                                style={{ color: '#55556a' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ff4466'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,68,102,0.1)' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#55556a'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                                title={isPluggy ? 'Excluir (permanente — não retorna em sync)' : 'Excluir'}
                              >×</button>
                            </div>
                          )
                        }),
                      ])}
                    </div>
                  )
                })()}
              </div>
            </div>
          </details>
        </section>

      </div>


      <InvestmentModal open={showAddInv} onClose={() => setShowAddInv(false)} />
      <InvestmentModal
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={editing ?? undefined}
        linkedTransactions={editing ? (linkedTxByInvestment.get(editing.id) ?? []) : []}
      />
    </div>
  )
}

// ── Expandable category row used in every breakdown modal ───────────
// Renders a summary line (color · label · value · %), and when expanded
// shows the individual investments composing that bucket. Each child
// investment is itself clickable — opens the edit modal via setEditing.
function CategoryRow({
  label, color, value, pct, items, fmt, setEditing, footnote,
}: {
  label: string
  color: string
  value: number
  pct: number
  items: { inv: Investment; valueBRL: number }[]
  fmt: (vBRL: number) => string
  setEditing: (i: Investment) => void
  footnote?: string
}) {
  const hasItems = items.length > 0
  return (
    <details className="v2-card group">
      <summary
        className={`list-none flex items-center gap-3 px-3 py-2.5 ${hasItems ? 'cursor-pointer hover:bg-[#161729]' : 'cursor-default'} rounded-xl transition-colors`}
      >
        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }}/>
        <span className="flex-1 min-w-0 truncate text-sm font-medium">{label}</span>
        <span className="v2-num text-xs font-semibold whitespace-nowrap">{value > 0 ? fmt(value) : '—'}</span>
        <span className="v2-num text-xs font-bold w-14 text-right" style={{ color: value > 0 ? color : '#55556a' }}>{pct.toFixed(1)}%</span>
        {hasItems && (
          <span className="text-[10px] text-[#55556a] w-10 text-right group-open:rotate-90 transition-transform">▶ {items.length}</span>
        )}
      </summary>
      {hasItems && (
        <div className="border-t border-[#1e1e30] divide-y divide-[#1e1e30] bg-[#0a0a0f]">
          {items.map(({ inv, valueBRL }) => (
            <button
              key={inv.id}
              onClick={(e) => { e.preventDefault(); setEditing(inv); }}
              className="w-full text-left grid grid-cols-[100px_1fr_120px] items-center gap-2 px-3 py-2 text-xs hover:bg-[#161729] transition-colors"
              title="Clique para editar"
            >
              <span className="font-mono font-semibold truncate" style={{ color: '#00d4ff' }}>{inv.ticker || inv.name.slice(0, 12)}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{inv.name}</span>
                <span className="block text-[10px] text-[#55556a] truncate">{inv.assetClass} · {inv.institution}</span>
              </span>
              <span className="v2-num text-right font-semibold">{fmt(valueBRL)}</span>
            </button>
          ))}
        </div>
      )}
      {footnote && (
        <p className="px-3 py-2 text-[10px] text-[#55556a] border-t border-[#1e1e30] bg-[#0a0a0f]">{footnote}</p>
      )}
    </details>
  )
}
