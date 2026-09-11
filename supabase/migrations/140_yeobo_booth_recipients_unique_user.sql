-- Prevent adding the same account as a reminder recipient twice.
-- Partial (user_id is not null) so it doesn't conflict with legacy
-- phone-only rows that share no user_id.
create unique index if not exists yeobo_booth_reminder_recipients_user_id_uq
  on public.yeobo_booth_reminder_recipients (user_id)
  where user_id is not null;
