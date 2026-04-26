// ─── Admin Access ─────────────────────────────────────────────────────────────
// Emails in this list:
//   • bypass the subscription gate (full app access without an active plan)
//   • can access the /app/admin route

export const ADMIN_EMAILS: string[] = [
  'gabiaureli2@hotmail.com',
  'gabriel.aureli.araujo@gmail.com',
  'betterworkwithai@gmail.com',
]

export const isAdmin = (email?: string | null): boolean =>
  !!email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes((email ?? '').toLowerCase())
