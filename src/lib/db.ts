// ─────────────────────────────────────────────
//  Cloud-first persistence (Supabase) for core financial data.
//  Attachments stay in IndexedDB (large blobs, kept local).
//
//  Public API surface is unchanged so callers (the Zustand store)
//  do not need to know whether the backend is local or cloud.
// ─────────────────────────────────────────────
import localforage from 'localforage'
import { supabase } from './supabase'
import type {
  Transaction, Investment, TaxDeductible,
  Attachment, RecurringTransaction, AppSettings, FinancialGoal,
} from './types'
import { DEFAULT_SETTINGS } from './types'

export interface GaaraBackup {
  version: number
  exportedAt: string
  transactions:  Transaction[]
  investments:   Investment[]
  taxItems:      TaxDeductible[]
  attachments:   Attachment[]
  subscriptions: RecurringTransaction[]
  goals:         FinancialGoal[]
  settings:      AppSettings
}

// ─── Local-only attachment store ──────────────
// Attachments are blobs (potentially large base64 data URLs) and the user
// asked us to keep them local. Scope by user id so accounts on the same
// browser can't see each other's files.
let currentUserId = 'anon'
let attachmentStore: LocalForage = buildAttachmentStore('anon')

function buildAttachmentStore(userId: string): LocalForage {
  return localforage.createInstance({
    name: `gaara_${userId}`,
    storeName: 'attachments',
  })
}

export function setActiveUser(userId: string | null | undefined): void {
  const next = userId && userId.trim() ? userId : 'anon'
  if (next === currentUserId) return
  currentUserId = next
  attachmentStore = buildAttachmentStore(currentUserId)
}

// ─── Cloud auth helper ───────────────────────
async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user?.id
  if (!id) throw new Error('Not authenticated')
  return id
}

// Generic helpers for tables that follow the (user_id, client_id, data) shape.
type LuxorTable =
  | 'luxor_transactions'
  | 'luxor_investments'
  | 'luxor_goals'
  | 'luxor_subscriptions'
  | 'luxor_tax_items'

async function cloudGetAll<T>(table: LuxorTable): Promise<T[]> {
  const userId = await requireUserId()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from(table)
    .select('data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Array<{ data: T }>).map(r => r.data)
}

async function cloudUpsert<T extends { id: string }>(table: LuxorTable, item: T): Promise<T> {
  const userId = await requireUserId()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from(table)
    .upsert(
      { user_id: userId, client_id: item.id, data: item },
      { onConflict: 'user_id,client_id' },
    )
  if (error) throw error
  return item
}

async function cloudDelete(table: LuxorTable, id: string): Promise<void> {
  const userId = await requireUserId()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from(table)
    .delete()
    .eq('user_id', userId)
    .eq('client_id', id)
  if (error) throw error
}

// ─── Public API ───────────────────────────────
export const db = {
  transactions: {
    getAll: () => cloudGetAll<Transaction>('luxor_transactions'),
    upsert: (t: Transaction) => cloudUpsert('luxor_transactions', t),
    delete: (id: string) => cloudDelete('luxor_transactions', id),
    getById: async (id: string): Promise<Transaction | null> => {
      const all = await cloudGetAll<Transaction>('luxor_transactions')
      return all.find(t => t.id === id) ?? null
    },
  },

  investments: {
    getAll: () => cloudGetAll<Investment>('luxor_investments'),
    upsert: (i: Investment) => cloudUpsert('luxor_investments', i),
    delete: (id: string) => cloudDelete('luxor_investments', id),
  },

  tax: {
    getAll: () => cloudGetAll<TaxDeductible>('luxor_tax_items'),
    upsert: (t: TaxDeductible) => cloudUpsert('luxor_tax_items', t),
    delete: (id: string) => cloudDelete('luxor_tax_items', id),
  },

  // Attachments stay local — large blobs would blow up cloud storage.
  attachments: {
    getAll: async (): Promise<Attachment[]> => {
      const items: Attachment[] = []
      await attachmentStore.iterate((v: Attachment) => { items.push(v) })
      return items
    },
    upsert: async (a: Attachment): Promise<Attachment> => {
      await attachmentStore.setItem(a.id, a)
      return a
    },
    delete: (id: string) => attachmentStore.removeItem(id),
    getById: (id: string) => attachmentStore.getItem<Attachment>(id),
  },

  subscriptions: {
    getAll: () => cloudGetAll<RecurringTransaction>('luxor_subscriptions'),
    upsert: (s: RecurringTransaction) => cloudUpsert('luxor_subscriptions', s),
    delete: (id: string) => cloudDelete('luxor_subscriptions', id),
  },

  goals: {
    getAll: () => cloudGetAll<FinancialGoal>('luxor_goals'),
    upsert: (g: FinancialGoal) => cloudUpsert('luxor_goals', g),
    delete: (id: string) => cloudDelete('luxor_goals', id),
  },

  settings: {
    get: async (): Promise<AppSettings> => {
      const userId = await requireUserId()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('luxor_settings')
        .select('data')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return (data?.data as AppSettings | undefined) ?? DEFAULT_SETTINGS
    },
    /** Returns true if a settings row already exists for this user. */
    exists: async (): Promise<boolean> => {
      const userId = await requireUserId()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('luxor_settings')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },
    save: async (s: AppSettings): Promise<AppSettings> => {
      const userId = await requireUserId()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('luxor_settings')
        .upsert({ user_id: userId, data: s }, { onConflict: 'user_id' })
      if (error) throw error
      return s
    },
  },

  /** Export all data as a serialisable backup object. */
  exportData: async (): Promise<GaaraBackup> => {
    const [transactions, investments, taxItems, attachments, subscriptions, goals, settings] =
      await Promise.all([
        cloudGetAll<Transaction>('luxor_transactions'),
        cloudGetAll<Investment>('luxor_investments'),
        cloudGetAll<TaxDeductible>('luxor_tax_items'),
        db.attachments.getAll(),
        cloudGetAll<RecurringTransaction>('luxor_subscriptions'),
        cloudGetAll<FinancialGoal>('luxor_goals'),
        db.settings.get(),
      ])
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      transactions, investments, taxItems, attachments,
      subscriptions, goals, settings,
    }
  },

  /** Wipe everything for the current user and restore from a backup object. */
  importData: async (backup: GaaraBackup): Promise<void> => {
    await db.clearAll(backup.settings)
    const writes: Promise<unknown>[] = []
    for (const t of backup.transactions)  writes.push(cloudUpsert('luxor_transactions', t))
    for (const i of backup.investments)   writes.push(cloudUpsert('luxor_investments', i))
    for (const t of backup.taxItems)      writes.push(cloudUpsert('luxor_tax_items', t))
    for (const a of backup.attachments)   writes.push(attachmentStore.setItem(a.id, a))
    for (const s of backup.subscriptions) writes.push(cloudUpsert('luxor_subscriptions', s))
    for (const g of backup.goals)         writes.push(cloudUpsert('luxor_goals', g))
    writes.push(db.settings.save(backup.settings))
    await Promise.all(writes)
  },

  /** Wipe all financial data for the current user. */
  clearAll: async (freshSettings?: AppSettings): Promise<void> => {
    const userId = await requireUserId()
    const tables: LuxorTable[] = [
      'luxor_transactions',
      'luxor_investments',
      'luxor_tax_items',
      'luxor_subscriptions',
      'luxor_goals',
    ]
    await Promise.all([
      ...tables.map(async t => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from(t).delete().eq('user_id', userId)
        if (error) throw error
      }),
      attachmentStore.clear(),
    ])
    await db.settings.save(freshSettings ?? DEFAULT_SETTINGS)
  },
}

/**
 * No-op kept for API compatibility with the previous IndexedDB module.
 * New cloud accounts start with completely blank data.
 */
export async function seedDemoData(): Promise<void> {
  // Intentionally empty — settings are lazily created on first save.
}
