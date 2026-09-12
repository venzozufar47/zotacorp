-- Visibility into push sends: every sendPushToUser/sendPushToAdmins call
-- writes one row here, whether it delivered, found nobody to target, or
-- couldn't even attempt (VAPID not configured). Without this, a silent
-- failure (missing VAPID key, zero subscribed recipients, wrong-account
-- subscription) is invisible except by grepping server logs.
create table if not exists public.push_send_logs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  configured boolean not null default true,
  targeted_count int not null default 0,
  delivered_count int not null default 0,
  pruned_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists push_send_logs_created_at_idx
  on public.push_send_logs (created_at desc);

alter table public.push_send_logs enable row level security;

-- Admin-only read (written via service-role client, which bypasses RLS).
drop policy if exists push_send_logs_admin_read on public.push_send_logs;
create policy push_send_logs_admin_read on public.push_send_logs
  for select using (is_admin());

comment on table public.push_send_logs is
  'One row per sendPushToUser/sendPushToAdmins call: how many devices were targeted, how many delivered, how many pruned as stale, and whether VAPID was even configured. Surfaced in /admin/settings so push failures are visible instead of silent.';
