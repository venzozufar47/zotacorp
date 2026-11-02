-- Server-owned checkout attempts: clients cannot create proof or backdate time.
create table public.attendance_checkout_push_checks (
  attendance_id uuid primary key references public.attendance_logs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  token_hash text unique,
  token_expires_at timestamptz,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  last_sent_at timestamptz,
  verified_at timestamptz
);
create index attendance_checkout_push_checks_user_idx on public.attendance_checkout_push_checks(user_id);
alter table public.attendance_checkout_push_checks enable row level security;
revoke all on public.attendance_checkout_push_checks from anon, authenticated;
grant all on public.attendance_checkout_push_checks to service_role;
