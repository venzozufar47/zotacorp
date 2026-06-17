-- Web Push subscriptions for browser/PWA notifications (e.g. "slip gaji
-- terbit"). One row per browser/device endpoint; a user can have several
-- (phone + laptop). The endpoint is unique — re-subscribing the same
-- browser upserts rather than duplicating.
--
-- Keys (p256dh, auth) come from the browser's PushSubscription and are
-- needed by the server (web-push) to encrypt the payload. Sending happens
-- server-side with the service-role client, so RLS here only governs the
-- user managing their own rows from the client.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- A user may insert/read/update/delete only their own subscriptions.
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Admins may read (for sends from non-service contexts / debugging). The
-- production sender uses the service-role key which bypasses RLS anyway.
drop policy if exists push_subscriptions_admin_read on public.push_subscriptions;
create policy push_subscriptions_admin_read on public.push_subscriptions
  for select using (is_admin());

comment on table public.push_subscriptions is
  'Web Push endpoints per user/device. Populated by the browser PushManager; consumed server-side by web-push to deliver notifications.';
