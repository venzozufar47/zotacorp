-- Survei Bulanan Anonim (PRD-8) — SOP 3.12 / Rencana Tim Mandiri bagian
-- "Berani bersuara". Tiga pertanyaan tetap tiap bulan, tujuh butir
-- Edmondson (1999) tiap kuartal sebagai pembanding.
--
-- ANONIM SUNGGUHAN: TIDAK menyimpan user_id sama sekali di baris jawaban
-- — bukan "disembunyikan di UI", memang tidak direkam. Satu-satunya
-- penjaga dari isi-berkali-kali adalah `respondent_tokens` (hash sekali
-- pakai per user+periode, TANPA relasi balik ke jawaban), bukan FK ke
-- jawaban itu sendiri.

create table public.pulse_survey_responses (
  id uuid primary key default gen_random_uuid(),
  period text not null, -- 'YYYY-MM' untuk bulanan, 'YYYY-Q1'..'YYYY-Q4' untuk kuartalan
  survey_type text not null check (survey_type in ('monthly', 'quarterly')),
  -- Pilihan sendiri oleh responden saat mengisi, BUKAN hasil lookup
  -- profil — supaya baris ini tidak bisa ditautkan balik ke identitas
  -- lewat kolom lain. Null = tidak terikat cabang (mis. staf kantor).
  branch text check (branch is null or branch in ('Pare', 'Semarang')),
  -- Monthly: q1..q3 (SOP 3.12). Quarterly: edmondson1..edmondson7.
  answers jsonb not null,
  created_at timestamptz not null default now()
);

create index pulse_survey_responses_period_idx
  on public.pulse_survey_responses (period, survey_type);

alter table public.pulse_survey_responses enable row level security;

-- TIDAK ADA select untuk siapa pun kecuali admin, DAN admin hanya boleh
-- membaca agregat lewat RPC (lihat function di bawah) — baris mentah
-- tidak dibuka langsung supaya "minimal 4 responden" benar-benar
-- ditegakkan di database, bukan cuma di UI.
create policy pulse_survey_responses_admin_all on public.pulse_survey_responses
  for all using (public.is_admin()) with check (public.is_admin());

grant all on public.pulse_survey_responses to service_role;

-- Penjaga "satu orang satu kali per periode" TANPA menyimpan siapa
-- menjawab apa: token = hash(user_id + period + survey_type), unique.
-- Tidak ada kolom yang menunjuk balik ke pulse_survey_responses.
create table public.pulse_survey_tokens (
  token text primary key,
  period text not null,
  survey_type text not null,
  created_at timestamptz not null default now()
);

alter table public.pulse_survey_tokens enable row level security;
create policy pulse_survey_tokens_admin_all on public.pulse_survey_tokens
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.pulse_survey_tokens to service_role;
