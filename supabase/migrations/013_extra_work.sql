-- Per-employee feature flag for the "extra work" tracker. Defaults to
-- false so the button stays hidden until admin opts each user in.
alter table public.profiles
  add column if not exists extra_work_enabled boolean not null default false;

-- Each entry is one piece of work the employee did outside the normal
-- attendance flow on a given day. `kind` is intentionally a free-form
-- text column rather than an enum so we can grow the dropdown without
-- a schema migration; the client constrains the choices.
create table if not exists public.extra_work_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  date       date not null,
  kind       text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_extra_work_logs_user_date
  on public.extra_work_logs(user_id, date);

alter table public.extra_work_logs enable row level security;

drop policy if exists "extra_work_self_read" on public.extra_work_logs;
drop policy if exists "extra_work_admin_read" on public.extra_work_logs;
drop policy if exists "extra_work_self_write" on public.extra_work_logs;
drop policy if exists "extra_work_self_delete" on public.extra_work_logs;
drop policy if exists "extra_work_admin_write" on public.extra_work_logs;

create policy "extra_work_self_read"
  on public.extra_work_logs for select
  to authenticated using (user_id = auth.uid());
create policy "extra_work_self_write"
  on public.extra_work_logs for insert
  to authenticated with check (user_id = auth.uid());
create policy "extra_work_self_delete"
  on public.extra_work_logs for delete
  to authenticated using (user_id = auth.uid());

create policy "extra_work_admin_read"
  on public.extra_work_logs for select
  to authenticated using (public.is_admin());
create policy "extra_work_admin_write"
  on public.extra_work_logs for all
  to authenticated using (public.is_admin()) with check (public.is_admin());
