// ─── Pluggy tombstones ───────────────────────────────────────────────────────
// Tracks Pluggy IDs that the user has explicitly deleted (manually, via the
// Duplicatas section, or via Convert-to-Investment). Future syncs from any
// device will skip these so deleted items can never be re-imported.

import { supabase } from './supabase'
import type { Transaction, Investment } from './types'

/** Extract the Pluggy ID from a transaction's tags, if any. */
export function extractPluggyTxId(tx: Pick<Transaction, 'tags'>): string | null {
  for (const tag of tx.tags ?? []) {
    if (tag.startsWith('pluggy:')) return tag.slice(7)
  }
  return null
}

/** Extract the Pluggy ID from an investment's notes, if any. */
export function extractPluggyInvId(inv: Pick<Investment, 'notes'>): string | null {
  const m = inv.notes?.match(/pluggy:([^\s]+)/)
  return m ? m[1] : null
}

/** Best-effort write to the tombstones table; never throws to callers. */
export async function tombstoneIfPluggy(
  kind: 'transaction' | 'investment',
  pluggyId: string | null | undefined,
): Promise<void> {
  if (!pluggyId) return
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // Upsert — duplicate inserts are a no-op thanks to the (user_id, pluggy_id) PK.
    await supabase.from('pluggy_tombstones').upsert(
      { user_id: user.id, pluggy_id: pluggyId, kind },
      { onConflict: 'user_id,pluggy_id' },
    )
  } catch (err) {
    // Tombstone write failures are non-fatal — the deletion still proceeds.
    // Worst case: a re-sync from another device might re-import the item,
    // which the user can simply delete again.
    console.warn('[tombstoneIfPluggy] failed:', err)
  }
}

/** Loads every tombstoned Pluggy ID for the current user. */
export async function loadTombstones(): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('pluggy_tombstones')
      .select('pluggy_id')
    if (error) throw error
    return new Set((data ?? []).map((r: { pluggy_id: string }) => r.pluggy_id))
  } catch (err) {
    console.warn('[loadTombstones] failed:', err)
    return new Set()
  }
}
