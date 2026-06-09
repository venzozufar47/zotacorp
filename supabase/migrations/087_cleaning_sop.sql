-- SOP Kebersihan — cleaning checklists with live-photo evidence + checkout gate.
--
-- Concept (Breezeway-style, "management by exception"):
--   * Admin builds named CHECKLISTS, each with ordered ITEMS (a detail note +
--     a requires_photo flag).
--   * A checklist is ASSIGNED to specific employees, with a weekday schedule
--     (bitmask, same convention as profiles.workdays) and a block_checkout
--     toggle ("must finish before checking out").
--   * Employees complete items during their shift, each with a live-camera
--     photo (no gallery upload). When block_checkout is on, check-out is
--     hard-blocked until every item is done (enforced in checkOut()).
--   * One COMPLETION row per (user, item, day) — unique, so retries are
--     idempotent.
--
-- Reuses: is_admin() RLS helper (003), attendance-selfies bucket RLS pattern
-- (011), workdays bitmask (0=Sun..6=Sat).

-- 1. Checklist templates.
create table if not exists public.cleaning_checklists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Ordered items within a checklist.
create table if not exists public.cleaning_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.cleaning_checklists(id) on delete cascade,
  title text not null,
  note text,                                       -- which side to clean & photograph
  requires_photo boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists cleaning_checklist_items_checklist_idx
  on public.cleaning_checklist_items(checklist_id);

-- 3. Assignment of a checklist to an employee (multiple checklists per
--    employee allowed). weekdays = bitmask of days it must be done.
create table if not exists public.cleaning_assignments (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.cleaning_checklists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  weekdays integer not null default 126,           -- 0=Sun..6=Sat; 126 = Mon–Sat
  block_checkout boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (checklist_id, user_id)
);
create index if not exists cleaning_assignments_user_idx
  on public.cleaning_assignments(user_id);

-- 4. One row per completed item per day per employee.
create table if not exists public.cleaning_task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  assignment_id uuid not null references public.cleaning_assignments(id) on delete cascade,
  item_id uuid not null references public.cleaning_checklist_items(id) on delete cascade,
  date date not null,
  completed_at timestamptz not null default now(),
  photo_path text,                                 -- path into cleaning-photos bucket
  latitude double precision,
  longitude double precision,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, item_id, date)
);
create index if not exists cleaning_task_completions_user_date_idx
  on public.cleaning_task_completions(user_id, date);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.cleaning_checklists enable row level security;
alter table public.cleaning_checklist_items enable row level security;
alter table public.cleaning_assignments enable row level security;
alter table public.cleaning_task_completions enable row level security;

-- Templates / items / assignments: any signed-in user may read (employees need
-- to see their assigned checklist + items at check-in); only admins may write.
drop policy if exists cleaning_checklists_read on public.cleaning_checklists;
create policy cleaning_checklists_read on public.cleaning_checklists
  for select using (auth.uid() is not null);
drop policy if exists cleaning_checklists_admin on public.cleaning_checklists;
create policy cleaning_checklists_admin on public.cleaning_checklists
  for all using (is_admin()) with check (is_admin());

drop policy if exists cleaning_items_read on public.cleaning_checklist_items;
create policy cleaning_items_read on public.cleaning_checklist_items
  for select using (auth.uid() is not null);
drop policy if exists cleaning_items_admin on public.cleaning_checklist_items;
create policy cleaning_items_admin on public.cleaning_checklist_items
  for all using (is_admin()) with check (is_admin());

drop policy if exists cleaning_assignments_read on public.cleaning_assignments;
create policy cleaning_assignments_read on public.cleaning_assignments
  for select using (auth.uid() is not null);
drop policy if exists cleaning_assignments_admin on public.cleaning_assignments;
create policy cleaning_assignments_admin on public.cleaning_assignments
  for all using (is_admin()) with check (is_admin());

-- Completions: employees manage their own; admins see/manage all.
drop policy if exists cleaning_completions_select_own on public.cleaning_task_completions;
create policy cleaning_completions_select_own on public.cleaning_task_completions
  for select using (user_id = auth.uid());
drop policy if exists cleaning_completions_select_admin on public.cleaning_task_completions;
create policy cleaning_completions_select_admin on public.cleaning_task_completions
  for select using (is_admin());

drop policy if exists cleaning_completions_insert_own on public.cleaning_task_completions;
create policy cleaning_completions_insert_own on public.cleaning_task_completions
  for insert with check (user_id = auth.uid());
drop policy if exists cleaning_completions_update_own on public.cleaning_task_completions;
create policy cleaning_completions_update_own on public.cleaning_task_completions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists cleaning_completions_delete_own on public.cleaning_task_completions;
create policy cleaning_completions_delete_own on public.cleaning_task_completions
  for delete using (user_id = auth.uid());
drop policy if exists cleaning_completions_admin on public.cleaning_task_completions;
create policy cleaning_completions_admin on public.cleaning_task_completions
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Storage bucket for evidence photos (private; mirrors attendance-selfies).
-- Path convention: ${user_id}/${date}/${item_id}-${uuid}.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cleaning-photos', 'cleaning-photos', false)
on conflict (id) do nothing;

drop policy if exists "cleaning_photo_upload_own" on storage.objects;
create policy "cleaning_photo_upload_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'cleaning-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cleaning_photo_read_own_or_admin" on storage.objects;
create policy "cleaning_photo_read_own_or_admin"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'cleaning-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "cleaning_photo_delete_admin" on storage.objects;
create policy "cleaning_photo_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'cleaning-photos'
    and public.is_admin()
  );
