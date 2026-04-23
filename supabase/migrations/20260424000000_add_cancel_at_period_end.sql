-- Track whether the user has scheduled their subscription to cancel at period end.
-- Written by the cancel-subscription edge function; read by the frontend hook.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;
