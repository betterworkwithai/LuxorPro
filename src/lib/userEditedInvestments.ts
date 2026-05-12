// ─────────────────────────────────────────────
//  Local-first registry of "user-edited" investment IDs.
//
//  Why this exists:
//  The Investment type already has a `lastUserEdit` ISO timestamp that we
//  stamp on every manual save and check in the Pluggy sync. That field is
//  stored inside the JSONB `data` column on Supabase — which in theory
//  round-trips cleanly. In practice we've seen cases where users report
//  manual edits getting clobbered by Pluggy resyncs after a page refresh,
//  and the most likely failure mode is `lastUserEdit` not making it back
//  out of Supabase (schema cache, RLS, or a one-off serialization glitch).
//
//  This module is a belt-and-suspenders backstop: we maintain a plain
//  array of "ever-edited" investment IDs in localStorage. Pluggy sync
//  checks this BEFORE consulting `lastUserEdit`. Survives every refresh,
//  doesn't depend on Supabase round-trip integrity, doesn't cross
//  devices (which is fine — Pluggy sync is per-device anyway).
// ─────────────────────────────────────────────

const LS_KEY = 'luxor_user_edited_investments_v1'

function readSet(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function writeSet(s: Set<string>): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(s)))
  } catch { /* quota / private mode — best-effort */ }
}

/** Mark an investment as user-edited. Idempotent. */
export function markInvestmentEdited(invId: string): void {
  if (!invId) return
  const s = readSet()
  if (s.has(invId)) return
  s.add(invId)
  writeSet(s)
}

/** True if the investment has been manually edited at any point. */
export function isInvestmentUserEdited(invId: string): boolean {
  if (!invId) return false
  return readSet().has(invId)
}

/** Remove an investment from the marker set (e.g. when user explicitly
 *  asks to revert to Pluggy values, or deletes the investment). */
export function unmarkInvestmentEdited(invId: string): void {
  const s = readSet()
  if (!s.has(invId)) return
  s.delete(invId)
  writeSet(s)
}

/** Wipe everything — used by 'clear all data' and end-of-demo flows. */
export function clearAllUserEditedMarkers(): void {
  try { localStorage.removeItem(LS_KEY) } catch { /* noop */ }
}
