-- Buyback aset Yeosari (Tlogosari) per 30 Sep 2026: kontrak investor berakhir (1 Jul 2023 + 39 bulan), aset bergerak
-- dibeli balik Owner senilai 32.696.585 (nilai terdepresiasi + penyesuaian), dibagi menurut porsi modal.
-- Dicatat sebagai baris investor_payouts bersumber 'buyback' di periode Okt 2026 (bukan dividen: memengaruhi total
-- penerimaan investor, bukan hak bagi hasil bulanan). Owen/Dicky/Adji sudah ditransfer 13 Okt 2026 dari pinjaman owner 13jt;
-- Qais belum ditransfer, dicatat sebagai dibayar atas instruksi Owner.
alter table public.investor_payouts drop constraint investor_payouts_source_chk;
alter table public.investor_payouts add constraint investor_payouts_source_chk
  check (source = any (array['distribusi'::text, 'manual'::text, 'buyback'::text]));

insert into public.investor_payouts (contract_id, period_year, period_month, amount_idr, paid_at, ref, notes, source)
values
  ('086e5f58-805c-4d41-b365-e50babbba91c', 2026, 10, 19617951, '2026-10-13', 'buyback-yeosari-sep-2026',
   'Buyback aset Yeosari (60%). Belum ditransfer per 6 Nov 2026; dianggap sudah dibayar atas instruksi Owner.', 'buyback'),
  ('3f0d5a86-5e51-4452-9872-bf01d59a34b2', 2026, 10, 6539317, '2026-10-13', 'buyback-yeosari-sep-2026',
   'Buyback aset Yeosari (20%). Ditransfer 13 Okt 2026 bersama dividen Sep dari pinjaman owner 13jt.', 'buyback'),
  ('dca91cb4-9d2c-414b-8d35-8839c550a055', 2026, 10, 3269658, '2026-10-13', 'buyback-yeosari-sep-2026',
   'Buyback aset Yeosari (10%). Ditransfer 13 Okt 2026 bersama dividen Sep dari pinjaman owner 13jt.', 'buyback'),
  ('f3924645-0bb0-468a-a5d3-8f49cf4628e0', 2026, 10, 3269659, '2026-10-13', 'buyback-yeosari-sep-2026',
   'Buyback aset Yeosari (10%). Ditransfer 13 Okt 2026 bersama dividen Sep dari pinjaman owner 13jt.', 'buyback')
on conflict (contract_id, period_year, period_month) do nothing;
