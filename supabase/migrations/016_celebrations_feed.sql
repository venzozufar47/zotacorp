-- Celebrations feed: birthdays + work anniversaries + collective messages.
--
-- Three moving parts:
--   1. Dedupe columns on profiles to guarantee at-most-one WA greeting per
--      celebrant per calendar day (mirrors streak_last_milestone pattern).
--   2. celebration_messages table — one row per greeting/reply/broadcast.
--      RLS keeps everyone able to READ the feed, but posting rules enforce
--      the author↔celebrant relationship for each kind.
--   3. profiles_celebrations_public view — masks the birth YEAR so coworker
--      feeds never leak age information (only MM-DD is exposed).
--
-- Event-window enforcement (can only post while celebration is "active")
-- lives in the server action, not in RLS, so the window can evolve without
-- a migration.

-- 1. Dedupe columns
alter table public.profiles
  add column if not exists birthday_last_greeted date,
  add column if not exists anniversary_last_greeted date;

-- 2. Collective messages
create table if not exists public.celebration_messages (
  id           uuid primary key default gen_random_uuid(),
  celebrant_id uuid not null references public.profiles(id) on delete cascade,
  author_id    uuid not null references public.profiles(id) on delete cascade,
  event_type   text not null check (event_type in ('birthday','anniversary')),
  event_year   int  not null,
  kind         text not null check (kind in ('greeting','reply','broadcast')),
  parent_id    uuid references public.celebration_messages(id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 500),
  created_at   timestamptz not null default now()
);

create index if not exists celebration_messages_celebrant_event_idx
  on public.celebration_messages (celebrant_id, event_type, event_year, created_at desc);

-- 3. Masked coworker-visible view
create or replace view public.profiles_celebrations_public as
select
  id,
  full_name,
  to_char(date_of_birth, 'MM-DD') as dob_month_day,
  first_day_of_work
from public.profiles
where date_of_birth is not null or first_day_of_work is not null;

grant select on public.profiles_celebrations_public to authenticated;

-- 4. RLS for celebration_messages
alter table public.celebration_messages enable row level security;

drop policy if exists celebration_messages_select_all on public.celebration_messages;
create policy celebration_messages_select_all
  on public.celebration_messages for select to authenticated using (true);

drop policy if exists celebration_messages_insert_greeting on public.celebration_messages;
create policy celebration_messages_insert_greeting
  on public.celebration_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and kind = 'greeting'
    and parent_id is null
    and celebrant_id <> auth.uid()
  );

drop policy if exists celebration_messages_insert_broadcast on public.celebration_messages;
create policy celebration_messages_insert_broadcast
  on public.celebration_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and kind = 'broadcast'
    and parent_id is null
    and celebrant_id = auth.uid()
  );

drop policy if exists celebration_messages_insert_reply on public.celebration_messages;
create policy celebration_messages_insert_reply
  on public.celebration_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and kind = 'reply'
    and parent_id is not null
    and celebrant_id = auth.uid()
  );

drop policy if exists celebration_messages_delete_own on public.celebration_messages;
create policy celebration_messages_delete_own
  on public.celebration_messages for delete to authenticated
  using (author_id = auth.uid());
