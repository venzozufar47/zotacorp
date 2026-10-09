-- Tugas Karyawan, tiga tambahan:
--
-- 1) KATEGORI tugas — murni alat manajemen superadmin. Tabel kategori hanya
--    bisa dibaca admin (tanpa policy karyawan), jadi nama kategori tidak
--    pernah sampai ke karyawan; kolom `category_id` di assigned_tasks hanya
--    angka UUID tanpa makna bagi mereka. Kategori berlaku per penugasan
--    (batch): semua salinan satu batch memakai kategori yang sama.
--
-- 2) TUGAS TANPA PENERIMA/TANGGAL ("backlog"). status = 'backlog' berarti
--    baris ini hanya CETAKAN: belum ada assignee dan belum ada tanggal mulai,
--    jadi tak terlihat karyawan, tak masuk pengingat/gate sign out (semuanya
--    sudah menyaring status open/submitted). Admin menyeret karyawan ke
--    matriks → dibuat salinan `open` dari cetakan ini (lihat
--    assignEmployeesToTask). Cetakan tidak diubah, jadi "Urungkan" dan
--    pembatalan salinan mengembalikan tugas ke daftar belum-ditugaskan.
--
-- 3) FOTO TAMBAHAN dari karyawan — di luar foto wajib per item checklist.
--    Per (task, ronde); ikut ronde ulang seperti completions.

-- ── 1) Kategori ──────────────────────────────────────────────────────────
create table public.assigned_task_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index assigned_task_categories_name_uidx
  on public.assigned_task_categories (lower(btrim(name)));

alter table public.assigned_task_categories enable row level security;
create policy assigned_task_categories_admin_all on public.assigned_task_categories
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.assigned_task_categories to authenticated;
grant all on public.assigned_task_categories to service_role;

alter table public.assigned_tasks
  add column category_id uuid references public.assigned_task_categories (id) on delete set null;
create index assigned_tasks_category_idx on public.assigned_tasks (category_id);

-- ── 2) Backlog ───────────────────────────────────────────────────────────
alter table public.assigned_tasks
  drop constraint assigned_tasks_status_check,
  add constraint assigned_tasks_status_check
    check (status in ('backlog', 'open', 'submitted', 'approved', 'cancelled'));

alter table public.assigned_tasks
  alter column assignee_id drop not null,
  alter column start_date drop not null;

-- Tanpa penerima hanya sah untuk cetakan (atau yang dibatalkan); tugas yang
-- benar-benar berjalan selalu punya penerima + tanggal mulai.
alter table public.assigned_tasks
  add constraint assigned_tasks_assignee_required check (
    status in ('backlog', 'cancelled')
    or (assignee_id is not null and start_date is not null)
  );

-- ── 3) Foto tambahan ─────────────────────────────────────────────────────
create table public.assigned_task_extra_photos (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.assigned_tasks (id) on delete cascade,
  round integer not null check (round >= 1),
  photo_path text,
  photo_purged_at timestamptz,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);
create index assigned_task_extra_photos_task_idx
  on public.assigned_task_extra_photos (task_id, round);
-- Sweep retensi (90 hari) hanya menyentuh baris yang masih punya file.
create index assigned_task_extra_photos_photo_idx
  on public.assigned_task_extra_photos (created_at) where photo_path is not null;

alter table public.assigned_task_extra_photos enable row level security;
create policy assigned_task_extra_photos_admin_all on public.assigned_task_extra_photos
  for all using (public.is_admin()) with check (public.is_admin());
create policy assigned_task_extra_photos_self_select on public.assigned_task_extra_photos
  for select using (exists (
    select 1 from public.assigned_tasks t
    where t.id = task_id and t.assignee_id = auth.uid()
  ));

grant select, insert, update, delete on public.assigned_task_extra_photos to authenticated;
grant all on public.assigned_task_extra_photos to service_role;
