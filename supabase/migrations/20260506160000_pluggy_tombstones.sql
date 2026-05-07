-- Pluggy tombstones: records the Pluggy IDs of items the user has deleted
-- (manually or via dedup) so future syncs can permanently skip them.
-- Without this, clearing localStorage on a different device would let
-- Pluggy re-create transactions/investments the user already removed.

create table if not exists public.pluggy_tombstones (
  user_id     uuid not null references auth.users(id) on delete cascade,
  pluggy_id   text not null,
  kind        text not null check (kind in ('transaction', 'investment')),
  deleted_at  timestamptz not null default now(),
  primary key (user_id, pluggy_id)
);

create index if not exists pluggy_tombstones_user_idx
  on public.pluggy_tombstones (user_id, deleted_at desc);

alter table public.pluggy_tombstones enable row level security;

do $$ begin
  create policy "users_manage_own_tombstones"
    on public.pluggy_tombstones for all
    using  (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;
