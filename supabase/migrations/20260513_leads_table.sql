-- ─── leads table ──────────────────────────────────────────────────
-- Captures emails from public lead-gen surfaces (currently the
-- pirâmide-patrimonial calculator). Insert-only from the anon role;
-- only authenticated admin reads. Email is unique so duplicates from
-- the same visitor land as conflicts we can swallow.
--
-- Apply via:
--   supabase db push
-- or in the SQL editor manually.
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  name        text,
  source      text not null,           -- e.g. 'piramide-calculator'
  metadata    jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- One row per email/source pair. We don't UNIQUE on email alone
-- because the same person might come through different funnels.
create unique index if not exists leads_email_source_idx
  on public.leads (lower(email), source);

alter table public.leads enable row level security;

-- Anon can insert (this is the calculator's lead capture).
drop policy if exists "leads_anon_insert" on public.leads;
create policy "leads_anon_insert"
  on public.leads for insert
  to anon
  with check (true);

-- Authenticated users see nothing — admin reads happen via service
-- role from the dashboard / SQL editor.
drop policy if exists "leads_auth_select_none" on public.leads;
create policy "leads_auth_select_none"
  on public.leads for select
  to authenticated
  using (false);

-- Helpful indexes for ops queries.
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_source_idx     on public.leads (source);
