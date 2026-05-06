// ─────────────────────────────────────────────
//  Luxor Pro — Core Type Definitions
// ─────────────────────────────────────────────

export type TransactionType = 'income' | 'expense'

export interface Transaction {
  id: string
  date: string          // ISO "YYYY-MM-DD"
  description: string
  category: string
  amount: number        // always positive; in original currency
  currency?: 'BRL' | 'USD' | 'EUR'  // defaults to BRL when absent
  type: TransactionType
  account: string
  notes?: string
  paymentMethod?: string
  attachmentIds?: string[]
  tags?: string[]
  // Accounting regime
  expenseRegime?: 'caixa' | 'competencia'
  paymentDate?: string         // for competência: when cash actually moves
  // Installment tracking
  installmentNumber?: number   // e.g. 3 (this is the 3rd installment)
  installmentCount?: number    // e.g. 12 (total installments)
  installmentGroupId?: string  // links all installments of one purchase
  // When this record was created (ISO timestamp)
  createdAt?: string
  // Planned/desired expense (not yet made)
  isWanted?: boolean
  // Budget classification for 50/30/20 rule
  expenseNature?: 'fixed' | 'variable' | 'investment'
  // Couples sharing
  visibility?: 'private' | 'shared'
  sharedWithPartnershipId?: string
}

// ─── Couples sharing partnership ──────────────
export interface Partnership {
  id: string
  user1Id: string
  user2Id: string | null
  inviteCode: string
  status: 'pending' | 'active' | 'ended'
  createdAt: string
  updatedAt: string
}

// Known predefined classes — any other string is also valid (custom classes)
export type AssetClass =
  | 'CDB' | 'LCI' | 'LCA' | 'Tesouro Direto' | 'Ações B3' | 'FII'
  | 'US Stocks' | 'ETF' | 'USD Cash' | 'Crypto' | 'Real Estate' | 'Previdência'
  | 'Other'
  | (string & {}) // allows arbitrary custom class names

export type AssetLocation = 'onshore' | 'offshore' | 'physical-re'

export interface PricePoint {
  /** ISO YYYY-MM-DD */
  date: string
  /** price per unit in the asset's native currency */
  price: number
}

export type TaxTreatment = 'taxable' | 'tax-deferred' | 'tax-exempt'

export interface Investment {
  id: string
  name: string
  ticker?: string
  assetClass: AssetClass
  location: AssetLocation
  quantity: number
  avgCost: number            // per unit, in original currency
  currentPrice: number       // per unit, in original currency
  currency: 'BRL' | 'USD' | 'EUR'
  institution: string
  purchaseDate: string
  maturityDate?: string      // for fixed income / real estate
  interestRate?: number      // % per year for fixed income
  taxTreatment?: TaxTreatment // taxable | tax-deferred | tax-exempt — optional for Pluggy imports awaiting user review
  dividendsReceived?: number // cumulative dividends/FII yields received
  interestReceived?: number  // cumulative bond coupon / interest income
  benchmark?: string         // e.g. CDI, IPCA, IBOV, SP500…
  notes?: string
  liquidity?: string          // e.g. 'D+0', 'D+1', 'D+30', 'D+360'
  managementFee?: number      // % annual, e.g. 0.5
  performanceFee?: number     // % over benchmark, e.g. 20
  riskLevel?: 1 | 2 | 3 | 4 | 5
  sector?: string             // e.g. 'Financeiro', 'Tecnologia', 'Energia'
  country?: string            // e.g. 'Brasil', 'EUA', 'Europa'
  issuer?: string             // e.g. 'Itaú', 'Tesouro Nacional', 'Apple Inc'
  incomeReturn?: number       // cumulative income gains (dividends/coupons) in BRL
  capitalReturn?: number      // cumulative capital gains in BRL
  grossUpRate?: number        // default 0.15 for tax-exempt
  /** Optional manual price history (for performance charts / TWR) */
  priceHistory?: PricePoint[]
  // Product type (new structured form)
  productType?: 'titulo' | 'fundo' | 'acao' | 'coe'
  tituloType?: string        // CDB, LCI, LCA, etc.
  fundType?: string          // FI, FIA, FIM, FII, etc.
  paymentFrequency?: string  // Mensal, Trimestral, etc.
  custodyFee?: number        // taxa de custódia % a.a. (Título)
  holding?: string           // holding company
  gestora?: string           // fund manager
}

export const LIQUIDITY_OPTIONS = ['D+0', 'D+1', 'D+2', 'D+3', 'D+5', 'D+7', 'D+10', 'D+15', 'D+30', 'D+60', 'D+90', 'D+180', 'D+360', 'Vencimento']
export const BENCHMARK_OPTIONS = [
  'CDI', 'IDKA3', 'IRFM', 'IPCA', 'IGP-M',
  'IMA-B', 'IMA-B5', 'IMA-B5+',
  'IBOVESPA', 'SP500 BRL', 'IFIX',
  'USD', 'EUR',
]
export const RISK_LABELS: Record<number, string> = { 1: 'Muito Baixo', 2: 'Baixo', 3: 'Moderado', 4: 'Alto', 5: 'Muito Alto' }

export interface TaxDeductible {
  id: string
  year: number
  category: 'Saúde' | 'Educação' | 'Previdência' | 'Dependentes' | 'Doações' | 'Outros'
  description: string
  amount: number
  date: string
  receiptAttachmentId?: string
}

export interface Attachment {
  id: string
  transactionId?: string
  filename: string
  mimeType: string
  size: number          // bytes
  dataUrl: string       // base64 data url stored in IndexedDB
  extractedText?: string
  createdAt: string
}

export interface RecurringTransaction {
  id: string
  name: string
  type: 'income' | 'expense'   // salary, rent-in = income; health plan, taxes = expense
  amount: number
  currency: 'BRL' | 'USD' | 'EUR'
  billingDay: number            // day of month (1–31)
  category: string
  account: string
  isActive: boolean
  startDate: string
  frequency?: 'monthly' | 'weekly'  // defaults to monthly
  weeklyInterval?: number            // for weekly: every N weeks (default 1)
  notes?: string
}

/** @deprecated use RecurringTransaction */
export type Subscription = RecurringTransaction

export interface AppSettings {
  usdToBrl: number      // manual exchange rate USD → BRL
  eurToBrl: number      // manual exchange rate EUR → BRL
  preferredCurrency: 'BRL' | 'USD'
  monthlyIncomeGoal: number
  savingsRateGoal: number  // %
  name: string
  customCategories: Category[]  // user-defined categories
  customInstitutions: string[]  // user-added institution names
  customPaymentMethods?: string[]  // user-added payment methods
  suitability: 'Conservador' | 'Moderado' | 'Arrojado' | 'Agressivo'
  defaultInstitutionBRL: string
  defaultInstitutionUSD: string
  defaultInstitutionEUR: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  usdToBrl: 5.00,
  eurToBrl: 5.90,
  preferredCurrency: 'BRL',
  monthlyIncomeGoal: 30000,
  savingsRateGoal: 30,
  name: 'Luxor Pro',
  customCategories: [],
  customInstitutions: [],
  customPaymentMethods: [],
  suitability: 'Moderado',
  defaultInstitutionBRL: 'Itaú',
  defaultInstitutionUSD: 'Wise',
  defaultInstitutionEUR: 'Wise',
}

// ─── Suggested categories the user can add ──
export const SUGGESTED_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Pet',             icon: '', color: '#f59e0b', type: 'expense' },
  { name: 'Vestuário',       icon: '👗', color: '#8b5cf6', type: 'expense' },
  { name: 'Beleza',          icon: '💄', color: '#ff4466', type: 'expense' },
  { name: 'Presente',        icon: '', color: '#00d4ff', type: 'expense' },
  { name: 'Eletrônicos',     icon: '📱', color: '#3b82f6', type: 'expense' },
  { name: 'Manutenção',      icon: '🔧', color: '#f59e0b', type: 'expense' },
  { name: 'Seguro',          icon: '🛡', color: '#3b82f6', type: 'expense' },
  { name: 'Farmácia',        icon: '💊', color: '#ff4466', type: 'expense' },
  { name: 'Viagem Negócios', icon: '✈', color: '#00d4ff', type: 'expense' },
  { name: 'Consultoria',     icon: '💼', color: '#00d4ff', type: 'income'  },
  { name: 'Venda',           icon: '', color: '#00ff88', type: 'income'  },
  { name: 'Bônus',           icon: '', color: '#00ff88', type: 'income'  },
]

// ─── Category definitions ────────────────────
export interface Category {
  id: string
  name: string
  icon: string
  color: string
  type: 'income' | 'expense' | 'both'
}

export const CATEGORIES: Category[] = [
  // Income
  { id: 'salary',      name: 'Salário',        icon: '💼', color: '#00ff88', type: 'income' },
  { id: 'freelance',   name: 'Freelance',       icon: '🖥', color: '#00d4ff', type: 'income' },
  { id: 'dividends',   name: 'Dividendos',      icon: '📈', color: '#8b5cf6', type: 'income' },
  { id: 'rent_income', name: 'Aluguel Recebido', icon: '🏘️', color: '#f59e0b', type: 'income' },
  { id: 'transfer_in', name: 'Transferência',   icon: '🔄', color: '#00d4ff', type: 'income' },
  { id: 'pix_in',      name: 'PIX Recebido',    icon: '⚡', color: '#00ff88', type: 'income' },
  { id: 'other_income',name: 'Outras Receitas',  icon: '💰', color: '#00ff88', type: 'income' },
  // Expenses
  { id: 'alimentacao', name: 'Alimentação',     icon: '🍔', color: '#f59e0b', type: 'expense' },
  { id: 'saude',       name: 'Saúde',           icon: '🏥', color: '#ff4466', type: 'expense' },
  { id: 'educacao',    name: 'Educação',         icon: '📚', color: '#8b5cf6', type: 'expense' },
  { id: 'transporte',  name: 'Transporte',       icon: '🚗', color: '#f59e0b', type: 'expense' },
  { id: 'moradia',     name: 'Moradia',          icon: '🏠', color: '#3b82f6', type: 'expense' },
  { id: 'lazer',       name: 'Lazer',            icon: '🎮', color: '#8b5cf6', type: 'expense' },
  { id: 'viagem',      name: 'Viagem',           icon: '✈️', color: '#00d4ff', type: 'expense' },
  { id: 'streaming',   name: 'Streaming',        icon: '📺', color: '#ff4466', type: 'expense' },
  { id: 'software',    name: 'Software/SaaS',    icon: '💻', color: '#8b5cf6', type: 'expense' },
  { id: 'boleto',      name: 'Boleto',           icon: '📄', color: '#55556a', type: 'expense' },
  { id: 'pix_out',     name: 'PIX Enviado',      icon: '⚡', color: '#ff4466', type: 'expense' },
  { id: 'investimento',name: 'Investimento',     icon: '📊', color: '#00d4ff', type: 'expense' },
  { id: 'imposto',     name: 'Impostos',         icon: '🧾', color: '#ff4466', type: 'expense' },
  { id: 'outros',      name: 'Outros',           icon: '📦', color: '#55556a', type: 'expense' },
]

export const ACCOUNTS: string[] = []

export const PAYMENT_METHODS = [
  'PIX', 'Boleto', 'Cartão de Crédito', 'Cartão de Débito',
  'Transferência', 'Débito Automático', 'Outro',
]

// ─── Financial Goals ──────────────────────────
export type GoalCategory =
  | 'imóvel' | 'veículo' | 'aposentadoria' | 'viagem'
  | 'educação' | 'reserva' | 'negócio' | 'outro'

export type GoalImpact = 'expense' | 'income' | 'savings'
// expense  = one-time reduction in net worth at target date (e.g., buy a house)
// income   = one-time addition (e.g., inheritance, property sale)
// savings  = ongoing monthly saving toward this goal

export interface FinancialGoal {
  id: string
  name: string
  emoji: string
  description?: string
  targetAmount: number       // total target (R$)
  currentAmount: number      // amount saved so far
  targetDate: string         // ISO "YYYY-MM-DD"
  category: GoalCategory
  impactType: GoalImpact
  monthlyContribution: number // R$ per month allocated to this goal
  color: string
  isCompleted: boolean
  createdAt: string
  recurringEveryYears?: number   // 0 = not recurring; N = repeats every N years
  recurringRepetitions?: number  // total occurrences (0 = unlimited)
}

export const GOAL_CATEGORIES: { value: GoalCategory; label: string; emoji: string; color: string }[] = [
  { value: 'imóvel',       label: 'Imóvel',         emoji: '🏠', color: '#3b82f6' },
  { value: 'veículo',      label: 'Veículo',         emoji: '🚗', color: '#f59e0b' },
  { value: 'aposentadoria',label: 'Aposentadoria',   emoji: '🏖️', color: '#00ff88' },
  { value: 'viagem',       label: 'Viagem',          emoji: '✈️', color: '#00d4ff' },
  { value: 'educação',     label: 'Educação',        emoji: '📚', color: '#8b5cf6' },
  { value: 'reserva',      label: 'Reserva de Emerg.', emoji: '🛡️', color: '#00ff88' },
  { value: 'negócio',      label: 'Abrir Negócio',   emoji: '🚀', color: '#f59e0b' },
  { value: 'outro',        label: 'Outro',           emoji: '🎯', color: '#55556a' },
]
