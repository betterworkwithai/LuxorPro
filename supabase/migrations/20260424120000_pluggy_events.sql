-- ─── Pluggy webhook events table ──────────────────────────────────────────────
--
-- Stores incoming Pluggy webhook events so clients can react via Supabase Realtime.
-- The webhook edge function inserts here; the browser listens for INSERT events
-- and triggers a sync automatically.

create table if not exists pluggy_events (
  id         uuid        default gen_random_uuid() primary key,
  user_id    uuid        references auth.users(id) on delete cascade not null,
  item_id    text        not null,
  event_type text        not null,   -- 'item/created' | 'item/updated' | 'item/error'
  event_id   text,                   -- Pluggy's deduplication ID
  payload    jsonb,                  -- full raw event body
  processed  boolean     default false,
  created_at timestamptz default now()
);

-- Users can only read their own events
alter table pluggy_events enable row level security;

create policy "users_read_own_events"
  on pluggy_events for select
  using (auth.uid() = user_id);

-- Edge functions (service role) insert events
create policy "service_role_insert"
  on pluggy_events for insert
  with check (true);

-- Index for realtime queries
create index on pluggy_events (user_id, created_at desc);

-- Enable Realtime so clients receive the INSERT immediately
alter publication supabase_realtime add table pluggy_events;
