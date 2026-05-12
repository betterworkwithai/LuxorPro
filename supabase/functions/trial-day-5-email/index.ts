// ─── Edge Function: trial-day-5-email ───────────────────────────────────────
// Cron-friendly worker that finds users on trial day 5 of 7, computes a
// personalized "pirâmide patrimonial" snapshot from their stored investments,
// and emails them via Resend. Idempotent: marks trial_day5_email_sent_at on
// the profile so re-runs of the same day don't double-send.
//
// Triggering:
//   • Recommended: schedule via Supabase's pg_cron extension (or external
//     daily cron) hitting `/functions/v1/trial-day-5-email` with the
//     `Authorization: Bearer <CRON_SECRET>` header.
//   • For manual/dry-run testing, set `?dryRun=1` — finds eligible users
//     and renders the email body but doesn't send or stamp the profile.
//
// Required env vars (in Supabase Dashboard → Edge Function secrets):
//   • SUPABASE_URL                — auto-injected
//   • SUPABASE_SERVICE_ROLE_KEY   — auto-injected
//   • RESEND_API_KEY              — Resend API key (https://resend.com)
//   • RESEND_FROM_EMAIL           — e.g. "Luxor Pro <suporte@luxorpro.com.br>"
//   • CRON_SECRET                 — shared secret in Authorization header
// ────────────────────────────────────────────────────────────────────────────
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ── BR wealth tiers (same brackets the in-app pyramid shows) ───────────────
const TIERS = [
  { key: 'topo',         name: 'Topo',          bracket: 'R$ 10M+',         percentile: '0,1%', min: 10_000_000, max: Infinity },
  { key: 'soberania',    name: 'Soberania',     bracket: 'R$ 3M – 10M',     percentile: '1%',   min:  3_000_000, max: 10_000_000 },
  { key: 'independencia',name: 'Independência', bracket: 'R$ 1M – 3M',      percentile: '5%',   min:  1_000_000, max:  3_000_000 },
  { key: 'conforto',     name: 'Conforto',      bracket: 'R$ 300k – 1M',    percentile: '15%',  min:    300_000, max:  1_000_000 },
  { key: 'estabilidade', name: 'Estabilidade',  bracket: 'R$ 50k – 300k',   percentile: '50%',  min:     50_000, max:    300_000 },
  { key: 'base',         name: 'Base',          bracket: '< R$ 50k',        percentile: '100%', min:          0, max:     50_000 },
] as const

function tierFor(patrim: number) {
  return TIERS.find(t => patrim >= t.min && patrim < t.max) ?? TIERS[TIERS.length - 1]
}

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

interface Investment {
  quantity: number
  currentPrice: number
  currency?: 'BRL' | 'USD' | 'EUR'
  location?: 'onshore' | 'offshore' | 'physical-re'
}

// ── HTML email template ────────────────────────────────────────────────────
function renderEmail(opts: {
  name: string
  patrim: number
  tier: typeof TIERS[number]
  nextTier: typeof TIERS[number] | null
  distanceToNext: number
  daysLeft: number
  appUrl: string
}): string {
  const { name, patrim, tier, nextTier, distanceToNext, daysLeft, appUrl } = opts
  const firstName = (name || '').trim().split(/\s+/)[0] || 'investidor'

  const tierIndex = TIERS.findIndex(t => t.key === tier.key)
  const tierRows = TIERS.map((t, i) => {
    const isApex    = i === 0
    const isCurrent = i === tierIndex
    const bg     = isApex    ? '#3b2410'
                 : isCurrent ? '#0f2530'
                 : '#0f0f15'
    const border = isApex    ? '#ff9a3f'
                 : isCurrent ? '#00d4ff'
                 : '#1e1e30'
    const fg     = isApex    ? '#ffc857'
                 : isCurrent ? '#00d4ff'
                 :             '#8888aa'
    return `
      <tr>
        <td style="padding:6px 10px;background:${bg};border-left:3px solid ${border};border-radius:4px;">
          <div style="font:600 13px Inter,Arial,sans-serif;color:${fg};">
            ${isApex ? '⭐ ' : ''}${t.name}${isCurrent ? ' · você está aqui' : ''}
          </div>
          <div style="font:400 11px Inter,Arial,sans-serif;color:#8888aa;">
            ${t.percentile} da população · ${t.bracket}
          </div>
        </td>
      </tr>
      <tr><td style="height:4px;"></td></tr>`
  }).join('')

  const distanceLine = nextTier
    ? `Faltam <strong style="color:#ffc857;">${brl(distanceToNext)}</strong> para você alcançar <strong style="color:#e8e8f0;">${nextTier.name}</strong> (top ${nextTier.percentile}).`
    : `Você já está no topo da pirâmide — parabéns.`

  return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px 12px;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#e8e8f0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#0f1018;border:1px solid #1e1e30;border-radius:16px;overflow:hidden;">
    <tr><td style="height:4px;background:linear-gradient(90deg,#ff7a00,#ff4500);"></td></tr>
    <tr><td style="padding:28px 28px 8px;">
      <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#ff7a00;">Luxor Pro · trial dia 5 de 7</p>
      <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#e8e8f0;line-height:1.3;">
        ${firstName}, faltam ${daysLeft} dias do seu trial
      </h1>
      <p style="margin:0;font-size:14px;color:#8888aa;line-height:1.5;">
        Eis o que descobrimos sobre o seu patrimônio até agora.
      </p>
    </td></tr>

    <tr><td style="padding:8px 28px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#131426;border:1px solid #1e1e30;border-radius:12px;">
        <tr><td style="padding:20px 22px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#55556a;">Patrimônio total</p>
          <p style="margin:6px 0 0;font-size:36px;font-weight:700;letter-spacing:-0.5px;color:#e8e8f0;font-variant-numeric:tabular-nums;">
            ${brl(patrim)}
          </p>
          <p style="margin:8px 0 0;font-size:13px;color:#8888aa;line-height:1.5;">
            Você está no <strong style="color:#00d4ff;">${tier.name}</strong> · ${tier.percentile} da população adulta brasileira.
          </p>
          <p style="margin:6px 0 0;font-size:13px;color:#8888aa;line-height:1.5;">${distanceLine}</p>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:8px 28px 16px;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#55556a;">Pirâmide patrimonial · Brasil</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tierRows}</table>
      <p style="margin:8px 0 0;font-size:10px;color:#55556a;line-height:1.5;">
        Estimativas: IBGE PNAD 2023 · WID.world BR 2022 · Credit Suisse 2023 · IRPF 2023.
      </p>
    </td></tr>

    <tr><td style="padding:8px 28px 28px;">
      <p style="margin:0 0 14px;font-size:13px;color:#8888aa;line-height:1.6;">
        O Luxor Pro mostra o caminho exato pra subir de andar — alocação por perfil de suitability,
        rentabilidade vs CDI, dividendos previstos, e mais. Tudo num só lugar.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr><td>
          <a href="${appUrl}" style="display:inline-block;padding:12px 22px;background:#ff7a00;color:#0a0a0f;font-weight:700;font-size:14px;border-radius:10px;text-decoration:none;">
            Continuar para o painel
          </a>
        </td></tr>
      </table>
      <p style="margin:14px 0 0;font-size:11px;color:#55556a;line-height:1.5;">
        Seu trial converte automaticamente para o plano escolhido em ${daysLeft} dias.
        Cancele quando quiser nas Configurações.
      </p>
    </td></tr>

    <tr><td style="padding:16px 28px;border-top:1px solid #1e1e30;background:#0a0a0f;text-align:center;">
      <p style="margin:0;font-size:11px;color:#55556a;">
        Luxor Pro · <a href="https://www.luxorpro.com.br" style="color:#8888aa;text-decoration:none;">www.luxorpro.com.br</a>
      </p>
    </td></tr>
  </table>
</body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── Auth: shared cron secret ───────────────────────────────────────────
    const cronSecret = Deno.env.get('CRON_SECRET')
    const authHeader = req.headers.get('Authorization') ?? ''
    if (cronSecret) {
      const token = authHeader.replace('Bearer ', '').trim()
      if (token !== cronSecret) return json({ error: 'Unauthorized' }, 401)
    }

    const url    = new URL(req.url)
    const dryRun = url.searchParams.get('dryRun') === '1'

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendKey      = Deno.env.get('RESEND_API_KEY')
    const fromEmail      = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Luxor Pro <suporte@luxorpro.com.br>'

    if (!resendKey && !dryRun) {
      return json({ error: 'RESEND_API_KEY not configured' }, 500)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // ── Find candidates: trialing + day 5 of 7 + not yet emailed ───────────
    // Trial day 5 = trial ends in ~2 days (since trial is 7 days). We give a
    // 24-hour window so the daily cron can catch them regardless of exact
    // signup hour. trial_end is timestamptz.
    const now      = new Date()
    const lowerEnd = new Date(now.getTime() + 1.5 * 86400000).toISOString()
    const upperEnd = new Date(now.getTime() + 2.5 * 86400000).toISOString()

    const { data: candidates, error: qErr } = await supabase
      .from('profiles')
      .select('id, email, subscription_status, trial_end, trial_day5_email_sent_at')
      .eq('subscription_status', 'trialing')
      .is('trial_day5_email_sent_at', null)
      .gte('trial_end', lowerEnd)
      .lte('trial_end', upperEnd)

    if (qErr) return json({ error: qErr.message }, 500)
    if (!candidates || candidates.length === 0) {
      return json({ ok: true, eligible: 0, sent: 0, dryRun })
    }

    const results: Array<{ id: string; email: string; sent: boolean; reason?: string }> = []

    for (const p of candidates) {
      try {
        if (!p.email) {
          results.push({ id: p.id, email: '<no-email>', sent: false, reason: 'no email on profile' })
          continue
        }

        // ── Fetch user investments from luxor_investments JSONB ──────────────
        const { data: invRows, error: invErr } = await supabase
          .from('luxor_investments')
          .select('data')
          .eq('user_id', p.id)
        if (invErr) {
          results.push({ id: p.id, email: p.email, sent: false, reason: 'invFetch: ' + invErr.message })
          continue
        }

        // ── Fetch user settings (for FX rates + display name) ────────────────
        const { data: settingsRow } = await supabase
          .from('luxor_settings')
          .select('data')
          .eq('user_id', p.id)
          .maybeSingle()
        const settings = (settingsRow?.data ?? {}) as { usdToBrl?: number; eurToBrl?: number; name?: string }
        const usd = settings.usdToBrl ?? 5
        const eur = settings.eurToBrl ?? 5.9

        // ── Compute patrim total in BRL ──────────────────────────────────────
        let patrim = 0
        for (const r of invRows ?? []) {
          const i = (r as { data: Investment }).data
          if (!i || i.location === 'physical-re') continue
          const v = (i.quantity ?? 0) * (i.currentPrice ?? 0)
          const cur = i.currency ?? 'BRL'
          patrim += cur === 'USD' ? v * usd : cur === 'EUR' ? v * eur : v
        }

        const tier      = tierFor(patrim)
        const tierIdx   = TIERS.findIndex(t => t.key === tier.key)
        const nextTier  = tierIdx > 0 ? TIERS[tierIdx - 1] : null
        const distance  = nextTier ? Math.max(0, nextTier.min - patrim) : 0
        const daysLeft  = Math.max(0, Math.round((new Date(p.trial_end).getTime() - now.getTime()) / 86400000))

        const html = renderEmail({
          name: settings.name ?? '',
          patrim, tier, nextTier, distanceToNext: distance, daysLeft,
          appUrl: 'https://www.luxorpro.com.br/app/',
        })
        const subject = `Faltam ${daysLeft} dias — você está no andar ${tier.name} da pirâmide`

        if (dryRun) {
          results.push({ id: p.id, email: p.email, sent: false, reason: `dryRun · patrim=${patrim} tier=${tier.name}` })
          continue
        }

        // ── Send via Resend ──────────────────────────────────────────────────
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: fromEmail,
            to: [p.email],
            subject,
            html,
            tags: [{ name: 'campaign', value: 'trial_day5' }],
          }),
        })
        if (!resp.ok) {
          const errText = await resp.text()
          results.push({ id: p.id, email: p.email, sent: false, reason: `resend: ${resp.status} ${errText}` })
          continue
        }

        // ── Stamp profile so we don't re-send ─────────────────────────────────
        const { error: stampErr } = await supabase
          .from('profiles')
          .update({ trial_day5_email_sent_at: new Date().toISOString() })
          .eq('id', p.id)
        if (stampErr) {
          // Email was sent but stamp failed — log so an admin can dedupe manually
          results.push({ id: p.id, email: p.email, sent: true, reason: 'sent OK but stamp failed: ' + stampErr.message })
          continue
        }

        results.push({ id: p.id, email: p.email, sent: true, reason: `tier=${tier.name} patrim=${patrim}` })
      } catch (e) {
        results.push({ id: p.id, email: p.email ?? '<no-email>', sent: false, reason: (e as Error).message })
      }
    }

    const sentCount = results.filter(r => r.sent).length
    return json({ ok: true, eligible: candidates.length, sent: sentCount, dryRun, results })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
