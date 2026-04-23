-- ─── Subscription Profiles ───────────────────────────────────────────────────
-- Tracks Stripe customer + subscription state per user.
-- Subscription status is written exclusively by the stripe-webhook edge function
-- (service role); users can only read their own row.

CREATE TABLE IF NOT EXISTS public.profiles (
  id                              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id              TEXT        UNIQUE,
  subscription_status             TEXT        NOT NULL DEFAULT 'none',
    -- Possible values: none | trialing | active | past_due | canceled
  subscription_plan               TEXT,
    -- Possible values: monthly | annual | lifetime
  subscription_current_period_end TIMESTAMPTZ,
  trial_end                       TIMESTAMPTZ,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can only SELECT their own row
CREATE POLICY "profiles: users read own"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Service role (edge functions) has unrestricted access
CREATE POLICY "profiles: service role all"
  ON public.profiles
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Index ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON public.profiles (stripe_customer_id);

-- ─── Enable Realtime so the frontend hook can subscribe ───────────────────────
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- ─── Auto-create profile row on user signup ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop trigger first in case it already exists from a prior migration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
