-- Laporan sosmed mingguan: TikTok melaporkan Likes / Comments / Shares terpisah (Instagram tetap satu angka interaksi)
-- dan viewers TikTok hanya bisa diambil dengan preset 7 hari, jadi dicatat kapan angkanya diambil.
-- `interactions` tetap berisi jumlah (likes + comments + shares) agar engagement rate & bagan tidak berubah.
-- Net followers TikTok dicatat lewat follows (bila naik) / unfollows (bila turun): net = follows − unfollows tetap berlaku.
alter table public.social_weekly_reports
  add column if not exists likes integer check (likes is null or likes >= 0),
  add column if not exists comments integer check (comments is null or comments >= 0),
  add column if not exists shares integer check (shares is null or shares >= 0),
  add column if not exists viewers_captured_on date;

comment on column public.social_weekly_reports.viewers_captured_on is
  'Tanggal viewers TikTok (preset 7 hari) diambil. Tepat Senin setelah minggu itu = rentang pas; lebih lambat = perkiraan.';
