// ─── Admin Access ─────────────────────────────────────────────────────────────
// Admin role is stored in Supabase app_metadata (server-controlled only —
// users cannot modify their own app_metadata, unlike user_metadata).
//
// To grant admin access, run in the Supabase SQL editor:
//   UPDATE auth.users
//   SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
//   WHERE email = 'admin@example.com';

import type { User } from '@supabase/supabase-js'

// Emails that always have admin access regardless of Supabase app_metadata.
// Used as a fallback when VITE_ADMIN_EMAIL is not set in the deployment env.
const ADMIN_EMAILS: string[] = [
  'betterworkwithai@gmail.com',
  'gabiaureli2@hotmail.com',
  'gabriel.aureli.araujo@gmail.com',
  'suporte@luxorpro.com.br',
]

export const isAdmin = (user?: User | null): boolean => {
  if (!user) return false
  if (user.app_metadata?.role === 'admin') return true
  const envEmail = import.meta.env.VITE_ADMIN_EMAIL as string | undefined
  if (envEmail && user.email === envEmail) return true
  if (user.email && ADMIN_EMAILS.includes(user.email)) return true
  return false
}
