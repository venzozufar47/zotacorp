-- Who from a branch's cleaning pool is actually at the branch today.
--
-- Branch duty (109) ranks the pool members present that day and hands each of
-- them a checklist. An employee therefore has to know who ELSE checked in at
-- their branch — but attendance_logs is deliberately self-only for employees
-- (attendance_select_own), so the plain query returns just themselves and the
-- ranking collapses.
--
-- This SECURITY DEFINER function exposes exactly the sliver needed: the pool
-- members present at ONE location on ONE date, and only to someone who is in
-- that pool themselves (or an admin). No timestamps, no other locations, no
-- attendance detail — just the ordered roster used for the daily swap.
--
-- The ordering (sort_order, user_id) is the rank the TS side relies on; it is
-- deliberately NOT check-in time, so a colleague arriving later can never
-- reshuffle a checklist someone already started.

create or replace function public.cleaning_branch_present(
  p_location_id uuid,
  p_date date
)
returns table (user_id uuid, sort_order integer)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.user_id, p.sort_order
  from public.cleaning_duty_pool p
  join public.attendance_logs a
    on a.user_id = p.user_id
   and a.date = p_date
   and a.matched_location_id = p_location_id
  where p.location_id = p_location_id
    and (
      public.is_admin()
      or exists (
        select 1
        from public.cleaning_duty_pool me
        where me.location_id = p_location_id
          and me.user_id = auth.uid()
      )
    )
  order by p.sort_order, p.user_id;
$$;

revoke all on function public.cleaning_branch_present(uuid, date) from public;
grant execute on function public.cleaning_branch_present(uuid, date) to authenticated;
