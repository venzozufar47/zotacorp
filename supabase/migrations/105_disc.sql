-- DISC personality test: admin push flag + results table + import bucket.
--
-- Flow: admin flags an employee (disc_test_required) → employee cannot
-- view payslips until the test on /disc is submitted → submitting stores
-- a row in disc_results and clears the flag (one-shot push). Admin can
-- also import historical Frexor result PDFs (source='import').

alter table public.profiles
  add column if not exists disc_test_required boolean not null default false;

create table if not exists public.disc_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  taken_at date not null,
  source text not null check (source in ('app', 'import')),
  -- Posisi/jabatan saat tes (label bebas, mis. "Admin Yeobo Booth").
  position_label text,
  -- Jawaban mentah wizard (array 24 {most, least}); null untuk import.
  answers jsonb,
  -- Tally mentah kolom Paling/Kurang {d,i,s,c}; null untuk import.
  most_counts jsonb,
  least_counts jsonb,
  -- Nilai plot 0-100 {d,i,s,c}. graph1 = Adaptasi (kantor), graph2 =
  -- Alami (sehari-hari). Untuk import bisa null jika tidak diketahui.
  graph1 jsonb,
  graph2 jsonb,
  -- Pattern per grafik (nomor + nama + label huruf tertinggi "D Tinggi").
  pattern1_num int,
  pattern1_name text,
  pattern1_high text,
  pattern2_num int,
  pattern2_name text,
  pattern2_high text,
  -- Path PDF asli di bucket disc-imports (untuk source='import').
  imported_pdf_path text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists disc_results_user_taken_idx
  on public.disc_results (user_id, taken_at desc);

alter table public.disc_results enable row level security;

-- Admin: akses penuh.
create policy disc_results_admin_all
  on public.disc_results
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Karyawan: baca hasil sendiri.
create policy disc_results_select_own
  on public.disc_results
  for select to authenticated
  using (user_id = auth.uid());

-- Karyawan: insert hasil tes dari app untuk dirinya sendiri.
create policy disc_results_insert_own_app
  on public.disc_results
  for insert to authenticated
  with check (user_id = auth.uid() and source = 'app');

-- Bucket privat untuk PDF hasil Frexor yang diimport.
insert into storage.buckets (id, name, public)
values ('disc-imports', 'disc-imports', false)
on conflict (id) do nothing;

-- Storage RLS: hanya admin yang membaca/menulis bucket disc-imports
-- (upload via service role tetap bypass).
create policy "disc imports admin read"
  on storage.objects for select to authenticated
  using (bucket_id = 'disc-imports' and public.is_admin());

create policy "disc imports admin write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'disc-imports' and public.is_admin());
