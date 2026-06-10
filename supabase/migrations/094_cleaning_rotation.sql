-- Cleaning duty rotation (selang-seling antar 2+ karyawan).
--
-- A rotation = N cleaning_assignments rows that share one rotation_group_id,
-- each keeping its own user_id + a fixed rotation_order (0..N-1). On a scheduled
-- day exactly ONE member is on duty (round-robin); only they see the checklist
-- and are gated at checkout. rotation_group_id NULL = a standalone assignment
-- (a rotation of size 1) and behaves exactly as before — backward compatible,
-- no data backfill.
--
-- Whose-turn math lives in src/lib/utils/cleaning-rotation.ts (generalizes the
-- payroll paired-alternating week-parity to N-member round-robin). rotation_anchor
-- is the group's creation date (fixed once); rotation_member_count is the
-- denormalized group size so per-user employee reads stay single-query.

alter table public.cleaning_assignments
  add column if not exists rotation_group_id uuid,
  add column if not exists rotation_order integer not null default 0,
  add column if not exists rotation_mode text not null default 'daily',
  add column if not exists rotation_anchor date,
  add column if not exists rotation_member_count integer not null default 1;

alter table public.cleaning_assignments
  drop constraint if exists cleaning_assignments_rotation_mode_check;
alter table public.cleaning_assignments
  add constraint cleaning_assignments_rotation_mode_check
  check (rotation_mode in ('daily', 'weekly'));

-- Fast lookup of all members of a group (admin list + monitor count).
create index if not exists cleaning_assignments_group_idx
  on public.cleaning_assignments(rotation_group_id)
  where rotation_group_id is not null;

-- NOTE: no extra unique index on (rotation_group_id, user_id) — the existing
-- unique(checklist_id, user_id) already forbids a duplicate user within a group
-- (all group rows share one checklist_id). RLS is inherited from the existing
-- cleaning_assignments policies; no new policies needed.
