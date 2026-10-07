-- 1) Lampiran foto admin pada Tugas Karyawan (bisa lebih dari satu).
--    kind 'reference' = contoh/instruksi dari admin, tampil selama tugas berjalan.
--    kind 'feedback'  = foto yang menyertai penolakan; `round` = ronde yang ditolak.
--    Satu file boleh dirujuk beberapa baris (tugas yang di-assign ke banyak
--    karyawan berbagi file yang sama) — file baru dihapus bila tak ada lagi
--    yang merujuk (lihat removeUnreferencedAttachmentFiles).
--
-- 2) Batas tipe & ukuran di sisi SERVER untuk bucket foto kebersihan & tugas.
--    Klien sudah mengompres (WebP/JPEG, sisi terpanjang 960–1280px, q0.7),
--    tapi unggah langsung ke storage bisa melewati klien. Batas ini yang
--    memastikan tidak ada file mentah/besar yang masuk. Data produksi saat
--    migrasi ini ditulis: foto kebersihan max 412 KB, seluruhnya webp/jpeg,
--    jadi batas 1 MB tidak menyentuh pemakaian normal.

create table public.assigned_task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.assigned_tasks (id) on delete cascade,
  kind text not null check (kind in ('reference', 'feedback')),
  round integer not null default 1 check (round >= 1),
  photo_path text,
  photo_purged_at timestamptz,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index assigned_task_attachments_task_idx
  on public.assigned_task_attachments (task_id, kind, round);
create index assigned_task_attachments_path_idx
  on public.assigned_task_attachments (photo_path) where photo_path is not null;
create index assigned_task_attachments_created_idx
  on public.assigned_task_attachments (created_at) where photo_path is not null;

alter table public.assigned_task_attachments enable row level security;

create policy assigned_task_attachments_admin_all on public.assigned_task_attachments
  for all using (public.is_admin()) with check (public.is_admin());
create policy assigned_task_attachments_self_select on public.assigned_task_attachments
  for select using (exists (
    select 1 from public.assigned_tasks t
    where t.id = task_id and t.assignee_id = auth.uid()
  ));

grant select, insert, update, delete on public.assigned_task_attachments to authenticated;
grant all on public.assigned_task_attachments to service_role;

-- Bucket privat. Hanya admin yang menulis; karyawan melihat lewat signed URL
-- yang dibuat server (tidak perlu kebijakan baca untuk karyawan).
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

drop policy if exists "task_attachments_admin_insert" on storage.objects;
create policy "task_attachments_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'task-attachments' and public.is_admin());

drop policy if exists "task_attachments_admin_read" on storage.objects;
create policy "task_attachments_admin_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'task-attachments' and public.is_admin());

drop policy if exists "task_attachments_admin_delete" on storage.objects;
create policy "task_attachments_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'task-attachments' and public.is_admin());

-- Batas tipe & ukuran (hanya berlaku untuk unggahan BARU).
update storage.buckets
set file_size_limit = 1048576,
    allowed_mime_types = array['image/webp', 'image/jpeg']
where id in ('cleaning-photos', 'cleaning-refs', 'task-evidence', 'task-attachments');
