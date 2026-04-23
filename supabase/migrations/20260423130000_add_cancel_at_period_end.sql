-- Add cancel_at_period_end to profiles
-- Written by stripe-webhook when user schedules cancellation via billing portal

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;
