-- Briefing kilat: satu per (cabang, hari, pencatat), bukan satu per (cabang, hari).
-- Koordinator toko dan kepala produksi di cabang yang sama masing-masing memimpin tim berbeda,
-- jadi keduanya boleh punya briefing pada hari yang sama. Baris yang ada tidak berubah.
alter table public.team_huddles drop constraint if exists team_huddles_branch_huddle_date_key;
drop index if exists public.team_huddles_branch_huddle_date_key;
create unique index if not exists team_huddles_branch_date_poster_key
  on public.team_huddles (branch, huddle_date, posted_by);
