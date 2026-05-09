// ─────────────────────────────────────────────
//  Demo data generator — 6 months of synthetic
//  transactions + 12 diverse investments. Every
//  fixture ID is prefixed with `demo_` so the
//  reverse operation (clear-demo) can target them
//  precisely without touching real user data.
// ─────────────────────────────────────────────
import type { Transaction, Investment } from './types'

export const DEMO_PREFIX = 'demo_'
export const DEMO_TAG = 'demo'

/**
 * Cheap deterministic PRNG so demo data is stable across reseeds.
 * (Same seed → same numbers; we never want to pollute the user's view
 * with constantly-changing demo amounts.)
 */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

interface DemoTxSpec {
  type: 'income' | 'expense'
  description: string
  category: string
  account: string
  /** Day of month (1-28) or 'rand' for a random business day */
  day: number | 'rand'
  /** Base amount (BRL) — random jitter applied per month */
  amount: number
  /** Jitter percentage 0..1 (default 0.05) */
  jitter?: number
  /** Number of independent occurrences per month (e.g. groceries 4×/mo) */
  count?: number
  /** Optional payment method for richer detail */
  paymentMethod?: string
}

const RECIPES: DemoTxSpec[] = [
  // Recurring income
  { type: 'income',  description: 'Salário · Empresa Demo',     category: 'salary',       account: 'Itaú',     day: 5,        amount: 15000, jitter: 0,    paymentMethod: 'Transferência' },
  // Occasional income
  { type: 'income',  description: 'Freelance · Consultoria',    category: 'freelance',    account: 'Nubank',   day: 'rand',   amount: 2500,  jitter: 0.4,  count: 1, paymentMethod: 'PIX' },
  { type: 'income',  description: 'Dividendos · ITUB4',         category: 'dividends',    account: 'XP',       day: 22,       amount: 290,   jitter: 0.15, paymentMethod: 'Transferência' },
  // Fixed expenses
  { type: 'expense', description: 'Aluguel · Apto Centro',      category: 'moradia',      account: 'Itaú',     day: 5,        amount: 2800,  jitter: 0,    paymentMethod: 'Boleto' },
  { type: 'expense', description: 'Condomínio',                  category: 'moradia',      account: 'Itaú',     day: 10,       amount: 650,   jitter: 0.04, paymentMethod: 'Boleto' },
  { type: 'expense', description: 'Energia · Light',             category: 'moradia',      account: 'Itaú',     day: 8,        amount: 280,   jitter: 0.25, paymentMethod: 'Débito Automático' },
  { type: 'expense', description: 'Internet · Vivo Fibra',       category: 'moradia',      account: 'Nubank',   day: 15,       amount: 120,   jitter: 0,    paymentMethod: 'Cartão de Crédito' },
  { type: 'expense', description: 'Plano de Saúde · Bradesco',  category: 'saude',         account: 'Bradesco', day: 12,       amount: 680,   jitter: 0.02, paymentMethod: 'Débito Automático' },
  { type: 'expense', description: 'Netflix',                     category: 'streaming',    account: 'Nubank',   day: 18,       amount: 55,    jitter: 0,    paymentMethod: 'Cartão de Crédito' },
  { type: 'expense', description: 'Spotify',                     category: 'streaming',    account: 'Nubank',   day: 20,       amount: 22,    jitter: 0,    paymentMethod: 'Cartão de Crédito' },
  // Variable expenses
  { type: 'expense', description: 'Mercado · Carrefour',         category: 'alimentacao',  account: 'Itaú',     day: 'rand',   amount: 420,  jitter: 0.30, count: 4, paymentMethod: 'Cartão de Crédito' },
  { type: 'expense', description: 'Restaurante',                 category: 'alimentacao',  account: 'Nubank',   day: 'rand',   amount: 130,  jitter: 0.45, count: 8, paymentMethod: 'Cartão de Crédito' },
  { type: 'expense', description: 'Uber',                        category: 'transporte',   account: 'Nubank',   day: 'rand',   amount: 32,   jitter: 0.55, count: 12, paymentMethod: 'Cartão de Crédito' },
  { type: 'expense', description: 'Posto Shell',                 category: 'transporte',   account: 'Nubank',   day: 'rand',   amount: 240,  jitter: 0.20, count: 2,  paymentMethod: 'Cartão de Crédito' },
  { type: 'expense', description: 'Farmácia',                    category: 'saude',        account: 'Nubank',   day: 'rand',   amount: 95,   jitter: 0.40, count: 2,  paymentMethod: 'Cartão de Crédito' },
  { type: 'expense', description: 'Cinema',                      category: 'lazer',        account: 'Nubank',   day: 'rand',   amount: 65,   jitter: 0.30, count: 1,  paymentMethod: 'Cartão de Crédito' },
  { type: 'expense', description: 'Fatura Cartão Itaú',          category: 'outros',       account: 'Itaú',     day: 10,       amount: 1200,  jitter: 0.20, paymentMethod: 'Débito Automático' },
  // Aporte (investimento)
  { type: 'expense', description: 'Aporte XP · ETF BOVA11',      category: 'investimento', account: 'XP',       day: 7,        amount: 3000,  jitter: 0,    paymentMethod: 'Transferência' },
]

/** Generate ~80-130 transactions across the last 6 months. */
export function generateDemoTransactions(now: Date = new Date()): Transaction[] {
  const txs: Transaction[] = []
  const baseSeed = 73113  // stable
  let counter = 0

  // 6 months back, including current
  for (let mAgo = 5; mAgo >= 0; mAgo--) {
    const d = new Date(now.getFullYear(), now.getMonth() - mAgo, 1)
    const year  = d.getFullYear()
    const month = d.getMonth() + 1
    const dim   = daysInMonth(year, month)
    const rng = mulberry32(baseSeed + year * 100 + month)

    for (const r of RECIPES) {
      const occurrences = r.count ?? 1
      for (let occ = 0; occ < occurrences; occ++) {
        // Skip the current month past today's date so we don't show fake
        // future-dated lançamentos.
        let day = r.day === 'rand'
          ? Math.max(1, Math.min(dim, 1 + Math.floor(rng() * (dim - 1))))
          : Math.min(r.day, dim)
        // For "rand" entries we add a sub-month offset per occurrence
        if (r.day === 'rand') {
          day = ((day + occ * 6) % dim) || 1
        }
        if (mAgo === 0 && day > now.getDate()) continue

        const jitter = r.jitter ?? 0.05
        const factor = 1 + (rng() * 2 - 1) * jitter
        const amount = Math.round(r.amount * factor * 100) / 100
        if (amount <= 0) continue

        const tx: Transaction = {
          id: `${DEMO_PREFIX}tx_${pad2(year)}${pad2(month)}_${pad2(counter++)}`,
          date: isoDate(year, month, day),
          description: r.description,
          category: r.category,
          amount,
          currency: 'BRL',
          type: r.type,
          account: r.account,
          paymentMethod: r.paymentMethod,
          tags: [DEMO_TAG],
          createdAt: new Date(year, month - 1, day, 12).toISOString(),
        }
        txs.push(tx)
      }
    }
  }
  return txs
}

interface DemoInvSpec {
  ticker?: string
  name: string
  assetClass: Investment['assetClass']
  location: Investment['location']
  quantity: number
  avgCost: number
  currentPrice: number
  currency: 'BRL' | 'USD' | 'EUR'
  institution: string
  purchaseYearsAgo: number
  taxTreatment?: Investment['taxTreatment']
  riskLevel?: 1 | 2 | 3 | 4 | 5
  liquidity?: string
  productType?: 'titulo' | 'fundo' | 'acao' | 'coe'
  tituloType?: string
  fundType?: string
  benchmark?: string
  interestRate?: number
  maturityYearsAhead?: number
  dividendsReceived?: number
  sector?: string
  notes?: string
}

const INV_RECIPES: DemoInvSpec[] = [
  // Ações BR
  { ticker: 'PETR4',  name: 'Petrobras PN',          assetClass: 'RV Ibovespa',           location: 'onshore',  quantity: 800,  avgCost: 28.40,  currentPrice: 46.25,  currency: 'BRL', institution: 'XP Investimentos', purchaseYearsAgo: 2, productType: 'acao', taxTreatment: 'taxable', riskLevel: 4, liquidity: 'D+2', benchmark: 'IBOVESPA', sector: 'Energia', dividendsReceived: 4800 },
  { ticker: 'ITUB4',  name: 'Itaú Unibanco PN',      assetClass: 'RV Ibovespa',           location: 'onshore',  quantity: 1480, avgCost: 22.10,  currentPrice: 31.80,  currency: 'BRL', institution: 'XP Investimentos', purchaseYearsAgo: 3, productType: 'acao', taxTreatment: 'taxable', riskLevel: 3, liquidity: 'D+2', benchmark: 'IBOVESPA', sector: 'Financeiro', dividendsReceived: 2900 },
  { ticker: 'VALE3',  name: 'Vale ON',                assetClass: 'RV Ibovespa',           location: 'onshore',  quantity: 200,  avgCost: 65.00,  currentPrice: 58.40,  currency: 'BRL', institution: 'XP Investimentos', purchaseYearsAgo: 1, productType: 'acao', taxTreatment: 'taxable', riskLevel: 4, liquidity: 'D+2', benchmark: 'IBOVESPA', sector: 'Mineração', dividendsReceived: 1100 },
  { ticker: 'BBDC4',  name: 'Bradesco PN',            assetClass: 'RV Ibovespa',           location: 'onshore',  quantity: 600,  avgCost: 14.20,  currentPrice: 12.80,  currency: 'BRL', institution: 'XP Investimentos', purchaseYearsAgo: 2, productType: 'acao', taxTreatment: 'taxable', riskLevel: 3, liquidity: 'D+2', benchmark: 'IBOVESPA', sector: 'Financeiro', dividendsReceived: 380 },
  { ticker: 'BOVA11', name: 'iShares Ibovespa ETF',   assetClass: 'RV Ibovespa',           location: 'onshore',  quantity: 180,  avgCost: 102.0, currentPrice: 99.0,   currency: 'BRL', institution: 'XP Investimentos', purchaseYearsAgo: 1, productType: 'fundo', fundType: 'FIA', taxTreatment: 'taxable', riskLevel: 3, liquidity: 'D+2', benchmark: 'IBOVESPA' },
  // FIIs
  { ticker: 'HGLG11', name: 'CSHG Logística FII',     assetClass: 'Alt. FII (Tijolo)',     location: 'onshore',  quantity: 320,  avgCost: 168.40, currentPrice: 161.30, currency: 'BRL', institution: 'XP Investimentos', purchaseYearsAgo: 2, productType: 'fundo', fundType: 'FII', taxTreatment: 'tax-exempt', riskLevel: 3, liquidity: 'D+2', benchmark: 'IFIX', dividendsReceived: 4200 },
  { ticker: 'XPLG11', name: 'XP Log FII',             assetClass: 'Alt. FII (Tijolo)',     location: 'onshore',  quantity: 410,  avgCost: 99.0,   currentPrice: 95.20,  currency: 'BRL', institution: 'XP Investimentos', purchaseYearsAgo: 1, productType: 'fundo', fundType: 'FII', taxTreatment: 'tax-exempt', riskLevel: 3, liquidity: 'D+2', benchmark: 'IFIX', dividendsReceived: 3500 },
  // Renda fixa
  { name: 'CDB BTG 110% CDI',                          assetClass: 'Pós-Fixado',            location: 'onshore',  quantity: 1,    avgCost: 100000, currentPrice: 108420, currency: 'BRL', institution: 'BTG Pactual',     purchaseYearsAgo: 2, productType: 'titulo', tituloType: 'CDB', taxTreatment: 'taxable',   riskLevel: 2, liquidity: 'D+1',   benchmark: 'CDI', interestRate: 13.2, maturityYearsAhead: 1 },
  { name: 'Tesouro IPCA+ 2029',                       assetClass: 'IPCA Juro Real (Curto)', location: 'onshore', quantity: 50,   avgCost: 3200,   currentPrice: 3450,   currency: 'BRL', institution: 'Itaú',             purchaseYearsAgo: 1, productType: 'titulo', tituloType: 'NTN-B Principal', taxTreatment: 'taxable', riskLevel: 2, liquidity: 'D+1', benchmark: 'IPCA', interestRate: 6.0, maturityYearsAhead: 5 },
  { name: 'LCI Itaú 96% CDI',                          assetClass: 'Pós-Fixado',            location: 'onshore',  quantity: 1,    avgCost: 50000,  currentPrice: 53200,  currency: 'BRL', institution: 'Itaú',             purchaseYearsAgo: 1, productType: 'titulo', tituloType: 'LCI', taxTreatment: 'tax-exempt', riskLevel: 2, liquidity: 'Vencimento', benchmark: 'CDI', interestRate: 11.5, maturityYearsAhead: 2 },
  // Offshore
  { ticker: 'VOO',    name: 'Vanguard S&P 500 ETF',    assetClass: 'RV US',                  location: 'offshore', quantity: 42,   avgCost: 412.00, currentPrice: 504.00, currency: 'USD', institution: 'Avenue',          purchaseYearsAgo: 2, productType: 'acao', taxTreatment: 'taxable', riskLevel: 3, liquidity: 'D+3', benchmark: 'SP500 BRL' },
  { ticker: 'BTC',    name: 'Bitcoin',                  assetClass: 'Crypto',                 location: 'offshore', quantity: 0.18, avgCost: 41000,  currentPrice: 65000,  currency: 'USD', institution: 'Binance',         purchaseYearsAgo: 1, taxTreatment: 'taxable', riskLevel: 5, liquidity: 'D+0' },
]

export function generateDemoInvestments(now: Date = new Date()): Investment[] {
  return INV_RECIPES.map((r, idx) => {
    const purchaseDate = new Date(now)
    purchaseDate.setFullYear(purchaseDate.getFullYear() - r.purchaseYearsAgo)
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
    // Year-start price = midpoint between avgCost and currentPrice — gives
    // the period-aware metrics on the Wealth page realistic YTD movement.
    const ytdStartPrice = (r.avgCost + r.currentPrice) / 2

    const inv: Investment = {
      id: `${DEMO_PREFIX}inv_${pad2(idx + 1)}`,
      name: r.name,
      ticker: r.ticker,
      assetClass: r.assetClass,
      location: r.location,
      quantity: r.quantity,
      avgCost: r.avgCost,
      currentPrice: r.currentPrice,
      currency: r.currency,
      institution: r.institution,
      purchaseDate: purchaseDate.toISOString().split('T')[0],
      taxTreatment: r.taxTreatment,
      riskLevel: r.riskLevel,
      liquidity: r.liquidity,
      productType: r.productType,
      tituloType: r.tituloType,
      fundType: r.fundType,
      benchmark: r.benchmark,
      interestRate: r.interestRate,
      sector: r.sector,
      dividendsReceived: r.dividendsReceived,
      maturityDate: r.maturityYearsAhead
        ? (() => {
            const d = new Date(now)
            d.setFullYear(d.getFullYear() + r.maturityYearsAhead)
            return d.toISOString().split('T')[0]
          })()
        : undefined,
      notes: '__demo__',
      priceHistory: [
        { date: yearStart, price: ytdStartPrice },
      ],
    }
    return inv
  })
}

export function isDemoTransaction(t: Transaction): boolean {
  return t.id.startsWith(DEMO_PREFIX)
}
export function isDemoInvestment(i: Investment): boolean {
  return i.id.startsWith(DEMO_PREFIX)
}
