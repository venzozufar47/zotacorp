-- Nilai buyback per investor Tlogosari (anonim, tanpa nama), dibekukan di
-- laporan. Uang buyback diberikan 100% ke investor Tlogosari (bukan
-- management) — proporsional terhadap porsi modal masing-masing, dihitung
-- dari yeobo_dividend_recipients (invest_idr, kind='investor', branch
-- 'Tlogosari') pada saat laporan diterbitkan. Kolom nullable: laporan yang
-- sudah ada sebelum kolom ini dibuat dibiarkan null, bukan diasumsikan
-- kosong secara keliru.
alter table public.yeobo_buyback_reports
  add column if not exists investor_shares jsonb;
