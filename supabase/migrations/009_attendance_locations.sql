-- Geofenced attendance locations + per-employee assignment.
--
-- Rules enforced in code (not DB):
--  - Check-in: rejected if employee has assignments and current GPS is
--    outside ALL of them.
--  - Check-out: always allowed; if employee has assignments and GPS is
--    outside all, a `checkout_outside_note` is required.
--  - Employee with NO assignments: free check-in/out anywhere.
--
-- DB just provides the storage + RLS. Distance math is haversine in JS.

create table if not exists public.attendance_locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  latitude    float8 not null check (latitude  between -90  and 90),
  longitude   float8 not null check (longitude between -180 and 180),
  radius_m    integer not null check (radius_m between 10 and 5000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.employee_locations (
  employee_id uuid not null references public.profiles(id)            on delete cascade,
  location_id uuid not null references public.attendance_locations(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (employee_id, location_id)
);

create index if not exists idx_employee_locations_employee on public.employee_locations(employee_id);
create index if not exists idx_employee_locations_location on public.employee_locations(location_id);

-- Add checkout-side coordinates + outside-radius note + matched location FK
-- to attendance_logs. Existing rows get NULL — only new check-ins populate.
alter table public.attendance_logs
  add column if not exists checkout_latitude     float8,
  add column if not exists checkout_longitude    float8,
  add column if not exists checkout_outside_note text,
  add column if not exists matched_location_id   uuid references public.attendance_locations(id) on delete set null;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.attendance_locations enable row level security;
alter table public.employee_locations   enable row level security;

-- attendance_locations: any authenticated user may read (needed at check-in
-- to resolve their assigned set). Only admins may write.
drop policy if exists "loc_read_authenticated"   on public.attendance_locations;
drop policy if exists "loc_admin_write"          on public.attendance_locations;
create policy "loc_read_authenticated"
  on public.attendance_locations for select
  to authenticated using (true);
create policy "loc_admin_write"
  on public.attendance_locations for all
  to authenticated
  using      (public.is_admin())
  with check (public.is_admin());

-- employee_locations: an employee may read their own assignments. Admins
-- may read + write all rows.
drop policy if exists "emp_loc_self_read"        on public.employee_locations;
drop policy if exists "emp_loc_admin_read"       on public.employee_locations;
drop policy if exists "emp_loc_admin_write"      on public.employee_locations;
create policy "emp_loc_self_read"
  on public.employee_locations for select
  to authenticated using (employee_id = auth.uid());
create policy "emp_loc_admin_read"
  on public.employee_locations for select
  to authenticated using (public.is_admin());
create policy "emp_loc_admin_write"
  on public.employee_locations for all
  to authenticated
  using      (public.is_admin())
  with check (public.is_admin());

-- Touch updated_at on attendance_locations row updates.
create or replace function public.touch_attendance_locations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_attendance_locations_touch on public.attendance_locations;
create trigger trg_attendance_locations_touch
  before update on public.attendance_locations
  for each row execute function public.touch_attendance_locations_updated_at();
