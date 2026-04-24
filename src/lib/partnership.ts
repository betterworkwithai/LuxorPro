// ─────────────────────────────────────────────
//  Partnership service — all calls go through
//  SECURITY DEFINER RPCs so the client never
//  touches luxor_partnerships via PostgREST.
// ─────────────────────────────────────────────
import { supabase } from './supabase'
import type { Partnership, Transaction } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

/** Create a new pending partnership with a random 6-digit invite code. */
export async function createPartnership(): Promise<Partnership> {
  const { data, error } = await sb.rpc('create_partnership')
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return {
    id:         data.id,
    user1Id:    data.user1Id,
    user2Id:    data.user2Id ?? null,
    inviteCode: data.inviteCode,
    status:     data.status,
    createdAt:  data.createdAt,
    updatedAt:  data.updatedAt,
  }
}

export interface PartnershipState {
  partnership:         Partnership | null
  partnerEmail:        string | null
  partnerTransactions: Transaction[]
}

/** Load full partnership state for the current user. */
export async function loadPartnershipState(): Promise<PartnershipState> {
  const { data: info, error } = await sb.rpc('get_partner_info')
  if (error) throw error

  if (!info) return { partnership: null, partnerEmail: null, partnerTransactions: [] }

  const partnership: Partnership = {
    id:         info.partnershipId,
    user1Id:    '',
    user2Id:    null,
    inviteCode: info.inviteCode,
    status:     info.status,
    createdAt:  '',
    updatedAt:  '',
  }

  let partnerTransactions: Transaction[] = []
  if (info.status === 'active') {
    const { data: txData, error: txErr } = await sb.rpc('get_partner_shared_transactions')
    if (txErr) throw txErr
    partnerTransactions = Array.isArray(txData) ? txData : []
  }

  return { partnership, partnerEmail: info.partnerEmail ?? null, partnerTransactions }
}

/** Accept an invite code. Returns the updated partnership state. */
export async function acceptInvite(code: string): Promise<PartnershipState> {
  const { data, error } = await sb.rpc('accept_partnership_invite', { p_invite_code: code.trim() })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return loadPartnershipState()
}

/** Mark the partnership as ended. */
export async function endPartnership(partnershipId: string): Promise<void> {
  const { error } = await sb.rpc('end_partnership', { p_partnership_id: partnershipId })
  if (error) throw error
}
