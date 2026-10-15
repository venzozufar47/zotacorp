-- The ONLY place the booth schema depends on zota-app's role system.
-- When moving to a new Supabase project, replace the body of this function
-- (e.g. check profiles.role = 'admin') and nothing else needs to change.
create or replace function public.booth_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_yeobo_booth();
$$;

revoke all on function public.booth_can_manage() from public, anon;
grant execute on function public.booth_can_manage() to authenticated, service_role;
