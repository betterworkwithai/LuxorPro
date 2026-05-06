-- Support tickets: users submit bug reports / questions; admins manage them.

create table if not exists public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  user_email      text,                                  -- snapshot for fast admin display
  title           text not null check (char_length(title) between 3 and 200),
  description     text not null check (char_length(description) between 10 and 5000),
  severity        text not null default 'medium'
                  check (severity in ('low', 'medium', 'high', 'critical')),
  status          text not null default 'open'
                  check (status in ('open', 'in_progress', 'resolved', 'closed')),
  category        text default 'bug'
                  check (category in ('bug', 'question', 'feature', 'other')),
  attachment_url  text,                                  -- optional screenshot data URL or storage URL
  user_agent      text,                                  -- captured client-side for repro context
  app_version     text,
  admin_notes     text,                                  -- internal notes (admins only)
  admin_response  text,                                  -- public response shown to user
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists support_tickets_user_idx     on public.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_idx   on public.support_tickets (status, created_at desc);

-- Trigger to bump updated_at on every change
create or replace function public.support_tickets_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.support_tickets_touch_updated_at();

-- Row Level Security
alter table public.support_tickets enable row level security;

-- Users can SELECT their own tickets
do $$ begin
  create policy "users_read_own_tickets"
    on public.support_tickets for select
    using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

-- Users can INSERT tickets for themselves
do $$ begin
  create policy "users_create_own_tickets"
    on public.support_tickets for insert
    with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

-- Users can UPDATE their own tickets BUT NOT admin fields
-- (admin_notes / admin_response / status are reserved — enforced by the
-- column allowlist on the client + this policy stops privilege escalation)
do $$ begin
  create policy "users_update_own_tickets_limited"
    on public.support_tickets for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

-- Admins can SELECT/UPDATE/DELETE every ticket. Admin emails are hard-coded
-- to match src/lib/admin.ts. If you change ADMIN_EMAILS there, update this list.
do $$ begin
  create policy "admins_full_access"
    on public.support_tickets for all
    using (
      lower(coalesce((auth.jwt() ->> 'email'), '')) in (
        'gabiaureli2@hotmail.com',
        'gabriel.aureli.araujo@gmail.com',
        'betterworkwithai@gmail.com'
      )
    )
    with check (
      lower(coalesce((auth.jwt() ->> 'email'), '')) in (
        'gabiaureli2@hotmail.com',
        'gabriel.aureli.araujo@gmail.com',
        'betterworkwithai@gmail.com'
      )
    );
exception when duplicate_object then null;
end $$;
