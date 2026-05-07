// ─────────────────────────────────────────────
//  Global state (Zustand) — in-memory mirror of IndexedDB
// ─────────────────────────────────────────────
import { create } from 'zustand'
import { db, seedDemoData } from '../lib/db'
import type { LuxorBackup } from '../lib/db'
import type {
  Transaction, Investment, TaxDeductible,
  Attachment, RecurringTransaction, AppSettings, FinancialGoal, Category, Partnership,
} from '../lib/types'
import { DEFAULT_SETTINGS } from '../lib/types'
import { nanoid } from 'nanoid'
import { supabase } from '../lib/supabase'
import {
  createPartnership, loadPartnershipState, acceptInvite, endPartnership as endPartnershipApi,
} from '../lib/partnership'
import {
  tombstoneIfPluggy, extractPluggyTxId, extractPluggyInvId,
} from '../lib/pluggyTombstones'

/**
 * Resolve the user's display name from (in order):
 *  1. The auth user's `full_name` / `name` metadata captured at signup
 *  2. The `luxor_signup_name` localStorage value cached during signup
 *  3. The local part of the user's e-mail (before '@')
 */
async function resolveSignupName(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser()
    const user = data.user
    if (user) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>
      const fromMeta =
        (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
        (typeof meta.name === 'string' && meta.name.trim())
      if (fromMeta) return String(fromMeta).trim()
      if (user.email) {
        const local = user.email.split('@')[0]?.trim()
        if (local) return local
      }
    }
  } catch { /* ignore — fall through */ }
  try {
    const cached = localStorage.getItem('luxor_signup_name')
    if (cached && cached.trim()) return cached.trim()
  } catch { /* ignore */ }
  return null
}

/** Resolve the suitability profile chosen at signup, if any. */
async function resolveSignupSuitability(): Promise<AppSettings['suitability'] | null> {
  const valid: AppSettings['suitability'][] = ['Conservador', 'Moderado', 'Arrojado', 'Agressivo']
  const isValid = (v: unknown): v is AppSettings['suitability'] =>
    typeof v === 'string' && (valid as string[]).includes(v)
  try {
    const { data } = await supabase.auth.getUser()
    const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>
    if (isValid(meta.suitability)) return meta.suitability
  } catch { /* ignore */ }
  try {
    const cached = localStorage.getItem('luxor_signup_suitability')
    if (isValid(cached)) return cached
  } catch { /* ignore */ }
  return null
}

interface AppState {
  // data
  transactions:  Transaction[]
  investments:   Investment[]
  taxItems:      TaxDeductible[]
  attachments:   Attachment[]
  subscriptions: RecurringTransaction[]
  goals:         FinancialGoal[]
  settings:      AppSettings

  // couples sharing
  partnership:          Partnership | null
  partnerEmail:         string | null
  partnerTransactions:  Transaction[]
  partnershipLoading:   boolean

  // UI state
  isLoading: boolean
  activeModal: string | null

  // actions
  init: () => Promise<void>
  setModal: (id: string | null) => void

  // transactions
  addTransaction:    (t: Omit<Transaction, 'id'>) => Promise<void>
  updateTransaction: (t: Transaction) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>

  // investments
  addInvestment:    (i: Omit<Investment, 'id'>) => Promise<void>
  updateInvestment: (i: Investment) => Promise<void>
  deleteInvestment: (id: string) => Promise<void>

  // tax
  addTaxItem:    (t: Omit<TaxDeductible, 'id'>) => Promise<void>
  updateTaxItem: (t: TaxDeductible) => Promise<void>
  deleteTaxItem: (id: string) => Promise<void>

  // attachments
  addAttachment:    (a: Omit<Attachment, 'id'>) => Promise<Attachment>
  deleteAttachment: (id: string) => Promise<void>

  // subscriptions
  addSubscription:    (s: Omit<RecurringTransaction, 'id'>) => Promise<void>
  updateSubscription: (s: RecurringTransaction) => Promise<void>
  deleteSubscription: (id: string) => Promise<void>

  // goals
  addGoal:    (g: Omit<FinancialGoal, 'id'>) => Promise<void>
  updateGoal: (g: FinancialGoal) => Promise<void>
  deleteGoal: (id: string) => Promise<void>

  // settings
  saveSettings: (s: AppSettings) => Promise<void>

  // custom categories
  addCustomCategory:    (c: Omit<Category, 'id'>) => Promise<string>
  updateCustomCategory: (id: string, patch: Partial<Omit<Category, 'id'>>) => Promise<void>
  deleteCustomCategory: (id: string) => Promise<void>

  // custom institutions
  saveCustomInstitution: (institution: string) => Promise<void>

  // custom payment methods
  saveCustomPaymentMethod: (method: string) => Promise<void>

  // nuclear option
  clearAllData: () => Promise<void>

  // backup / restore
  exportData: () => Promise<void>
  importData: (backup: LuxorBackup) => Promise<void>

  // couples sharing
  loadPartnership: () => Promise<void>
  createInviteCode: () => Promise<void>
  acceptInviteCode: (code: string) => Promise<void>
  stopSharing: () => Promise<void>
  setTransactionVisibility: (id: string, visibility: 'private' | 'shared') => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  transactions:  [],
  investments:   [],
  taxItems:      [],
  attachments:   [],
  subscriptions: [],
  goals:         [],
  settings:      DEFAULT_SETTINGS,
  isLoading:     true,
  activeModal:   null,

  // couples sharing initial state
  partnership:         null,
  partnerEmail:        null,
  partnerTransactions: [],
  partnershipLoading:  false,

  init: async () => {
    try {
      await seedDemoData()
      const [transactions, investments, taxItems, attachments, subscriptions, goals, loadedSettings, hadSettingsRow] =
        await Promise.all([
          db.transactions.getAll(),
          db.investments.getAll(),
          db.tax.getAll(),
          db.attachments.getAll(),
          db.subscriptions.getAll(),
          db.goals.getAll(),
          db.settings.get(),
          db.settings.exists(),
        ])

      // Only apply signup metadata when the user has NEVER saved settings
      // (i.e. first ever load). Otherwise we would overwrite their explicit
      // choices every time the saved value happens to match the default.
      let settings = loadedSettings
      if (!hadSettingsRow) {
        const [signupName, signupSuitability] = await Promise.all([
          resolveSignupName(),
          resolveSignupSuitability(),
        ])
        if (signupName)        settings = { ...settings, name: signupName }
        if (signupSuitability) settings = { ...settings, suitability: signupSuitability }
        if (settings !== loadedSettings) await db.settings.save(settings)
      }

      set({ transactions, investments, taxItems, attachments, subscriptions, goals, settings, isLoading: false })
    } catch (err) {
      console.error('[init] failed to load data:', err)
      set({ isLoading: false })
    }
  },

  setModal: (id) => set({ activeModal: id }),

  // ── Transactions ───────────────────────────
  addTransaction: async (data) => {
    const t: Transaction = { ...data, id: nanoid(), createdAt: new Date().toISOString() }
    await db.transactions.upsert(t)
    set(s => ({ transactions: [t, ...s.transactions] }))
  },
  updateTransaction: async (t) => {
    await db.transactions.upsert(t)
    set(s => ({ transactions: s.transactions.map(x => x.id === t.id ? t : x) }))
  },
  deleteTransaction: async (id) => {
    // If this transaction came from Pluggy, tombstone its Pluggy ID so future
    // syncs (from any device) skip it permanently.
    const tx = get().transactions.find(x => x.id === id)
    if (tx) await tombstoneIfPluggy('transaction', extractPluggyTxId(tx))
    await db.transactions.delete(id)
    set(s => ({ transactions: s.transactions.filter(x => x.id !== id) }))
  },

  // ── Investments ────────────────────────────
  addInvestment: async (data) => {
    const i: Investment = { ...data, id: nanoid() }
    await db.investments.upsert(i)
    set(s => ({ investments: [i, ...s.investments] }))
  },
  updateInvestment: async (inv) => {
    await db.investments.upsert(inv)
    set(s => ({ investments: s.investments.map(x => x.id === inv.id ? inv : x) }))
  },
  deleteInvestment: async (id) => {
    // Same tombstone treatment for Pluggy-imported investments.
    const inv = get().investments.find(x => x.id === id)
    if (inv) await tombstoneIfPluggy('investment', extractPluggyInvId(inv))
    await db.investments.delete(id)
    set(s => ({ investments: s.investments.filter(x => x.id !== id) }))
  },

  // ── Tax ────────────────────────────────────
  addTaxItem: async (data) => {
    const t: TaxDeductible = { ...data, id: nanoid() }
    await db.tax.upsert(t)
    set(s => ({ taxItems: [t, ...s.taxItems] }))
  },
  updateTaxItem: async (t) => {
    await db.tax.upsert(t)
    set(s => ({ taxItems: s.taxItems.map(x => x.id === t.id ? t : x) }))
  },
  deleteTaxItem: async (id) => {
    await db.tax.delete(id)
    set(s => ({ taxItems: s.taxItems.filter(x => x.id !== id) }))
  },

  // ── Attachments ────────────────────────────
  addAttachment: async (data) => {
    const a: Attachment = { ...data, id: nanoid() }
    await db.attachments.upsert(a)
    set(s => ({ attachments: [a, ...s.attachments] }))
    return a
  },
  deleteAttachment: async (id) => {
    await db.attachments.delete(id)
    set(s => ({ attachments: s.attachments.filter(x => x.id !== id) }))
  },

  // ── Subscriptions ──────────────────────────
  addSubscription: async (data) => {
    const s: RecurringTransaction = { ...data, id: nanoid() }
    await db.subscriptions.upsert(s)
    set(st => ({ subscriptions: [s, ...st.subscriptions] }))
  },
  updateSubscription: async (sub) => {
    await db.subscriptions.upsert(sub)
    set(s => ({ subscriptions: s.subscriptions.map(x => x.id === sub.id ? sub : x) }))
  },
  deleteSubscription: async (id) => {
    await db.subscriptions.delete(id)
    set(s => ({ subscriptions: s.subscriptions.filter(x => x.id !== id) }))
  },

  // ── Goals ──────────────────────────────────
  addGoal: async (data) => {
    const g: FinancialGoal = { ...data, id: nanoid() }
    await db.goals.upsert(g)
    set(s => ({ goals: [g, ...s.goals] }))
  },
  updateGoal: async (g) => {
    await db.goals.upsert(g)
    set(s => ({ goals: s.goals.map(x => x.id === g.id ? g : x) }))
  },
  deleteGoal: async (id) => {
    await db.goals.delete(id)
    set(s => ({ goals: s.goals.filter(x => x.id !== id) }))
  },

  // ── Settings ───────────────────────────────
  saveSettings: async (settings) => {
    await db.settings.save(settings)
    set({ settings })
  },

  // ── Custom categories ───────────────────────
  addCustomCategory: async (data) => {
    const cat: Category = { ...data, id: nanoid() }
    const current = get().settings
    const updated = { ...current, customCategories: [...(current.customCategories ?? []), cat] }
    await db.settings.save(updated)
    set({ settings: updated })
    return cat.id
  },
  updateCustomCategory: async (id, patch) => {
    const current = get().settings
    const list = (current.customCategories ?? []).map(c =>
      c.id === id ? { ...c, ...patch } : c,
    )
    const updated = { ...current, customCategories: list }
    await db.settings.save(updated)
    set({ settings: updated })
  },
  deleteCustomCategory: async (id) => {
    const current = get().settings
    const updated = { ...current, customCategories: (current.customCategories ?? []).filter(c => c.id !== id) }
    await db.settings.save(updated)
    set({ settings: updated })
  },

  // ── Custom institutions ─────────────────────
  saveCustomInstitution: async (institution) => {
    const current = get().settings
    const existing = current.customInstitutions ?? []
    if (existing.includes(institution)) return
    const updated = { ...current, customInstitutions: [...existing, institution] }
    await db.settings.save(updated)
    set({ settings: updated })
  },

  // ── Custom payment methods ─────────────────
  saveCustomPaymentMethod: async (method) => {
    const current = get().settings
    const existing = current.customPaymentMethods ?? []
    if (existing.includes(method)) return
    const updated = { ...current, customPaymentMethods: [...existing, method] }
    await db.settings.save(updated)
    set({ settings: updated })
  },

  // ── Export / Import ────────────────────────
  exportData: async () => {
    const backup = await db.exportData()
    const json   = JSON.stringify(backup, null, 2)
    const blob   = new Blob([json], { type: 'application/json' })
    const url    = URL.createObjectURL(blob)
    const date   = new Date().toISOString().split('T')[0]
    const a      = document.createElement('a')
    a.href       = url
    a.download   = `luxorpro-backup-${date}.json`
    a.click()
    URL.revokeObjectURL(url)
  },

  importData: async (backup: LuxorBackup) => {
    await db.importData(backup)
    set({
      transactions:  backup.transactions,
      investments:   backup.investments,
      taxItems:      backup.taxItems,
      attachments:   backup.attachments,
      subscriptions: backup.subscriptions,
      goals:         backup.goals,
      settings:      backup.settings,
    })
  },

  // ── Couples Sharing ────────────────────────
  loadPartnership: async () => {
    set({ partnershipLoading: true })
    try {
      const state = await loadPartnershipState()
      set({ ...state, partnershipLoading: false })
    } catch (err) {
      console.error('[loadPartnership]', err)
      set({ partnershipLoading: false })
    }
  },

  createInviteCode: async () => {
    set({ partnershipLoading: true })
    try {
      const partnership = await createPartnership()
      set({ partnership, partnerEmail: null, partnerTransactions: [], partnershipLoading: false })
    } catch (err) {
      set({ partnershipLoading: false })
      throw err
    }
  },

  acceptInviteCode: async (code) => {
    set({ partnershipLoading: true })
    try {
      const state = await acceptInvite(code)
      set({ ...state, partnershipLoading: false })
    } catch (err) {
      set({ partnershipLoading: false })
      throw err
    }
  },

  stopSharing: async () => {
    const { partnership, transactions } = get()
    if (!partnership) return
    set({ partnershipLoading: true })
    try {
      await endPartnershipApi(partnership.id)
      // Reset all user's shared transactions back to private
      const sharedTxs = transactions.filter(
        t => t.sharedWithPartnershipId === partnership.id && t.visibility === 'shared'
      )
      await Promise.all(
        sharedTxs.map(t => db.transactions.upsert({
          ...t, visibility: 'private', sharedWithPartnershipId: undefined,
        }))
      )
      set(s => ({
        partnership: null,
        partnerEmail: null,
        partnerTransactions: [],
        partnershipLoading: false,
        transactions: s.transactions.map(t =>
          t.sharedWithPartnershipId === partnership.id
            ? { ...t, visibility: 'private', sharedWithPartnershipId: undefined }
            : t
        ),
      }))
    } catch (err) {
      set({ partnershipLoading: false })
      throw err
    }
  },

  setTransactionVisibility: async (id, visibility) => {
    const { transactions, partnership } = get()
    const t = transactions.find(x => x.id === id)
    if (!t || !partnership || partnership.status !== 'active') return
    const updated: Transaction = {
      ...t,
      visibility,
      sharedWithPartnershipId: visibility === 'shared' ? partnership.id : undefined,
    }
    await db.transactions.upsert(updated)
    set(s => ({ transactions: s.transactions.map(x => x.id === id ? updated : x) }))
  },

  // ── Clear all data ─────────────────────────
  clearAllData: async () => {
    // Preserve custom categories — they are user config, not financial data
    const customCategories = get().settings.customCategories ?? []
    const freshSettings = { ...DEFAULT_SETTINGS, customCategories }

    // db.clearAll wipes every store and re-sets the seed flag so
    // demo data does not re-appear on the next page refresh.
    await db.clearAll(freshSettings)

    set({
      transactions:  [],
      investments:   [],
      taxItems:      [],
      attachments:   [],
      subscriptions: [],
      goals:         [],
      settings:      freshSettings,
    })
  },
}))
