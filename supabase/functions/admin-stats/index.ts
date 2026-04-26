// ─── Edge Function: admin-stats ───────────────────────────────────────────────
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const ADMIN_EMAILS = [
  'gabiaureli2@hotmail.com',
  'gabriel.aureli.araujo@gmail.com',
  'betterworkwithai@gmail.com',
]

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  // Always handle CORS preflight first — before any other logic
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── Supabase clients (inside handler so errors don't crash startup) ────────
    const supabaseUrl     = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // ── Auth: verify caller is an admin email ─────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()

    if (!token) return json({ error: 'Missing token' }, 401)

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user?.email) return json({ error: 'Unauthorized' }, 401)

    const callerEmail = user.email.toLowerCase()
    if (!ADMIN_EMAILS.map(e => e.toLowerCase()).includes(callerEmail)) {
      return json({ error: 'Forbidden' }, 403)
    }

    // ── 1. All profiles ───────────────────────────────────────────────────────
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, stripe_customer_id, subscription_status, subscription_plan, subscription_current_period_end, trial_end, updated_at')
      .order('updated_at', { ascending: false })

    if (pErr) throw new Error(`profiles query failed: ${pErr.message}`)

    // ── 2. All auth users ─────────────────────────────────────────────────────
    const { data: { users: authUsers }, error: uErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    if (uErr) throw new Error(`auth.admin.listUsers failed: ${uErr.message}`)

    // ── 3. Enrich profiles with email + auth dates ────────────────────────────
    const userMap = new Map(authUsers.map(u => [u.id, {
      email: u.email ?? '',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }]))

    const enriched = (profiles ?? []).map(p => ({
      ...p,
      email:           userMap.get(p.id)?.email ?? '',
      created_at:      userMap.get(p.id)?.created_at ?? '',
      last_sign_in_at: userMap.get(p.id)?.last_sign_in_at ?? null,
    }))

    // ── 4. Aggregate counts ───────────────────────────────────────────────────
    const total    = authUsers.length
    const active   = enriched.filter(p => p.subscription_status === 'active').length
    const trialing = enriched.filter(p => p.subscription_status === 'trialing').length
    const pastDue  = enriched.filter(p => p.subscription_status === 'past_due').length
    const canceled = enriched.filter(p => p.subscription_status === 'canceled').length
    const noPlan   = total - active - trialing - pastDue - canceled

    const monthly  = enriched.filter(p => p.subscription_plan === 'monthly'  && ['active','trialing'].includes(p.subscription_status)).length
    const annual   = enriched.filter(p => p.subscription_plan === 'annual'   && ['active','trialing'].includes(p.subscription_status)).length
    const lifetime = enriched.filter(p => p.subscription_plan === 'lifetime' && p.subscription_status === 'active').length

    const mrr = (monthly * 20) + (annual * (200 / 12))
    const arr = mrr * 12

    // ── 5. Activity (DAU/WAU/MAU) ─────────────────────────────────────────────
    const now   = new Date()
    const day1  = new Date(now.getTime() -  1 * 86400000).toISOString()
    const day7  = new Date(now.getTime() -  7 * 86400000).toISOString()
    const day30 = new Date(now.getTime() - 30 * 86400000).toISOString()
    const dau   = authUsers.filter(u => u.last_sign_in_at && u.last_sign_in_at > day1).length
    const wau   = authUsers.filter(u => u.last_sign_in_at && u.last_sign_in_at > day7).length
    const mau   = authUsers.filter(u => u.last_sign_in_at && u.last_sign_in_at > day30).length

    // ── 6. Sign-ups by week (last 12 weeks) ───────────────────────────────────
    const weeklySignups = Array.from({ length: 12 }, (_, i) => {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - (11 - i) * 7 - now.getDay())
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23,59,59,999)
      const count = authUsers.filter(u => { const d = new Date(u.created_at); return d >= weekStart && d <= weekEnd }).length
      const label = `${weekStart.getDate().toString().padStart(2,'0')}/${(weekStart.getMonth()+1).toString().padStart(2,'0')}`
      return { week: label, count }
    })

    // ── 7. Sign-ups by month (last 6 months) ──────────────────────────────────
    const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    const monthlySignups = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      const count = authUsers.filter(u => {
        const ud = new Date(u.created_at)
        return ud.getFullYear() === d.getFullYear() && ud.getMonth() === d.getMonth()
      }).length
      return { month: MONTHS[d.getMonth()], count }
    })

    // ── 8. Upcoming renewals (next 30 days) ───────────────────────────────────
    const in30 = new Date(now.getTime() + 30 * 86400000)
    const upcoming = enriched
      .filter(p => p.subscription_current_period_end && ['active','trialing'].includes(p.subscription_status))
      .filter(p => { const d = new Date(p.subscription_current_period_end!); return d >= now && d <= in30 })
      .sort((a, b) => new Date(a.subscription_current_period_end!).getTime() - new Date(b.subscription_current_period_end!).getTime())
      .map(p => ({ email: p.email, plan: p.subscription_plan, status: p.subscription_status, period_end: p.subscription_current_period_end }))

    // ── 9. Recent sign-ups (last 20) ──────────────────────────────────────────
    const recentUsers = [...authUsers]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20)
      .map(u => {
        const p = enriched.find(x => x.id === u.id)
        return {
          email: u.email ?? '', created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null,
          subscription_status: p?.subscription_status ?? 'none',
          subscription_plan: p?.subscription_plan ?? null,
          period_end: p?.subscription_current_period_end ?? null,
        }
      })

    // ── 10. Full subscriber list ──────────────────────────────────────────────
    const subscribers = enriched
      .filter(p => ['active','trialing','past_due'].includes(p.subscription_status))
      .map(p => ({
        email: p.email, plan: p.subscription_plan, status: p.subscription_status,
        period_end: p.subscription_current_period_end, trial_end: p.trial_end,
        created_at: p.created_at, last_sign_in_at: p.last_sign_in_at,
        stripe_customer_id: p.stripe_customer_id,
      }))

    return json({
      summary: { total, active, trialing, pastDue, canceled, noPlan, monthly, annual, lifetime, mrr, arr, dau, wau, mau },
      weeklySignups, monthlySignups, upcoming, recentUsers, subscribers,
      generatedAt: new Date().toISOString(),
    })

  } catch (err: unknown) {
    console.error('[admin-stats]', err)
    return json({ error: String(err) }, 500)
  }
})
