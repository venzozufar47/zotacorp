-- Exclude investor accounts from profiles_celebrations_public.
-- Investors are managed only on /admin/investors and are NOT employees, so
-- they must not appear in the celebrations feed, admin radar, birthday /
-- anniversary widgets, leaderboard, dll. Filtering at the view level means
-- every consumer (getCelebrationsFeed, getAdminCelebrationsRadar, …) is
-- covered automatically. Keeps the existing is_active=true rule.

CREATE OR REPLACE VIEW public.profiles_celebrations_public AS
SELECT
  id,
  full_name,
  nickname,
  avatar_url,
  avatar_seed,
  is_probation,
  to_char(date_of_birth::timestamp with time zone, 'MM-DD'::text) AS dob_month_day,
  first_day_of_work
FROM public.profiles
WHERE is_active = true
  AND role <> 'investor';
