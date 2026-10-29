-- Viewers TikTok hanya bisa diambil dengan preset 7 hari (tidak ada tanggal custom), jadi minggu yang terlewat tidak bisa
-- diisi ulang. NULL = viewers tidak tersedia (bukan nol penonton). Laporan lama tidak berubah.
alter table public.social_weekly_reports alter column viewers drop not null;
