-- Verifikasi (satu atau lebih verifikator) untuk poin checklist Tugas Karyawan dan untuk Tiket.
--
-- Pembuat menandai sebuah poin/tiket "perlu verifikasi" dan memilih >= 1 verifikator (`verifier_ids`).
-- Saat pekerjaan DIKIRIM (tugas) / DISELESAIKAN (tiket), tiap verifikator dapat satu baris `verifications`
-- berstatus 'pending' yang muncul di beranda mereka. Semua wajib 'verified' sebelum tugas bisa disetujui
-- admin / tiket bisa dikonfirmasi pembuat. Satu 'rejected' mengembalikan pekerjaan ke pekerja (ronde baru);
-- baris pending lain di ronde itu menjadi 'void'.
--
-- Semua TULIS lewat server action (service role) setelah cek izin; klien hanya boleh membaca baris miliknya.

alter table public.assigned_task_items
  add column verifier_ids uuid[] not null default '{}';
alter table public.tickets
  add column verifier_ids uuid[] not null default '{}';

create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('task', 'ticket')),
  subject_id uuid not null,
  -- Hanya untuk subject 'task': poin checklist yang diverifikasi.
  item_id uuid references public.assigned_task_items (id) on delete cascade,
  round integer not null check (round >= 1),
  verifier_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected', 'void')),
  note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index verifications_unique_per_round
  on public.verifications (subject_type, subject_id, coalesce(item_id, '00000000-0000-0000-0000-000000000000'::uuid), round, verifier_id);
create index verifications_verifier_pending on public.verifications (verifier_id) where status = 'pending';
create index verifications_subject on public.verifications (subject_type, subject_id);

alter table public.verifications enable row level security;
create policy verifications_own_select on public.verifications for select to authenticated
  using (verifier_id = auth.uid());

-- Aturan tabel baru Supabase (30 Okt 2026): GRANT eksplisit, anon dicabut.
grant select on public.verifications to authenticated;
grant select, insert, update, delete on public.verifications to service_role;
revoke all on public.verifications from anon;
