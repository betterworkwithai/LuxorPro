-- WhatsApp bot integration tables

-- Maps a WhatsApp phone number to a Luxor Pro user account.
-- The user links their number in Settings; we send a 6-digit code to verify.
create table if not exists whatsapp_links (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        references auth.users(id) on delete cascade not null,
  phone_e164        text        not null unique, -- e.g. "+5511999999999"
  verified          boolean     not null default false,
  verify_code       text,
  verify_expires_at timestamptz,
  created_at        timestamptz not null default now()
);

alter table whatsapp_links enable row level security;

create policy "users manage own whatsapp links"
  on whatsapp_links for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Tracks per-phone conversation state for the bot (idle vs. awaiting confirmation).
-- No RLS needed — only touched server-side via service role.
create table if not exists whatsapp_sessions (
  phone_e164   text        primary key,
  state        text        not null default 'idle', -- idle | awaiting_confirm
  pending_json jsonb,       -- partial parsed transaction awaiting user "sim"
  updated_at   timestamptz not null default now()
);

-- Index so the webhook can find a user by phone quickly
create index if not exists whatsapp_links_phone_idx on whatsapp_links (phone_e164);
create index if not exists whatsapp_links_user_idx  on whatsapp_links (user_id);
