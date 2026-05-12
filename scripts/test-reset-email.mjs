// Diagnostic: tries to fire a password-reset email through the configured
// Supabase project and reports what the API actually says. Run with:
//   node scripts/test-reset-email.mjs <your-email>
//
// Reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from .env.local
// (project root). Never prints the key. Result tells you whether the
// problem is API-level (config/auth) or delivery-level (SMTP/spam).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
const get = (k) => {
  const m = env.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))
  return m?.[1]
}
const url = get('VITE_SUPABASE_URL')
const key = get('VITE_SUPABASE_PUBLISHABLE_KEY')
if (!url || !key) { console.error('Missing env vars in .env.local'); process.exit(1) }

const email = process.argv[2]
if (!email) { console.error('Usage: node test-reset-email.mjs <email>'); process.exit(1) }

console.log(`Testing password reset for: ${email}`)
console.log(`Supabase URL: ${url}`)
console.log(`Using anon key: ${key.slice(0, 8)}...${key.slice(-4)} (length ${key.length})`)

const redirectTo = 'https://www.luxorpro.com.br/reset-password'
const start = Date.now()
const resp = await fetch(`${url}/auth/v1/recover`, {
  method: 'POST',
  headers: {
    'apikey':        key,
    'Authorization': `Bearer ${key}`,
    'Content-Type':  'application/json',
  },
  body: JSON.stringify({ email, options: { redirectTo } }),
})
const elapsed = Date.now() - start
const text = await resp.text()
console.log(`\nStatus: ${resp.status} (${elapsed}ms)`)
console.log(`Body:   ${text || '(empty)'}`)
console.log(`Headers of interest:`)
for (const h of ['x-ratelimit-remaining','x-ratelimit-reset','retry-after','x-sb-error-code']) {
  const v = resp.headers.get(h)
  if (v) console.log(`  ${h}: ${v}`)
}

if (resp.status === 200) {
  console.log(`\n✓ API accepted the reset request. If no email arrives:`)
  console.log(`  · Check spam/promotions folder`)
  console.log(`  · Wait — Supabase's built-in SMTP has aggressive rate limits`)
  console.log(`  · Configure a custom SMTP (Resend) in Supabase Dashboard → Auth → SMTP Settings`)
} else if (resp.status === 429) {
  console.log(`\n✗ Rate limited. Default Supabase SMTP is ~4 emails/hour on free tier.`)
  console.log(`  Configure custom SMTP (Resend) or wait until reset.`)
} else {
  console.log(`\n✗ API error — likely a config issue (redirect URL not whitelisted, project secrets, etc.)`)
}
