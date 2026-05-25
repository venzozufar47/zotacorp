-- Update profiles_celebrations_public agar exclude is_active=false.
-- Karyawan resign tidak boleh muncul di feed celebrations, leaderboard
-- birthday, anniversary widget, dll. Filter di view level supaya
-- semua consumer (getCelebrationsFeed, getAdminCelebrationsRadar,
-- dll) otomatis kena tanpa edit per-tempat.

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
WHERE is_active = true;
