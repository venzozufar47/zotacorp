-- Multiple photos per checklist item, each with its own reference.
--
-- A checklist item can now require several photos ("slots"), each with an
-- optional label + reference photo. cleaning_item_photos holds the slots;
-- completions are tracked per (user, item, date, photo_req_id).
--
-- Model (when requires_photo = true):
--   * >=1 slots  → employee uploads one photo per slot (each w/ its reference)
--   * 0 slots    → one generic photo (photo_req_id NULL, no reference)
-- requires_photo = false → a plain checkbox (one completion, NULL photo_req_id).
--
-- The legacy item-level reference_photo_path is migrated into a single slot
-- so existing items keep their reference; the column is then unused.

create table if not exists public.cleaning_item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.cleaning_checklist_items(id) on delete cascade,
  label text,
  reference_photo_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists cleaning_item_photos_item_idx
  on public.cleaning_item_photos(item_id);

alter table public.cleaning_item_photos enable row level security;
drop policy if exists cleaning_item_photos_read on public.cleaning_item_photos;
create policy cleaning_item_photos_read on public.cleaning_item_photos
  for select using (auth.uid() is not null);
drop policy if exists cleaning_item_photos_admin on public.cleaning_item_photos;
create policy cleaning_item_photos_admin on public.cleaning_item_photos
  for all using (is_admin()) with check (is_admin());

-- Completions become per photo slot. NULL photo_req_id = the checkbox or the
-- generic single photo. nulls-not-distinct keeps one NULL row per (user,item,date).
alter table public.cleaning_task_completions
  add column if not exists photo_req_id uuid
    references public.cleaning_item_photos(id) on delete cascade;

alter table public.cleaning_task_completions
  drop constraint if exists cleaning_task_completions_user_id_item_id_date_key;
create unique index if not exists cleaning_task_completions_uniq
  on public.cleaning_task_completions (user_id, item_id, date, photo_req_id)
  nulls not distinct;

-- Migrate existing single references into one slot per item.
insert into public.cleaning_item_photos (item_id, label, reference_photo_path, sort_order)
select id, null, reference_photo_path, 0
from public.cleaning_checklist_items
where reference_photo_path is not null;
