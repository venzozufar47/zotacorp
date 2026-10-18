-- Notulen Huddle Harian & Rapat Mingguan (PRD-9) — ritme tim tertulis yang
-- sebelumnya hanya niat di dokumen ("satu-satunya forum rutin saat ini
-- hanya briefing bulanan Owner"). Dibuat generik per cabang, bukan per
-- tim/leader spesifik, karena belum ada roster cabang yang otoritatif di
-- skema (Pare/Semarang) — siapa boleh mengisi diatur di action
-- (admin atau pemegang `team_members.leader_id`), siapa boleh membaca
-- dibuka untuk semua karyawan BU Haengbocake (bukan data sensitif).
--
-- Ack TIDAK menuntut daftar hadir tertutup (tidak ada roster otoritatif
-- untuk divalidasi) — siapa pun yang membuka boleh menandai sudah baca.
-- Itu cukup untuk niat SOP ("yang tidak hadir membaca notulen, dan
-- membalas bila ada keberatan dalam satu hari kerja") tanpa membangun
-- sistem roster baru yang di luar cakupan PRD ini.

create table public.team_huddles (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Pare', 'Semarang')),
  huddle_date date not null,
  target_today text not null,
  yesterday_blocker text,
  who_holds_what text,
  posted_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (branch, huddle_date)
);

alter table public.team_huddles enable row level security;
create policy team_huddles_admin_all on public.team_huddles
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.team_huddles to service_role;

create table public.team_weekly_minutes (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Pare', 'Semarang')),
  -- Senin minggu bersangkutan — bukan tanggal rapat persis, supaya satu
  -- minggu = satu baris walau rapatnya mundur beberapa hari.
  week_start date not null,
  scorecard_note text,
  problem_analyzed text,
  fix_description text,
  fix_owner_id uuid references public.profiles (id),
  fix_deadline date,
  requests_to_owner text,
  posted_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (branch, week_start)
);

alter table public.team_weekly_minutes enable row level security;
create policy team_weekly_minutes_admin_all on public.team_weekly_minutes
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.team_weekly_minutes to service_role;

create table public.team_minutes_acks (
  minutes_kind text not null check (minutes_kind in ('huddle', 'weekly')),
  minutes_id uuid not null,
  user_id uuid not null references public.profiles (id),
  acked_at timestamptz not null default now(),
  primary key (minutes_kind, minutes_id, user_id)
);

alter table public.team_minutes_acks enable row level security;
create policy team_minutes_acks_admin_all on public.team_minutes_acks
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.team_minutes_acks to service_role;
