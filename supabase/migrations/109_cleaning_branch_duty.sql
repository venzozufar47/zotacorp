-- Branch-based cleaning duty — a checklist that belongs to a PLACE, not a person.
--
-- Problem with the existing model: cleaning_assignments.user_id pins a checklist
-- to named employees, so when a branch is staffed by whoever is on shift that
-- day the duty either lands on someone who is off, or has to be re-assigned by
-- hand every time the roster changes.
--
-- New model (additive, fully backward compatible):
--   * A DUTY row is a cleaning_assignments row with user_id NULL, a location_id
--     (the branch's attendance location — the same geofence check-in matches
--     against) and a duty_slot (0..N-1). One branch has N duty rows = N
--     checklists that are swapped between the people on shift.
--   * A branch POOL (cleaning_duty_pool) lists the employees eligible to pick a
--     duty up at that branch. Being in the pool grants nothing by itself.
--   * Who actually performs which checklist on a given day is derived at read
--     time from attendance: pool members who checked in AT that branch that day
--     are ranked deterministically, and slot = (rank + dayIndex) % slotCount so
--     the two checklists alternate between them daily. Ranks >= slotCount get no
--     duty (a busy day does not multiply the work). Math lives in
--     src/lib/utils/cleaning-branch-duty.ts.
--
-- Everything downstream is unchanged: duty rows are ordinary cleaning_assignments
-- rows, so completions (cleaning_task_completions.assignment_id), the photo-slot
-- model, the weekday bitmask, the time-of-day window, skip_holidays and the
-- block_checkout gate all keep working as-is.

-- 1. cleaning_assignments can now target a branch instead of a person.
alter table public.cleaning_assignments
  alter column user_id drop not null;

alter table public.cleaning_assignments
  add column if not exists location_id uuid
    references public.attendance_locations(id) on delete cascade,
  add column if not exists duty_slot integer;

-- Exactly one target: a per-person assignment OR a branch duty, never both.
-- (All pre-existing rows have user_id set, so this validates without a backfill.)
alter table public.cleaning_assignments
  drop constraint if exists cleaning_assignments_target_chk;
alter table public.cleaning_assignments
  add constraint cleaning_assignments_target_chk check (
    (user_id is not null and location_id is null and duty_slot is null)
    or (user_id is null and location_id is not null and duty_slot is not null)
  );

-- One checklist per slot per branch, and a checklist is used by one slot only.
create unique index if not exists cleaning_assignments_branch_slot_uniq
  on public.cleaning_assignments(location_id, duty_slot)
  where location_id is not null;
create unique index if not exists cleaning_assignments_branch_checklist_uniq
  on public.cleaning_assignments(location_id, checklist_id)
  where location_id is not null;
create index if not exists cleaning_assignments_location_idx
  on public.cleaning_assignments(location_id)
  where location_id is not null;

-- 2. Which employees may pick up a branch's duty.
--    Membership is a *pool*, not an assignment: the daily owner is whoever in
--    here actually checked in at the branch that day.
create table if not exists public.cleaning_duty_pool (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null
    references public.attendance_locations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Tiebreaker for the deterministic daily rank (lower goes first).
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (location_id, user_id)
);
create index if not exists cleaning_duty_pool_location_idx
  on public.cleaning_duty_pool(location_id);
create index if not exists cleaning_duty_pool_user_idx
  on public.cleaning_duty_pool(user_id);

-- RLS mirrors cleaning_assignments: any signed-in user reads (an employee has to
-- be able to tell whether today's duty is theirs), only admins write.
alter table public.cleaning_duty_pool enable row level security;

drop policy if exists cleaning_duty_pool_read on public.cleaning_duty_pool;
create policy cleaning_duty_pool_read on public.cleaning_duty_pool
  for select using (auth.uid() is not null);

drop policy if exists cleaning_duty_pool_admin on public.cleaning_duty_pool;
create policy cleaning_duty_pool_admin on public.cleaning_duty_pool
  for all using (is_admin()) with check (is_admin());
