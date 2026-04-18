-- Birthday reminder dedupe table.
--
-- The celebration-reminders cron (see /api/cron/celebration-reminders)
-- fires 4× daily at 09:00/12:00/15:00/18:00 WIB and nudges every
-- coworker who hasn't yet posted a greeting for today's celebrant.
-- Each (recipient, celebrant, event, slot) pair can be claimed at most
-- once — the unique constraint below is the atomic claim. A unique-
-- violation on insert means another concurrent run already sent it;
-- the dispatcher silently skips on that error code.
--
-- `event_type` is constrained to 'birthday' today. Work anniversaries
-- are explicitly out of scope for this reminder flow; the column is
-- kept so loosening the check later stays trivial.

create table public.celebration_reminder_sends (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  celebrant_id  uuid not null references public.profiles(id) on delete cascade,
  event_type    text not null default 'birthday' check (event_type = 'birthday'),
  event_year    int  not null,
  slot_date     date not null,
  slot_hour     int  not null check (slot_hour in (9, 12, 15, 18)),
  sent_at       timestamptz not null default now(),
  unique (recipient_id, celebrant_id, event_type, event_year, slot_date, slot_hour)
);

-- RLS locked: the dispatcher runs via the service-role client and
-- bypasses policies. No employee-facing reads are needed.
alter table public.celebration_reminder_sends enable row level security;
