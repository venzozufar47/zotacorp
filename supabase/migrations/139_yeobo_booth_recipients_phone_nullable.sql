-- phone_e164 is no longer required now that reminder recipients are
-- assigned by app account (user_id) instead of a typed phone number.
-- The existing CHECK constraint already passes on NULL (regex match
-- against NULL is NULL, not FALSE), so dropping NOT NULL is sufficient.
alter table public.yeobo_booth_reminder_recipients
  alter column phone_e164 drop not null;
