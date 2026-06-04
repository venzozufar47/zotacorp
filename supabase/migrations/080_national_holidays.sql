-- National holiday calendar + per-employee opt-in.
--
-- When profiles.holiday_bonus_enabled is true for an employee, a check-in whose
-- date matches a national_holidays row is auto-marked "bonus" (no late penalty;
-- for bonus_day_hourly employees it becomes tiered overtime pay). Reuses the
-- existing bonus_day attendance path.

create table if not exists public.national_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists national_holidays_date_idx on public.national_holidays(holiday_date);

alter table public.national_holidays enable row level security;

-- Any signed-in user may read (needed at check-in); only admins may write.
drop policy if exists national_holidays_read on public.national_holidays;
create policy national_holidays_read on public.national_holidays
  for select using (auth.uid() is not null);
drop policy if exists national_holidays_admin on public.national_holidays;
create policy national_holidays_admin on public.national_holidays
  for all using (is_admin()) with check (is_admin());

-- Per-employee opt-in toggle.
alter table public.profiles
  add column if not exists holiday_bonus_enabled boolean not null default false;

-- Seed Indonesia 2026 national holidays (SKB 3 Menteri, excludes cuti bersama).
insert into public.national_holidays (holiday_date, name) values
  ('2026-01-01', 'Tahun Baru Masehi'),
  ('2026-01-16', 'Isra Mikraj Nabi Muhammad saw.'),
  ('2026-02-17', 'Tahun Baru Imlek 2577 Kongzili'),
  ('2026-03-19', 'Hari Suci Nyepi (Tahun Baru Saka 1948)'),
  ('2026-03-21', 'Idulfitri 1447 H'),
  ('2026-03-22', 'Idulfitri 1447 H'),
  ('2026-04-03', 'Wafat Yesus Kristus'),
  ('2026-04-05', 'Kebangkitan Yesus Kristus (Paskah)'),
  ('2026-05-01', 'Hari Buruh Internasional'),
  ('2026-05-14', 'Kenaikan Yesus Kristus'),
  ('2026-05-27', 'Iduladha 1447 H'),
  ('2026-05-31', 'Hari Raya Waisak 2570 BE'),
  ('2026-06-01', 'Hari Lahir Pancasila'),
  ('2026-06-16', 'Tahun Baru Islam 1448 H'),
  ('2026-08-17', 'Proklamasi Kemerdekaan'),
  ('2026-08-25', 'Maulid Nabi Muhammad saw.'),
  ('2026-12-25', 'Kelahiran Yesus Kristus')
on conflict (holiday_date) do nothing;
