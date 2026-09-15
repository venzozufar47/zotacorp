-- Evaluasi 360°: admin push kuisioner ke sekelompok karyawan, semua yang
-- dipilih saling menilai satu sama lain (round-robin penuh, tanpa self-
-- rating). Rubrik 5 metrik tetap (fixed di kode, lihat
-- src/lib/evaluation-360/rubric.ts). Hasil (skor + alasan + atribusi
-- evaluator) hanya boleh dibaca admin — subjek yang dievaluasi tidak
-- pernah melihatnya di sistem, jadi tabel response TIDAK punya select
-- policy untuk karyawan sama sekali (bahkan untuk baris miliknya
-- sendiri). Akses karyawan (roster kohort, worklist pending, submit)
-- selalu lewat server action service-role, bukan query tabel langsung.

create table if not exists public.evaluation_360_rounds (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz
);

create table if not exists public.evaluation_360_participants (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.evaluation_360_rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (round_id, user_id)
);

create index if not exists evaluation_360_participants_round_idx
  on public.evaluation_360_participants (round_id);

-- Baris hanya ada SETELAH submit (tidak pre-create slot kosong) — draft
-- disimpan di localStorage sisi klien (pola DiscTestWizard), bukan di DB.
create table if not exists public.evaluation_360_responses (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.evaluation_360_rounds(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.profiles(id) on delete cascade,
  -- { inisiatif: {score, reason}, pemecahan_masalah: {...}, komunikasi:
  -- {...}, pelayanan: {...}, kerjasama: {...} } — lihat rubric.ts.
  metric_scores jsonb not null,
  total_score int not null check (total_score between 5 and 50),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (rater_id != subject_id),
  unique (round_id, rater_id, subject_id)
);

create index if not exists evaluation_360_responses_subject_idx
  on public.evaluation_360_responses (round_id, subject_id);
create index if not exists evaluation_360_responses_rater_idx
  on public.evaluation_360_responses (round_id, rater_id);

-- "Lembar Ringkasan" admin per subjek per round — kesimpulan diskusi,
-- target perbaikan, cara pengecekan progres. Murni catatan admin.
create table if not exists public.evaluation_360_subject_notes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.evaluation_360_rounds(id) on delete cascade,
  subject_id uuid not null references public.profiles(id) on delete cascade,
  kesimpulan text,
  target_perbaikan text,
  cara_pengecekan text,
  target_completion_date date,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (round_id, subject_id)
);

alter table public.evaluation_360_rounds enable row level security;
alter table public.evaluation_360_participants enable row level security;
alter table public.evaluation_360_responses enable row level security;
alter table public.evaluation_360_subject_notes enable row level security;

-- Rounds: admin penuh. Tidak ada select policy untuk karyawan — roster
-- & judul round diberikan lewat server action (service-role, self-only).
create policy evaluation_360_rounds_admin_all
  on public.evaluation_360_rounds
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Participants: admin penuh saja. Tanpa select policy untuk karyawan —
-- supaya satu peserta tidak bisa query roster kohort mentah lewat RLS;
-- "siapa saja peserta lain" dijawab lewat getMyPending360Evaluations().
create policy evaluation_360_participants_admin_all
  on public.evaluation_360_participants
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Responses: admin penuh. Rater boleh insert/update baris miliknya
-- sendiri (pengecekan bisnis lain — round aktif, subject co-participant,
-- tidak self-rating — dilakukan di server action, pola submitDiscTest).
-- SENGAJA tidak ada select policy untuk siapa pun selain admin — bahkan
-- rater tidak bisa membaca balik jawabannya sendiri lewat query
-- langsung (status "sudah submit" dijawab via server action
-- service-role) — ini yang menjamin subjek tidak pernah bisa melihat
-- skor/alasan tentang dirinya.
create policy evaluation_360_responses_admin_all
  on public.evaluation_360_responses
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy evaluation_360_responses_insert_own
  on public.evaluation_360_responses
  for insert to authenticated
  with check (rater_id = auth.uid());

create policy evaluation_360_responses_update_own
  on public.evaluation_360_responses
  for update to authenticated
  using (rater_id = auth.uid())
  with check (rater_id = auth.uid());

-- Subject notes: admin only — "Lembar Ringkasan" tidak pernah tampil ke
-- karyawan yang dievaluasi.
create policy evaluation_360_subject_notes_admin_all
  on public.evaluation_360_subject_notes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
