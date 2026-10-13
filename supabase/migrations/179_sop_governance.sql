-- SOP: tata kelola (pemilik, tinjau berkala, riwayat perubahan), masa uji &
-- tanggal mulai, sampel tinjauan foto, dan laporan kendala dari karyawan.
--
-- Latar: SOP yang ditulis sekali lalu dibiarkan cepat usang. Tiap SOP kini punya
-- pemilik + jadwal tinjau ulang, setiap perubahan tercatat, assignment baru
-- bisa dimulai lewat masa uji (tidak mengunci absen & tidak dihitung terlewat),
-- dan karyawan bisa melaporkan titik yang tidak bisa dikerjakan.

-- 1. Pemilik + jadwal tinjau ulang per SOP.
alter table public.cleaning_checklists
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists review_every_days integer
    check (review_every_days is null or review_every_days between 7 and 365),
  add column if not exists last_reviewed_at timestamptz;

-- 2. Tanggal mulai + masa uji per assignment. NULL = perilaku lama (berlaku sejak
--    dulu, tanpa masa uji), jadi assignment yang sudah ada tidak berubah.
alter table public.cleaning_assignments
  add column if not exists starts_on date,
  add column if not exists trial_until date;

-- 3. Foto yang masuk antrean tinjauan manusia (sampel acak / sesi terburu-buru)
--    tidak disapu "Otomatis di-Acc" saat foto hari berikutnya masuk.
alter table public.cleaning_task_completions
  add column if not exists review_sampled boolean not null default false;

-- 4. Riwayat perubahan SOP.
create table if not exists public.cleaning_checklist_revisions (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.cleaning_checklists(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  summary text not null check (length(btrim(summary)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists cleaning_checklist_revisions_idx
  on public.cleaning_checklist_revisions (checklist_id, created_at desc);

alter table public.cleaning_checklist_revisions enable row level security;
drop policy if exists cleaning_revisions_admin_all on public.cleaning_checklist_revisions;
create policy cleaning_revisions_admin_all on public.cleaning_checklist_revisions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 5. Kendala dari karyawan: titik yang tidak bisa dikerjakan / usul perbaikan.
create table if not exists public.cleaning_item_issues (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.cleaning_checklist_items(id) on delete cascade,
  checklist_id uuid not null references public.cleaning_checklists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create index if not exists cleaning_item_issues_open_idx
  on public.cleaning_item_issues (status, created_at desc);
create index if not exists cleaning_item_issues_item_idx
  on public.cleaning_item_issues (item_id);

alter table public.cleaning_item_issues enable row level security;
drop policy if exists cleaning_issues_admin_all on public.cleaning_item_issues;
create policy cleaning_issues_admin_all on public.cleaning_item_issues
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists cleaning_issues_own_select on public.cleaning_item_issues;
create policy cleaning_issues_own_select on public.cleaning_item_issues
  for select to authenticated using (user_id = auth.uid());
drop policy if exists cleaning_issues_own_insert on public.cleaning_item_issues;
create policy cleaning_issues_own_insert on public.cleaning_item_issues
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'open');

-- Grant eksplisit (auto-grant tabel baru berhenti 30 Okt 2026).
grant select, insert, update, delete
  on public.cleaning_checklist_revisions, public.cleaning_item_issues to authenticated;
grant all
  on public.cleaning_checklist_revisions, public.cleaning_item_issues to service_role;
