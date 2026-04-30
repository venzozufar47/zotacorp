-- Expose avatar fields through the masked celebrations view so the
-- dashboard can render real avatars for both celebrants and message
-- authors. These fields are non-sensitive (avatar_url is a public
-- storage URL; avatar_seed is just a hash for DiceBear).
drop view public.profiles_celebrations_public;
create view public.profiles_celebrations_public as
select id,
       full_name,
       nickname,
       avatar_url,
       avatar_seed,
       to_char((date_of_birth)::timestamp with time zone, 'MM-DD'::text) as dob_month_day,
       first_day_of_work
from profiles;
