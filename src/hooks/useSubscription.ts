// ─── useSubscription ─────────────────────────────────────────────────────────
//
// Reads subscription state from the `profiles` table and subscribes to
// real-time updates pushed by the stripe-webhook edge function.
//
// In local mode (SUPABASE_CONFIGURED = false) all features are active —
// no paywall is shown. Falls back to localStorage if the table query fails.

import { useEffect, useState, useCallback } from 'react'
import { supabase, SUPABASE_CONFIGURED } from '../lib/supabase'
import { getStoredSubscription } from '../lib/stripe'

export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled'

export interface SubscriptionInfo {
  status:             SubscriptionStatus
  plan:               string | null
  trialEnd:           Date   | null
  periodEnd:          Date   | null
  cancelAtPeriodEnd:  boolean  // true when user has scheduled cancellation
  isActive:           boolean  // true when status is active or trialing
  loading:            boolean
}

export function useSubscription(): SubscriptionInfo & { refresh: () => void } {
  const [data, setData]     = useState<Omit<SubscriptionInfo, 'loading'>>(() => ({
    status:            'none',
    plan:              null,
    trialEnd:          null,
    periodEnd:         null,
    cancelAtPeriodEnd: false,
    isActive:          !SUPABASE_CONFIGURED, // local mode → always active
  }))
  const [loading, setLoading] = useState(SUPABASE_CONFIGURED)

  const fetch = useCallback(async () => {
    if (!SUPABASE_CONFIGURED) {
      setData(d => ({ ...d, isActive: true }))
      setLoading(false)
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: row, error } = await supabase
        .from('profiles')
        .select('subscription_status, subscription_plan, subscription_current_period_end, trial_end, cancel_at_period_end')
        .eq('id', user.id)
        .single()

      if (error || !row) {
        // Fallback to optimistic localStorage value
        const stored = getStoredSubscription()
        setData({
          status:            stored ? 'active' : 'none',
          plan:              stored,
          trialEnd:          null,
          periodEnd:         null,
          cancelAtPeriodEnd: false,
          isActive:          !!stored,
        })
        setLoading(false)
        return
      }

      const status = (row.subscription_status ?? 'none') as SubscriptionStatus
      setData({
        status,
        plan:              row.subscription_plan ?? null,
        trialEnd:          row.trial_end ? new Date(row.trial_end) : null,
        periodEnd:         row.subscription_current_period_end
          ? new Date(row.subscription_current_period_end)
          : null,
        cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
        isActive:          status === 'active' || status === 'trialing',
      })
    } catch {
      const stored = getStoredSubscription()
      setData(d => ({ ...d, isActive: !!stored, cancelAtPeriodEnd: false }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()

    if (!SUPABASE_CONFIGURED) return

    // Real-time: re-fetch whenever the webhook updates our profile row
    const channel = supabase
      .channel('luxor-profile-sub')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        () => fetch(),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetch])

  return { ...data, loading, refresh: fetch }
}
