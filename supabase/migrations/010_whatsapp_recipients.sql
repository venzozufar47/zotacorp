-- Admin-editable list of WhatsApp recipients for attendance notifications.
--
-- Keeping this in its own table (vs. extending attendance_settings) leaves
-- room to grow — future columns could include per-event filters (in only /
-- out only), enabled flag, or label-based routing. For now we store just
-- the phone + label.
--
-- Phone format: E.164 without the leading `+` (e.g. "6285752153246").
-- That matches the format Fonnte's API expects in its `target` field.

create table if not exists public.whatsapp_notification_recipients (
  id         uuid primary key default gen_random_uuid(),
  label      text not null default '',
  phone_e164 text not null check (phone_e164 ~ '^[1-9][0-9]{6,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wa_recipients_phone
  on public.whatsapp_notification_recipients(phone_e164);

alter table public.whatsapp_notification_recipients enable row level security;

-- Server actions run as the caller. Only admins read/write; the server-side
-- notify path also calls this table and relies on the admin policy because
-- `after()` executes in the request's auth scope (which is an admin when
-- the admin themselves triggers a checkout — but check-ins from employees
-- wouldn't see the rows under RLS). We explicitly allow *any* authenticated
-- user to SELECT so the notify path always works; writes stay admin-only.
drop policy if exists "wa_recipients_read_authenticated" on public.whatsapp_notification_recipients;
drop policy if exists "wa_recipients_admin_write"       on public.whatsapp_notification_recipients;

create policy "wa_recipients_read_authenticated"
  on public.whatsapp_notification_recipients for select
  to authenticated using (true);

create policy "wa_recipients_admin_write"
  on public.whatsapp_notification_recipients for all
  to authenticated
  using      (public.is_admin())
  with check (public.is_admin());

create or replace function public.touch_wa_recipients_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_wa_recipients_touch on public.whatsapp_notification_recipients;
create trigger trg_wa_recipients_touch
  before update on public.whatsapp_notification_recipients
  for each row execute function public.touch_wa_recipients_updated_at();
