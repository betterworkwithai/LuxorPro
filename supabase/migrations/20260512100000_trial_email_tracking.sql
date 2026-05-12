-- ── Trial-cadence email tracking ─────────────────────────────────────────
-- Records when we sent the "day 5 of 7 — here's your pyramid snapshot"
-- email so the cron job never double-sends. Future cadence emails can
-- follow the same pattern (trial_day1_email_sent_at, day7, etc.).

alter table public.profiles
  add column if not exists trial_day5_email_sent_at timestamptz;

-- Partial index so the cron query (find trialing users who haven't been
-- emailed yet) is a fast index-only scan.
create index if not exists profiles_trial_day5_pending_idx
  on public.profiles(trial_end)
  where subscription_status = 'trialing'
    and trial_day5_email_sent_at is null;
