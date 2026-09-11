-- Infra for the Fonnte → Web Push migration:
--   1. `profiles.push_notification_exempt` — admin override so a specific
--      employee can still check in without an active push subscription
--      (e.g. device/browser genuinely doesn't support Web Push).
--   2. `yeobo_booth_reminder_recipients.user_id` — reminder recipients move
--      from a raw phone-number list to app accounts (push needs a
--      subscribed user, not a phone number). Nullable: legacy rows keep
--      their phone_e164 for display until an admin reassigns them to an
--      account; the send path skips rows with no user_id.

alter table public.profiles
  add column if not exists push_notification_exempt boolean not null default false;

comment on column public.profiles.push_notification_exempt is
  'Admin override: allows this employee to check in without an active push subscription. For devices/browsers that genuinely cannot support Web Push.';

alter table public.yeobo_booth_reminder_recipients
  add column if not exists user_id uuid references auth.users(id) on delete set null;

comment on column public.yeobo_booth_reminder_recipients.user_id is
  'App account to push-notify. Null on legacy phone-only rows (pre-push-migration) — those are skipped on send until an admin reassigns them to an account via /admin/yeobo-booth/settings.';
