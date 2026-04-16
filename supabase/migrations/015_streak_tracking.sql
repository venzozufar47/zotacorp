-- Streak tracking: persisted personal-best and last-celebrated milestone.
--
-- The source of truth for streak *length* stays `attendance_logs` (derivable
-- by walking backwards through scheduled workdays). What we cache here are
-- two cheap scalars that would otherwise force a full-history scan every
-- render:
--
--  * streak_personal_best — ratchet. Only writes when a new high is observed
--    by the checkIn path. Admin-read only.
--  * streak_last_milestone — guards against double WA pings. Updated in the
--    same transaction as the congratulatory message so re-opening the
--    dashboard on milestone day never re-notifies.
--
-- Neither value is authoritative for display; both are convenience caches.

alter table public.profiles
  add column if not exists streak_personal_best integer not null default 0,
  add column if not exists streak_last_milestone integer not null default 0;
