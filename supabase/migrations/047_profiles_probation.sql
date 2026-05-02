-- Probation flag: hides karyawan dari feed celebrations koleksi non-
-- probation employees. Self-celebration + system WA tetap menyala
-- untuk probation employee mereka sendiri.
alter table public.profiles
  add column if not exists is_probation boolean not null default false;

-- Re-create the masked view to expose is_probation so downstream
-- queries can filter without joining back to profiles.
drop view public.profiles_celebrations_public;
create view public.profiles_celebrations_public as
select id,
       full_name,
       nickname,
       avatar_url,
       avatar_seed,
       is_probation,
       to_char((date_of_birth)::timestamp with time zone, 'MM-DD'::text) as dob_month_day,
       first_day_of_work
from profiles;
