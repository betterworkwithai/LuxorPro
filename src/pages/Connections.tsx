import React, { useState, useCallback, useEffect } from 'react'
import { PluggyConnect } from 'react-pluggy-connect'
import {
  RefreshCw, Trash2, CheckCircle2, AlertCircle, Loader2,
  Building2, CreditCard, TrendingUp, ArrowLeftRight, Plus, ShieldCheck,
  Wallet, Landmark, Link2,
} from 'lucide-react'
import { clsx } from 'clsx'
import { nanoid } from 'nanoid'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { formatBRL, formatDate } from '../lib/formatters'
import { autoCategorize } from '../lib/invoice/autoCategorize'
import type { Transaction, Investment } from '../lib/types'

// ── Pluggy raw types (subset) ─────────────────────────────────────────────────
interface PluggyItem {
  id: string
  status: string
  connector: { name: string; primaryColor?: string }
  createdAt: string
}

interface PluggyAccount {
  id: string
  itemId: string
  type: 'BANK' | 'CREDIT'
  subtype: string
  name: string
  balance: number
  currencyCode: string
}

interface PluggyTransaction {
  id: string
  accountId: string
  date: string
  description: string
  amount: number
  type: 'DEBIT' | 'CREDIT'
  category?: string
  currencyCode: string
}

interface PluggyInvestment {
  id: string
  name: string
  type: string
  subtype?: string
  amount: number              // current market value
  balance?: number            // synonymous with amount on most connectors
  quantity?: number
  value?: number              // unit price (per Pluggy spec)
  annualRate?: number
  lastTwelveMonthsRate?: number
  lastMonthRate?: number
  rate?: number
  taxes?: number              // IR retained at source
  taxes2?: number             // IOF
  amountProfit?: number       // gain over cost basis (when broker reports it)
  amountWithdrawal?: number
  amountOriginal?: number     // original invested amount (cost basis)
  code?: string               // ticker / fund code
  dueDate?: string
  date?: string
  currencyCode?: string
}

// ── Local storage helpers ─────────────────────────────────────────────────────
const ITEMS_KEY  = 'luxor_pluggy_items'
const SYNCED_KEY = 'luxor_pluggy_synced_ids'

interface StoredItem {
  itemId:          string
  institutionName: string
  connectedAt:     string
  lastSyncAt?:     string
  accounts:        { id: string; name: string; type: string; balance: number }[]
  importedCount:   { transactions: number; investments: number }
}

function loadItems(): StoredItem[] {
  try { return JSON.parse(localStorage.getItem(ITEMS_KEY) ?? '[]') } catch { return [] }
}
function saveItems(items: StoredItem[]) {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items))
}
function loadSyncedIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SYNCED_KEY) ?? '[]')) } catch { return new Set() }
}
function addSyncedIds(ids: string[]) {
  const set = loadSyncedIds()
  ids.forEach(id => set.add(id))
  localStorage.setItem(SYNCED_KEY, JSON.stringify([...set]))
}

/**
 * Scans existing transactions + investments for `pluggy:<id>` markers and
 * returns the set of Pluggy IDs already imported. Used as a fallback when
 * localStorage SYNCED_KEY is cleared (different browser, manual cache clear,
 * fresh device login, etc.) so we never re-import the same Pluggy item twice.
 *
 * mapTransaction tags transactions with `tags: ['pluggy:<tx.id>']`.
 * mapInvestment writes the same marker into `notes`.
 */
function collectImportedPluggyIds(
  transactions: { tags?: string[] }[],
  investments:  { notes?: string }[],
): Set<string> {
  const ids = new Set<string>()
  for (const t of transactions) {
    for (const tag of t.tags ?? []) {
      if (tag.startsWith('pluggy:')) ids.add(tag.slice(7))
    }
  }
  for (const i of investments) {
    const m = i.notes?.match(/pluggy:([^\s]+)/)
    if (m) ids.add(m[1])
  }
  return ids
}

// ── Category mapping ──────────────────────────────────────────────────────────
const CAT_MAP: [string, string][] = [
  ['FOOD',               'alimentacao'],
  ['TRANSPORT',          'transporte'],
  ['HEALTH',             'saude'],
  ['EDUCATION',          'educacao'],
  ['HOUSING',            'moradia'],
  ['LEISURE',            'lazer'],
  ['TRAVEL',             'viagem'],
  ['UTILITY',            'boleto'],
  ['TAXES',              'imposto'],
  ['INVESTMENT',         'investimento'],
  ['SALARY',             'salary'],
  ['TRANSFER',           'pix_out'],
  ['FINANCIAL_SERVICES', 'outros'],
  ['SHOPPING',           'outros'],
]

function mapCategory(pluggyCat: string | undefined, type: 'income' | 'expense'): string {
  const upper = (pluggyCat ?? '').toUpperCase()
  for (const [key, val] of CAT_MAP) {
    if (upper.includes(key)) {
      if (key === 'TRANSFER') return type === 'income' ? 'pix_in' : 'pix_out'
      if (key === 'SALARY')   return type === 'income' ? 'salary'  : 'outros'
      return val
    }
  }
  return type === 'income' ? 'other_income' : 'outros'
}

// Strict allowlist — Pluggy imports must map to one of these canonical classes.
// New custom classes are NEVER created from Open Finance data.
const ALLOWED_ASSET_CLASSES = [
  'CDB', 'LCI', 'LCA', 'Tesouro Direto', 'Ações B3', 'FII',
  'US Stocks', 'ETF', 'USD Cash', 'Crypto', 'Real Estate', 'Previdência', 'Other',
] as const
type AllowedAssetClass = typeof ALLOWED_ASSET_CLASSES[number]

function mapAssetClass(
  type: string,
  subtype?: string,
  currencyCode?: string,
  name?: string,
): AllowedAssetClass {
  const t = (type ?? '').toUpperCase()
  const s = (subtype ?? '').toUpperCase()
  const n = (name ?? '').toUpperCase()
  const isUSD = (currencyCode ?? '').toUpperCase() === 'USD'

  // Previdência (private pension) — Pluggy types/subtypes vary by connector,
  // and the security name is often the most reliable signal.
  if (
    t === 'PENSION_FUND' ||
    t === 'PRIVATE_PENSION' ||
    s.includes('PREVIDENC') ||
    s.includes('PGBL') ||
    s.includes('VGBL') ||
    n.includes('PREVID') ||
    n.includes('PGBL') ||
    n.includes('VGBL')
  ) return 'Previdência'

  // Crypto / cash first (currency-agnostic)
  if (t === 'CRYPTO' || s.includes('CRYPTO'))            return 'Crypto'
  if (t === 'CASH'   || s.includes('CASH'))              return isUSD ? 'USD Cash' : 'Other'

  // Offshore-specific instruments (signaled by USD currency or OFFSHORE subtype)
  if (isUSD || s.includes('OFFSHORE')) {
    if (t === 'ETF')    return 'ETF'
    if (t === 'EQUITY') return 'US Stocks'
    return 'Other'
  }

  // Onshore (default — most Brazilian Pluggy connectors)
  if (t === 'ETF')                                       return 'ETF'
  if (t === 'EQUITY')                                    return 'Ações B3'
  if (t === 'TREASURE' || t === 'TREASURY' || s.includes('TESOURO')) return 'Tesouro Direto'
  if (t === 'FIXED_INCOME') {
    if (s.includes('CDB')) return 'CDB'
    if (s.includes('LCI')) return 'LCI'
    if (s.includes('LCA')) return 'LCA'
    return 'Other'  // debênture / COE / etc. — keep neutral instead of guessing CDB
  }
  if (t === 'MUTUAL_FUND') {
    // Real-estate funds = FII; everything else (multimarket, stocks fund, hedge) → Other
    if (s.includes('REAL_ESTATE') || s.includes('FII')) return 'FII'
    return 'Other'
  }

  return 'Other'
}

/** Hard guard — guarantees the class string is in the allowlist. */
function safeAssetClass(value: string): AllowedAssetClass {
  return (ALLOWED_ASSET_CLASSES as readonly string[]).includes(value)
    ? (value as AllowedAssetClass)
    : 'Other'
}

/** Onshore vs offshore inference from Pluggy hints. */
function mapAssetLocation(
  inv: PluggyInvestment,
  resolvedClass: AllowedAssetClass,
): 'onshore' | 'offshore' {
  const isUSD = (inv.currencyCode ?? '').toUpperCase() === 'USD'
  const s     = (inv.subtype ?? '').toUpperCase()
  if (isUSD || s.includes('OFFSHORE'))                   return 'offshore'
  if (resolvedClass === 'US Stocks' || resolvedClass === 'USD Cash' || resolvedClass === 'Crypto') return 'offshore'
  return 'onshore'
}

// ── Data mappers ──────────────────────────────────────────────────────────────
function mapTransaction(
  tx:              PluggyTransaction,
  account:         PluggyAccount,
  institutionName: string,
  historyMap?:     Map<string, string>,   // normalized description → most-used category id
): Omit<Transaction, 'id'> {
  const isExpense =
    tx.type === 'DEBIT' ||
    (account.type === 'CREDIT' && tx.amount > 0)
  const type: 'income' | 'expense' = isExpense ? 'expense' : 'income'

  return {
    date:        tx.date.slice(0, 10),
    description: tx.description,
    category:    smartCategory(tx, type, historyMap),
    amount:      Math.abs(tx.amount),
    type,
    account:     `${institutionName} — ${account.name}`,
    currency:    'BRL',
    tags:        [`pluggy:${tx.id}`],
    createdAt:   new Date().toISOString(),
  }
}

/**
 * Build a lookup of normalized transaction descriptions → most-frequently used
 * category id, scanned from the user's existing transactions. Used at import
 * time so future Pluggy imports inherit the user's classification choices.
 */
function buildHistoryCategoryMap(transactions: Transaction[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>()
  for (const t of transactions) {
    const key = (t.description ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
    if (!key) continue
    let inner = counts.get(key)
    if (!inner) { inner = new Map(); counts.set(key, inner) }
    inner.set(t.category, (inner.get(t.category) ?? 0) + 1)
  }
  const result = new Map<string, string>()
  for (const [desc, inner] of counts) {
    let best = ''
    let bestCount = 0
    for (const [cat, n] of inner) {
      if (n > bestCount) { best = cat; bestCount = n }
    }
    if (best) result.set(desc, best)
  }
  return result
}

/**
 * Pick a category for a Pluggy transaction. Order of precedence:
 *   1. User history — if the user has classified this exact description before,
 *      reuse the most-frequent category they chose.
 *   2. Local keyword rules — leverages the autoCategorize ruleset already
 *      maintained in src/lib/invoice/autoCategorize.ts (Uber → Transporte,
 *      IOF → Impostos, Netflix → Streaming, etc.).
 *   3. Pluggy's category hint — falls back to mapCategory.
 */
function smartCategory(
  tx:        PluggyTransaction,
  type:      'income' | 'expense',
  history?:  Map<string, string>,
): string {
  // 1. User history match (exact description, normalized)
  const key = (tx.description ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (key && history) {
    const seen = history.get(key)
    if (seen) return seen
  }
  // 2. Local keyword rules
  const auto = autoCategorize(tx.description ?? '')
  if (auto.type === type && auto.category !== 'outros' && auto.category !== 'other_income') {
    return auto.category
  }
  // 3. Pluggy hint fallback
  return mapCategory(tx.category, type)
}

function mapInvestment(
  inv:             PluggyInvestment,
  institutionName: string,
): Omit<Investment, 'id'> {
  const quantity     = inv.quantity ?? 1
  // Prefer Pluggy's per-unit value if present; otherwise derive from amount/qty.
  const currentPrice = inv.value
    ?? (quantity > 0 ? inv.amount / quantity : inv.amount)

  // Cost basis: use Pluggy's amountOriginal if reported, otherwise fall back
  // to current price (broker doesn't expose cost — better safe than wrong).
  const avgCost = inv.amountOriginal != null && quantity > 0
    ? inv.amountOriginal / quantity
    : currentPrice

  const resolvedClass = safeAssetClass(mapAssetClass(inv.type, inv.subtype, inv.currencyCode, inv.name))
  const location      = mapAssetLocation(inv, resolvedClass)
  const currency      = (inv.currencyCode ?? '').toUpperCase() === 'USD' ? 'USD' : 'BRL'

  // Capital return — broker-reported gain when available
  const capitalReturn = inv.amountProfit ?? undefined

  // Note: we deliberately DO NOT assume taxTreatment, riskLevel, or
  // suitability metadata from Pluggy. The user reviews and assigns these
  // explicitly via the Investments page (some assets are tax-exempt LCI/LCA,
  // others have IR retained at source, others are PGBL with deductible
  // contributions — Pluggy doesn't reliably distinguish). Marking as
  // "needs review" via tag so we can surface it in the UI.
  return {
    name:         inv.name,
    ticker:       inv.code ?? undefined,
    assetClass:   resolvedClass,
    location,
    quantity,
    avgCost,
    currentPrice,
    currency,
    institution:  institutionName,
    purchaseDate: inv.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    maturityDate: inv.dueDate?.slice(0, 10),
    interestRate: inv.annualRate ?? inv.rate,
    // taxTreatment intentionally undefined — user assigns it manually
    notes:        `pluggy:${inv.id} · pluggy_type=${inv.type ?? '?'}/${inv.subtype ?? '?'} · review`,
    capitalReturn,
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function AccountChip({ acc }: { acc: StoredItem['accounts'][0] }) {
  const Icon = acc.type === 'CREDIT' ? CreditCard : Wallet
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-[#16161f] rounded-lg text-xs text-[#8888aa]">
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span className="truncate max-w-[120px]">{acc.name}</span>
      <span className="text-[#55556a]">{formatBRL(acc.balance, true)}</span>
    </div>
  )
}

function ItemCard({
  item, onSync, onRemove, syncing,
}: {
  item:     StoredItem
  onSync:   (itemId: string) => void
  onRemove: (itemId: string) => void
  syncing:  boolean
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="w-10 h-10 rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/20 flex items-center justify-center flex-shrink-0">
          <Landmark className="w-5 h-5 text-[#00d4ff]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#e8e8f0] truncate">{item.institutionName}</p>
          <p className="text-xs text-[#55556a]">
            Conectado em {formatDate(item.connectedAt)}
            {item.lastSyncAt && <> · Sync {formatDate(item.lastSyncAt)}</>}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onSync(item.itemId)}
            disabled={syncing}
            className="w-8 h-8 rounded-lg hover:bg-[#00d4ff]/15 text-[#55556a] hover:text-[#00d4ff] flex items-center justify-center transition-colors disabled:opacity-40"
            title="Sincronizar agora"
          >
            {syncing
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onRemove(item.itemId)}
            className="w-8 h-8 rounded-lg hover:bg-[#ff4466]/15 text-[#55556a] hover:text-[#ff4466] flex items-center justify-center transition-colors"
            title="Desconectar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {item.accounts.length > 0 && (
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {item.accounts.map(acc => <AccountChip key={acc.id} acc={acc} />)}
        </div>
      )}

      <div className="px-5 py-3 border-t border-[#1e1e2e] flex items-center gap-4 text-xs text-[#55556a]">
        <span className="flex items-center gap-1">
          <ArrowLeftRight className="w-3 h-3" />
          {item.importedCount.transactions} lançamentos importados
        </span>
        {item.importedCount.investments > 0 && (
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            {item.importedCount.investments} investimentos importados
          </span>
        )}
      </div>
    </Card>
  )
}

// ── Status types ──────────────────────────────────────────────────────────────
type SyncStatus =
  | { type: 'idle' }
  | { type: 'loading-token' }
  | { type: 'widget-open' }
  | { type: 'syncing'; itemId: string }
  | { type: 'done'; count: { tx: number; inv: number } }
  | { type: 'error'; message: string }

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Connections() {
  const { addTransaction, addInvestment, updateInvestment } = useStore()

  const [items,        setItems]        = useState<StoredItem[]>(loadItems)
  const [status,       setStatus]       = useState<SyncStatus>({ type: 'idle' })
  const [connectToken, setConnectToken] = useState<string | null>(null)
  const [autoSyncMsg,  setAutoSyncMsg]  = useState<string | null>(null)

  useEffect(() => { saveItems(items) }, [items])

  // ── Supabase Realtime: auto-sync when Pluggy webhook fires ─────────────────
  useEffect(() => {
    const channel = supabase
      .channel('pluggy-events-listener')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pluggy_events' },
        (payload) => {
          const row = payload.new as {
            item_id:    string
            event_type: string
          }
          if (row.event_type === 'item/error') return

          // Only auto-sync if this itemId is in our local list
          const known = loadItems().find(i => i.itemId === row.item_id)
          if (!known) return

          setAutoSyncMsg(`Novos dados disponíveis de ${known.institutionName} — sincronizando…`)
          // syncExisting is defined below — capture via ref to avoid stale closure
          syncExistingRef.current?.(row.item_id)
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Stable ref so the Realtime callback can call syncExisting without re-subscribing
  const syncExistingRef = React.useRef<((itemId: string) => void) | null>(null)

  // ── Fetch a fresh connect token from our edge function ──────────────────────
  const fetchConnectToken = useCallback(async (itemId?: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('pluggy-connect-token', {
      body: itemId ? { itemId } : {},
    })
    if (error) throw new Error(error.message)
    return (data as { accessToken: string }).accessToken
  }, [])

  // ── Open the Pluggy Connect widget ──────────────────────────────────────────
  const openWidget = useCallback(async (itemId?: string) => {
    setStatus({ type: 'loading-token' })
    try {
      const token = await fetchConnectToken(itemId)
      setConnectToken(token)
      setStatus({ type: 'widget-open' })
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message })
      setTimeout(() => setStatus({ type: 'idle' }), 6000)
    }
  }, [fetchConnectToken])

  // ── Handle successful connection from the widget ────────────────────────────
  const handleSuccess = useCallback(async (itemData: { item: PluggyItem }) => {
    setConnectToken(null)
    const pluggyItem = itemData.item
    setStatus({ type: 'syncing', itemId: pluggyItem.id })

    try {
      const { data, error } = await supabase.functions.invoke('pluggy-sync', {
        body: { itemId: pluggyItem.id },
      })
      if (error) throw new Error(error.message)

      const { accounts, transactions, investments } = data as {
        accounts:     PluggyAccount[]
        transactions: PluggyTransaction[]
        investments:  PluggyInvestment[]
      }

      // ── SYNC CONTRACT ────────────────────────────────────────────────────
      //   Transactions  → INSERT-ONLY. Already-imported tx (matched by Pluggy
      //                   ID) are skipped; nothing is ever updated or deleted.
      //   Investments   → INSERT new positions; UPDATE existing ones with the
      //                   latest price + append a price-history point. This
      //                   is what makes Investimentos performance build up
      //                   over time. Manual investments are never touched.
      //   Subscriptions → MUST NEVER be touched. The Pluggy code path has no
      //                   reference to the subscriptions store; we snapshot
      //                   the count here as a tripwire — if it ever changes
      //                   during a sync, that's a regression we want logged.
      // Dedup uses two independent ID sources so cache wipes can't cause
      // accidental re-imports:
      //   1. localStorage SYNCED_KEY (fast path)
      //   2. live store scan for `pluggy:<id>` markers
      const lsSyncedIds = loadSyncedIds()
      const storeState  = useStore.getState()
      const subscriptionsBefore = storeState.subscriptions.length
      const seenPluggyIds = collectImportedPluggyIds(
        storeState.transactions,
        storeState.investments,
      )
      const isAlreadyImportedTx = (pluggyId: string) =>
        lsSyncedIds.has(pluggyId) || seenPluggyIds.has(pluggyId)

      // Build a quick-lookup map: pluggyId → existing Investment (for in-place updates)
      const existingInvByPluggyId = new Map<string, typeof storeState.investments[number]>()
      for (const inv of storeState.investments) {
        const m = inv.notes?.match(/pluggy:([^\s]+)/)
        if (m) existingInvByPluggyId.set(m[1], inv)
      }

      // Build the user-history category map ONCE (used by smartCategory below).
      // Maps normalized description → most-frequent category id, learned from
      // the user's previously-categorized transactions. This lets future imports
      // inherit the user's classification choices automatically.
      const historyCategoryMap = buildHistoryCategoryMap(storeState.transactions)

      const newIds:    string[] = []
      let   txCount   = 0
      let   invCount  = 0
      let   invUpdated = 0

      const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]))

      for (const tx of transactions) {
        if (isAlreadyImportedTx(tx.id)) continue
        const account = accountMap[tx.accountId]
        if (!account) continue
        await addTransaction(
          mapTransaction(tx, account, pluggyItem.connector.name, historyCategoryMap),
        )
        newIds.push(tx.id)
        txCount++
      }

      const todayIso = new Date().toISOString().slice(0, 10)
      for (const inv of investments) {
        const existing = existingInvByPluggyId.get(inv.id)
        if (existing) {
          // Already imported → update price + append price history point
          const mapped       = mapInvestment(inv, pluggyItem.connector.name)
          const newHistory   = [...(existing.priceHistory ?? [])]
          // Replace today's entry if we already added one earlier the same day
          const todayIdx = newHistory.findIndex(p => p.date === todayIso)
          const point   = { date: todayIso, price: mapped.currentPrice }
          if (todayIdx >= 0) newHistory[todayIdx] = point
          else newHistory.push(point)
          await updateInvestment({
            ...existing,
            // Latest market data from broker
            quantity:       mapped.quantity,
            currentPrice:   mapped.currentPrice,
            // Only overwrite avgCost when broker actually reports cost basis
            avgCost:        inv.amountOriginal != null ? mapped.avgCost : existing.avgCost,
            // Cumulative gain (when broker reports it)
            capitalReturn:  mapped.capitalReturn ?? existing.capitalReturn,
            interestRate:   mapped.interestRate ?? existing.interestRate,
            priceHistory:   newHistory,
          })
          invUpdated++
        } else if (!isAlreadyImportedTx(inv.id)) {
          // Brand-new position
          await addInvestment(mapInvestment(inv, pluggyItem.connector.name))
          newIds.push(inv.id)
          invCount++
        }
      }
      // Tripwire: subscriptions must not change during a Pluggy sync.
      const subscriptionsAfter = useStore.getState().subscriptions.length
      if (subscriptionsAfter !== subscriptionsBefore) {
        console.error(
          '[pluggy-sync] REGRESSION: subscriptions count changed during sync',
          { before: subscriptionsBefore, after: subscriptionsAfter },
        )
      }

      // Surface invUpdated in the success status so users see performance refreshes
      void invUpdated // tracked for telemetry; UI count below uses txCount + invCount

      addSyncedIds(newIds)

      setItems(prev => {
        const existing = prev.find(i => i.itemId === pluggyItem.id)
        const updated: StoredItem = {
          itemId:          pluggyItem.id,
          institutionName: pluggyItem.connector.name,
          connectedAt:     existing?.connectedAt ?? new Date().toISOString(),
          lastSyncAt:      new Date().toISOString(),
          accounts:        accounts.map(a => ({ id: a.id, name: a.name, type: a.type, balance: a.balance })),
          importedCount:   {
            transactions: (existing?.importedCount.transactions ?? 0) + txCount,
            investments:  (existing?.importedCount.investments  ?? 0) + invCount,
          },
        }
        return existing
          ? prev.map(i => i.itemId === pluggyItem.id ? updated : i)
          : [...prev, updated]
      })

      setAutoSyncMsg(null)
      setStatus({ type: 'done', count: { tx: txCount, inv: invCount } })
      setTimeout(() => setStatus({ type: 'idle' }), 5000)

    } catch (err) {
      setAutoSyncMsg(null)
      setStatus({ type: 'error', message: (err as Error).message })
      setTimeout(() => setStatus({ type: 'idle' }), 6000)
    }
  }, [addTransaction, addInvestment])

  const handleError = useCallback((error: { message: string }) => {
    setConnectToken(null)
    setStatus({ type: 'error', message: error.message })
    setTimeout(() => setStatus({ type: 'idle' }), 6000)
  }, [])

  const handleClose = useCallback(() => {
    setConnectToken(null)
    setStatus(s => s.type === 'widget-open' || s.type === 'loading-token'
      ? { type: 'idle' }
      : s)
  }, [])

  // ── Re-sync an already connected item ──────────────────────────────────────
  const syncExisting = useCallback(async (itemId: string) => {
    setStatus({ type: 'syncing', itemId })
    try {
      const { data, error } = await supabase.functions.invoke('pluggy-sync', {
        body: { itemId },
      })
      if (error) throw new Error(error.message)

      const { item: rawItem, accounts, transactions, investments } = data as {
        item:         PluggyItem
        accounts:     PluggyAccount[]
        transactions: PluggyTransaction[]
        investments:  PluggyInvestment[]
      }

      await handleSuccess({ item: { ...rawItem, id: itemId } })

    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message })
      setTimeout(() => setStatus({ type: 'idle' }), 6000)
    }
  }, [handleSuccess])

  // Disconnect: removes the local Pluggy connection record only. Imported
  // transactions and investments are intentionally PRESERVED — disconnecting
  // a bank should not erase the user's history. To delete imported items the
  // user must use the Duplicatas section (Cashflow / Wealth) or remove
  // individual records by hand.
  const removeItem = (itemId: string) =>
    setItems(prev => prev.filter(i => i.itemId !== itemId))

  const isSyncing = (itemId: string) =>
    status.type === 'syncing' && status.itemId === itemId

  // Keep the ref up-to-date so the Realtime callback always has the latest version
  syncExistingRef.current = syncExisting

  return (
    <div className="min-h-screen animate-fade-in">
      <PageHeader
        title="Open Finance"
        subtitle="Conecte seus bancos e corretoras para importar lançamentos e investimentos automaticamente"
      />

      {/* Pluggy Connect widget — rendered when token is available */}
      {connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={true}
          onSuccess={handleSuccess}
          onError={handleError}
          onClose={handleClose}
        />
      )}

      <div className="p-4 sm:p-6 space-y-5">

        {/* Auto-sync banner (webhook-triggered) */}
        {autoSyncMsg && (
          <div className="flex items-center gap-3 p-4 bg-[#8b5cf6]/5 border border-[#8b5cf6]/20 rounded-2xl animate-fade-in">
            <RefreshCw className="w-4 h-4 text-[#8b5cf6] animate-spin flex-shrink-0" />
            <p className="text-sm text-[#8b5cf6]">{autoSyncMsg}</p>
          </div>
        )}

        {/* Status banners */}
        {status.type === 'loading-token' && (
          <div className="flex items-center gap-3 p-4 bg-[#00d4ff]/5 border border-[#00d4ff]/20 rounded-2xl">
            <Loader2 className="w-5 h-5 text-[#00d4ff] animate-spin flex-shrink-0" />
            <p className="text-sm text-[#00d4ff]">Preparando conexão segura…</p>
          </div>
        )}

        {(status.type === 'syncing') && (
          <div className="flex items-center gap-3 p-4 bg-[#00d4ff]/5 border border-[#00d4ff]/20 rounded-2xl">
            <Loader2 className="w-5 h-5 text-[#00d4ff] animate-spin flex-shrink-0" />
            <p className="text-sm text-[#00d4ff]">Importando lançamentos e investimentos…</p>
          </div>
        )}

        {status.type === 'done' && (
          <div className="flex items-center gap-3 p-4 bg-[#00ff88]/5 border border-[#00ff88]/20 rounded-2xl animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-[#00ff88] flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[#00ff88]">Sincronização concluída!</p>
              <p className="text-xs text-[#55556a]">
                {status.count.tx} lançamento{status.count.tx !== 1 ? 's' : ''} e{' '}
                {status.count.inv} investimento{status.count.inv !== 1 ? 's' : ''} importados
              </p>
            </div>
          </div>
        )}

        {status.type === 'error' && (
          <div className="flex items-center gap-3 p-4 bg-[#ff4466]/5 border border-[#ff4466]/20 rounded-2xl animate-fade-in">
            <AlertCircle className="w-5 h-5 text-[#ff4466] flex-shrink-0" />
            <p className="text-sm text-[#ff4466]">{status.message}</p>
          </div>
        )}

        {/* Connect button */}
        <button
          onClick={() => openWidget()}
          disabled={status.type === 'loading-token' || status.type === 'widget-open'}
          className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl
                     bg-[#00d4ff]/10 border border-[#00d4ff]/30
                     hover:bg-[#00d4ff]/15 hover:border-[#00d4ff]/50
                     text-[#00d4ff] font-semibold text-sm
                     transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status.type === 'loading-token'
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Plus className="w-4 h-4" />}
          Conectar banco ou corretora
        </button>

        {/* Connected items list */}
        {items.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#55556a] px-1">
              Conexões ativas ({items.length})
            </p>
            {items.map(item => (
              <ItemCard
                key={item.itemId}
                item={item}
                onSync={syncExisting}
                onRemove={removeItem}
                syncing={isSyncing(item.itemId)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <Card className="p-8 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-[#16161f] flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[#55556a]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#e8e8f0]">Nenhum banco conectado</p>
              <p className="text-xs text-[#55556a] mt-1">
                Conecte sua primeira instituição para importar dados automaticamente
              </p>
            </div>
          </Card>
        )}

        {/* How it works */}
        <Card className="p-5 border-dashed">
          <p className="text-xs font-semibold text-[#8888aa] mb-3 uppercase tracking-wider">Como funciona</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: '🔐', title: 'Autenticação segura',  desc: 'Pluggy usa OAuth — suas credenciais nunca passam pelo Luxor.' },
              { icon: '🏦', title: '+300 instituições',    desc: 'Nubank, Itaú, XP, BTG, Inter, Rico e muito mais.' },
              { icon: '📥', title: 'Importação inteligente', desc: 'Transações e investimentos categorizados automaticamente.' },
              { icon: '🔄', title: 'Sincronização manual', desc: 'Sincronize quando quiser para trazer os lançamentos mais recentes.' },
            ].map(s => (
              <div key={s.title} className="flex gap-3">
                <span className="text-xl leading-tight">{s.icon}</span>
                <div>
                  <p className="text-xs font-semibold text-[#e8e8f0]">{s.title}</p>
                  <p className="text-[11px] text-[#55556a] mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <p className="text-[11px] text-[#55556a] text-center flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3 h-3 text-[#00d4ff]" />
          Seus dados bancários não são armazenados nos servidores do Luxor — apenas os lançamentos importados ficam salvos localmente.
        </p>

      </div>
    </div>
  )
}
