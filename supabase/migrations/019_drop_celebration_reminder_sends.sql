-- Revert of migration 017. The 4×/day WA nudge feature was removed after
-- review — product decided it wasn't needed. Dropping the dedupe table
-- since there's no dispatcher left to write to it.

drop table if exists public.celebration_reminder_sends;
