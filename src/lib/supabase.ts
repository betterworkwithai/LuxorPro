// Supabase client — uses the host project's shared client (auth + DB)
import { supabase } from '@/integrations/supabase/client'

export { supabase }
export const SUPABASE_CONFIGURED = true

export type AuthUser = {
  id: string
  email: string | undefined
}
