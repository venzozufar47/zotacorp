-- Verifikasi foto selfie check-in dengan AI (Gemini) — alur "tolak → foto ulang / tetap absen".
--
-- Prinsip: AI TIDAK PERNAH memblokir absen. Bila menolak, karyawan memilih foto ulang atau tetap
-- absen (kalau ia merasa AI keliru). Pilihan "tetap absen" dicatat dan masuk Inbox admin.
--
-- 1) attendance_selfie_rules — aturan per UNIT BISNIS (bukan per lokasi: lokasi absen bisa
--    berdekatan dan tertukar, mis. Haengbocake Semarang vs Yeobo Tlogosari).
-- 2) attendance_selfie_user_rules — aturan tambahan per orang (mis. penutup kepala wajib untuk
--    karyawan berambut panjang yang tidak berhijab).
-- 3) attendance_selfie_checks — satu baris per foto yang diperiksa. Ditulis server (service role),
--    jadi karyawan tak bisa memalsukan "AI acc". created_at percobaan pertama hari itu dipakai
--    sebagai waktu check-in (foto ulang tidak membuat orang dianggap terlambat).
-- 4) attendance_logs — keputusan akhir + tanda "sudah ditinjau admin".

create table if not exists public.attendance_selfie_rules (
  business_unit text primary key,
  enabled boolean not null default true,
  -- Filter yang menyala: indoor (latar jelas dalam ruangan, tanpa helm), face_full, no_mask, apron.
  filters jsonb not null default '{"indoor": true, "face_full": true, "no_mask": true, "apron": true}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_selfie_user_rules (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  head_cover boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_selfie_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  selfie_path text not null unique,
  verdict text not null,
  issues text[] not null default '{}',
  message text,
  created_at timestamptz not null default now(),
  constraint attendance_selfie_checks_verdict_chk check (verdict in ('ok', 'reject', 'error', 'skipped'))
);

create index if not exists attendance_selfie_checks_user_idx
  on public.attendance_selfie_checks (user_id, created_at desc);

alter table public.attendance_logs
  add column if not exists selfie_ai_verdict text,
  add column if not exists selfie_ai_attempts integer not null default 0,
  add column if not exists selfie_ai_reviewed_at timestamptz;

alter table public.attendance_logs
  drop constraint if exists attendance_logs_selfie_ai_verdict_chk;
alter table public.attendance_logs
  add constraint attendance_logs_selfie_ai_verdict_chk
  check (selfie_ai_verdict is null or selfie_ai_verdict in ('ok', 'overridden', 'unchecked'));

comment on column public.attendance_logs.selfie_ai_verdict is
  'ok = AI menyetujui; overridden = AI menolak tapi karyawan memilih tetap absen; unchecked = AI tak sempat/error/batas harian.';
comment on column public.attendance_logs.selfie_ai_attempts is 'Jumlah foto yang diperiksa AI pada sesi check-in ini (foto ulang menambah).';
comment on column public.attendance_logs.selfie_ai_reviewed_at is 'Admin menandai kasus overridden sudah ditinjau (hilang dari Inbox).';

-- Inbox: kasus "overridden" yang belum ditinjau.
create index if not exists attendance_logs_selfie_override_idx
  on public.attendance_logs (date desc)
  where selfie_ai_verdict = 'overridden' and selfie_ai_reviewed_at is null;

alter table public.attendance_selfie_rules enable row level security;
alter table public.attendance_selfie_user_rules enable row level security;
alter table public.attendance_selfie_checks enable row level security;

drop policy if exists attendance_selfie_rules_admin on public.attendance_selfie_rules;
create policy attendance_selfie_rules_admin on public.attendance_selfie_rules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists attendance_selfie_user_rules_admin on public.attendance_selfie_user_rules;
create policy attendance_selfie_user_rules_admin on public.attendance_selfie_user_rules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists attendance_selfie_checks_admin on public.attendance_selfie_checks;
create policy attendance_selfie_checks_admin on public.attendance_selfie_checks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.attendance_selfie_rules to authenticated, service_role;
grant select, insert, update, delete on public.attendance_selfie_user_rules to authenticated, service_role;
grant select, insert, update, delete on public.attendance_selfie_checks to authenticated, service_role;

-- Awal: seluruh unit Haengbocake (Semarang & Pare).
insert into public.attendance_selfie_rules (business_unit) values ('Haengbocake')
on conflict (business_unit) do nothing;

-- Debar Boles Ananta: wajib penutup kepala (rambut panjang, tidak berhijab).
insert into public.attendance_selfie_user_rules (user_id, head_cover)
values ('695dbbdd-6609-4d7b-9685-e49fe311af6a', true)
on conflict (user_id) do update set head_cover = true;
