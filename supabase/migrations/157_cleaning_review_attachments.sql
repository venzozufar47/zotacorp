-- Lampiran foto dari OWNER saat memberi verdict "perlu ulang" — mis. foto
-- contoh sudut yang benar, atau bagian yang masih kotor ditandai. Satu
-- completion bisa punya BEBERAPA lampiran (satu verdict, beberapa foto).
--
-- Tabel BARU, bukan kolom array di cleaning_task_completions: satu completion
-- bisa direview berkali-kali (redo → foto ulang → redo lagi), dan tiap
-- putaran review bisa punya lampirannya sendiri — riwayatnya harus tetap
-- bisa ditelusuri per completion, bukan hanya "lampiran terakhir yang menang".
create table public.cleaning_review_attachments (
  id uuid primary key default gen_random_uuid(),
  completion_id uuid not null references public.cleaning_task_completions(id) on delete cascade,
  photo_path text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Pola sama seperti cleaning_task_completions.photo_purged_at: baris tetap
  -- ada sebagai jejak, hanya gambarnya yang dihapus retensi 90 hari.
  purged_at timestamptz
);

comment on table public.cleaning_review_attachments is
  'Foto yang diunggah OWNER (bukan karyawan) saat verdict redo — contoh/anotasi untuk memperjelas apa yang perlu diperbaiki. Retensi 90 hari sama seperti cleaning_task_completions.photo_path.';
comment on column public.cleaning_review_attachments.completion_id is
  'Completion (foto karyawan) yang sedang direview saat lampiran ini diunggah.';

create index cleaning_review_attachments_completion_idx
  on public.cleaning_review_attachments (completion_id);

-- Sweep retensi butuh ini: cari lampiran kedaluwarsa lewat tanggal completion
-- induknya (tabel ini sendiri tidak punya kolom "date").
create index cleaning_review_attachments_purge_idx
  on public.cleaning_review_attachments (completion_id)
  where purged_at is null;

alter table public.cleaning_review_attachments enable row level security;

-- Admin: kelola penuh (unggah saat verdict, lihat riwayat).
create policy cleaning_review_attachments_admin
  on public.cleaning_review_attachments
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Karyawan: HANYA baca lampiran pada completion MILIKNYA SENDIRI — inilah
-- yang membuat lampiran itu terlihat di dashboard mereka sebagai penjelasan
-- visual kenapa fotonya diminta ulang.
create policy cleaning_review_attachments_select_own
  on public.cleaning_review_attachments
  for select
  using (
    exists (
      select 1 from public.cleaning_task_completions c
      where c.id = completion_id and c.user_id = auth.uid()
    )
  );

-- Tabel BARU setelah kebijakan Data API Supabase berubah (30 Okt 2026, lihat
-- memory supabase_new_table_grants_2026_10_30) — grant eksplisit dari awal,
-- bukan mengandalkan auto-grant yang akan hilang. Authenticated-only: tidak
-- ada kebutuhan akses anon di sini.
grant select, insert, update, delete
  on public.cleaning_review_attachments
  to authenticated;

grant select, insert, update, delete
  on public.cleaning_review_attachments
  to service_role;
