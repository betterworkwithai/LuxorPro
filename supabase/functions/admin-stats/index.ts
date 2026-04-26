// ─── Edge Function: admin-stats ───────────────────────────────────────────────
//
// Returns aggregated business metrics for admin users only.
// Queries: Supabase profiles table, Supabase auth.users, Stripe API.
//
// Required env vars (same as other functions):
//   STRIPE_SECRET_KEY
//   SUPABASE_URL              (auto-set)
//   SUPABASE_SERVICE_ROLE_KEY (auto-set)
//
// Called by the /app/admin page via supabase.functions.invoke('admin-stats')

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Stripe from "npm:stripe@17"

const ADMIN_EMAILS = [
  'gabiaureli2@hotmail.com',
  'gabriel.aureli.araujo@gmail.com',
  'betterworkwithai@gmail.com',
]

const stripe  = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── Auth check ────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user?.email) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    if (!ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user.email.toLowerCase())) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders })
    }

    // ── 1. All profiles (subscription data) ──────────────────────────────────
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, stripe_customer_id, subscription_status, subscription_plan, subscription_current_period_end, trial_end, updated_at')
      .order('updated_at', { ascending: false })

    if (pErr) throw pErr

    // ── 2. All auth users (sign-up dates, emails, last sign-in) ──────────────
    const { data: { users: authUsers }, error: uErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    if (uErr) throw uErr

    // Map user id → auth info
    const userMap = new Map<string, { email: string; created_at: string; last_sign_in_at: string | null }>()
    for (const u of authUsers) {
      userMap.set(u.id, {
        email:            u.email ?? '',
        created_at:       u.created_at,
        last_sign_in_at:  u.last_sign_in_at ?? null,
      })
    }

    // ── 3. Enrich profiles with auth info ────────────────────────────────────
    const enriched = (profiles ?? []).map(p => ({
      ...p,
      email:           userMap.get(p.id)?.email ?? '',
      created_at:      userMap.get(p.id)?.created_at ?? '',
      last_sign_in_at: userMap.get(p.id)?.last_sign_in_at ?? null,
    }))

    // ── 4. Aggregate counts ──────────────────────────────────────────────────
    const total         = authUsers.length
    const active        = enriched.filter(p => p.subscription_status === 'active').length
    const trialing      = enriched.filter(p => p.subscription_status === 'trialing').length
    const pastDue       = enriched.filter(p => p.subscription_status === 'past_due').length
    const canceled      = enriched.filter(p => p.subscription_status === 'canceled').length
    const noPlan        = total - active - trialing - pastDue - canceled

    const monthly       = enriched.filter(p => p.subscription_plan === 'monthly'  && ['active','trialing'].includes(p.subscription_status)).length
    const annual        = enriched.filter(p => p.subscription_plan === 'annual'   && ['active','trialing'].includes(p.subscription_status)).length
    const lifetime      = enriched.filter(p => p.subscription_plan === 'lifetime' && p.subscription_status === 'active').length

    // MRR (in BRL): monthly=20, annual=200/12≈16.67, lifetime=0
    const mrr = (monthly * 20) + (annual * (200 / 12))
    const arr = mrr * 12

    // ── 5. Sign-ups by week (last 12 weeks) ──────────────────────────────────
    const now      = new Date()
    const weekBuckets: { week: string; count: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - i * 7 - now.getDay())
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)

      const count = authUsers.filter(u => {
        const d = new Date(u.created_at)
        return d >= weekStart && d <= weekEnd
      }).length

      const label = `${weekStart.getDate().toString().padStart(2,'0')}/${(weekStart.getMonth()+1).toString().padStart(2,'0')}`
      weekBuckets.push({ week: label, count })
    }

    // ── 6. Sign-ups by month (last 6 months) ─────────────────────────────────
    const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    const monthBuckets: { month: string; count: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const count = authUsers.filter(u => {
        const ud = new Date(u.created_at)
        return ud.getFullYear() === d.getFullYear() && ud.getMonth() === d.getMonth()
      }).length
      monthBuckets.push({ month: MONTHS[d.getMonth()], count })
    }

    // ── 7. Upcoming renewals (next 30 days) ──────────────────────────────────
    const in30 = new Date(now.getTime() + 30 * 24 * 3600 * 1000)
    const upcoming = enriched
      .filter(p => p.subscription_current_period_end && ['active','trialing'].includes(p.subscription_status))
      .filter(p => {
        const d = new Date(p.subscription_current_period_end!)
        return d >= now && d <= in30
      })
      .sort((a, b) => new Date(a.subscription_current_period_end!).getTime() - new Date(b.subscription_current_period_end!).getTime())
      .map(p => ({
        email:      p.email,
        plan:       p.subscription_plan,
        status:     p.subscription_status,
        period_end: p.subscription_current_period_end,
      }))

    // ── 8. Recent sign-ups (last 20) ─────────────────────────────────────────
    const recentUsers = [...authUsers]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20)
      .map(u => {
        const profile = enriched.find(p => p.id === u.id)
        return {
          email:               u.email ?? '',
          created_at:          u.created_at,
          last_sign_in_at:     u.last_sign_in_at ?? null,
          subscription_status: profile?.subscription_status ?? 'none',
          subscription_plan:   profile?.subscription_plan ?? null,
          period_end:          profile?.subscription_current_period_end ?? null,
        }
      })

    // ── 9. Full subscriber list (active + trialing) ──────────────────────────
    const subscribers = enriched
      .filter(p => ['active','trialing','past_due'].includes(p.subscription_status))
      .sort((a, b) => {
        const statusOrder: Record<string, number> = { past_due: 0, trialing: 1, active: 2 }
        return (statusOrder[a.subscription_status] ?? 3) - (statusOrder[b.subscription_status] ?? 3)
      })
      .map(p => ({
        email:               p.email,
        plan:                p.subscription_plan,
        status:              p.subscription_status,
        period_end:          p.subscription_current_period_end,
        trial_end:           p.trial_end,
        created_at:          p.created_at,
        last_sign_in_at:     p.last_sign_in_at,
        stripe_customer_id:  p.stripe_customer_id,
      }))

    // ── 10. DAU / WAU / MAU ──────────────────────────────────────────────────
    const day1  = new Date(now.getTime() - 1   * 24 * 3600 * 1000).toISOString()
    const day7  = new Date(now.getTime() - 7   * 24 * 3600 * 1000).toISOString()
    const day30 = new Date(now.getTime() - 30  * 24 * 3600 * 1000).toISOString()
    const dau   = authUsers.filter(u => u.last_sign_in_at && u.last_sign_in_at > day1).length
    const wau   = authUsers.filter(u => u.last_sign_in_at && u.last_sign_in_at > day7).length
    const mau   = authUsers.filter(u => u.last_sign_in_at && u.last_sign_in_at > day30).length

    // ── Response ─────────────────────────────────────────────────────────────
    return new Response(JSON.stringify({
      summary: { total, active, trialing, pastDue, canceled, noPlan, monthly, annual, lifetime, mrr, arr, dau, wau, mau },
      weeklySignups: weekBuckets,
      monthlySignups: monthBuckets,
      upcoming,
      recentUsers,
      subscribers,
      generatedAt: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    console.error('admin-stats error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
