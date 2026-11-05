-- Koreksi kas Haengbocake Pare, 5 Nov 2026.
--
-- Opname Nisa (18:38) menemukan Ready Cake DIY "kurang 1" (Rp60.000) dan ia memilih "Bayar selisih", yang menulis kredit
-- Rp60.000 ke ledger kas seolah uang masuk laci. Padahal kuenya BUKAN hilang: itu "ready klaim mba ana", klaim gratis
-- karyawan yang tidak pernah mengeluarkan stok (lihat migrasi 300). Tidak ada uang yang disetor, laci tetap Rp910.000.
-- Akibatnya kas seharusnya saat buka shift Nisa menjadi Rp970.000 dan angka yang ia ketik mengikuti itu.
--
-- Entri yang dihapus (tercatat di sini sebagai jejak):
--   cashflow_transactions 094f5420-052e-4e3c-b95e-143940350336, 2026-11-05 18:38, "POS Opname Selisih: bayar selisih Rp 60.000",
--   kategori Penyesuaian, kredit 60000, statement 7087a6d1-2915-4cd3-adcf-8f468555cb56.
delete from public.cashflow_transactions
 where id = '094f5420-052e-4e3c-b95e-143940350336'
   and description = 'POS Opname Selisih: bayar selisih Rp 60.000'
   and credit = 60000
   and category = 'Penyesuaian';

-- Kas awal shift Nisa mengikuti laci yang sebenarnya (selisih dihitung otomatis = 0). Syarat status 'open' menjaga agar
-- tidak mengubah shift yang sudah ditutup.
update public.pos_shifts
   set open_cash_counted = 910000, open_cash_expected = 910000,
       open_notes = coalesce(open_notes || E'\n', '') || 'Koreksi admin 5 Nov: kas awal sebenarnya Rp910.000 (entri bayar selisih Rp60.000 dibatalkan; kue diklaim gratis karyawan).'
 where id = 'f7e00373-96c3-479a-823b-a7c4f976db7d'
   and status = 'open'
   and open_cash_counted = 970000;
