// ─── Admin Access ─────────────────────────────────────────────────────────────
// Admin role is stored in Supabase app_metadata (server-controlled only —
// users cannot modify their own app_metadata, unlike user_metadata).
//
// To grant admin access, run in the Supabase SQL editor:
//   UPDATE auth.users
//   SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
//   WHERE email = 'admin@example.com';

import type { User } from '@supabase/supabase-js'

export const isAdmin = (user?: User | null): boolean =>
  user?.app_metadata?.role === 'admin'
