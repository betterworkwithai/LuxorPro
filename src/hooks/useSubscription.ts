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

      // Try full query (including cancel_at_period_end if migration has run)
      let row: Record<string, unknown> | null = null
      let cancelAtPeriodEnd = false

      const { data: fullRow, error: fullError } = await supabase
        .from('profiles')
        .select('subscription_status, subscription_plan, subscription_current_period_end, trial_end, cancel_at_period_end')
        .eq('id', user.id)
        .single()

      if (!fullError && fullRow) {
        row = fullRow
        cancelAtPeriodEnd = (fullRow.cancel_at_period_end as boolean) ?? false
      } else {
        // Migration may not have run yet — retry without the new column
        const { data: partialRow } = await supabase
          .from('profiles')
          .select('subscription_status, subscription_plan, subscription_current_period_end, trial_end')
          .eq('id', user.id)
          .single()
        if (partialRow) row = partialRow
      }

      if (!row) {
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

      const status = ((row.subscription_status as string) ?? 'none') as SubscriptionStatus
      setData({
        status,
        plan:              (row.subscription_plan as string) ?? null,
        trialEnd:          row.trial_end ? new Date(row.trial_end as string) : null,
        periodEnd:         row.subscription_current_period_end
          ? new Date(row.subscription_current_period_end as string)
          : null,
        cancelAtPeriodEnd,
        isActive:          status === 'active' || status === 'trialing',
      })

      // ── Funnel: trial_started + trial_to_paid ──────────────────────────
      // Fire each event once per user, deduped via localStorage flags.
      // - trial_started: first time we observe `trialing`
      // - trial_to_paid: first time we observe `active` AFTER having seen
      //   trialing OR after a known checkout return
      try {
        const TRIAL_FLAG = 'luxor_funnel_trial_started'
        const PAID_FLAG  = 'luxor_funnel_trial_to_paid'
        const { track }  = await import('../lib/analytics')
        if (status === 'trialing' && !localStorage.getItem(TRIAL_FLAG)) {
          track('trial_started', { plan: row.subscription_plan ?? null })
          localStorage.setItem(TRIAL_FLAG, '1')
        }
        if (status === 'active' && !localStorage.getItem(PAID_FLAG)) {
          track('trial_to_paid', { plan: row.subscription_plan ?? null })
          localStorage.setItem(PAID_FLAG, '1')
        }
      } catch { /* best-effort */ }
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
