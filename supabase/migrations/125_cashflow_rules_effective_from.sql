-- Batas tanggal berlaku untuk rule kategorisasi cashflow.
--
-- Sebelumnya rule hanya mencocokkan TEKS, sehingga sekali dibuat ia berlaku
-- untuk semua transaksi yang pernah dan akan diproses. Itu jadi masalah saat
-- aturan bisnisnya sendiri berubah di tengah jalan.
--
-- Kasus nyata yang memicu kolom ini: setor tunai Yeobo Space. Sampai Juli 2026
-- penjualan tunai dicatat dua tahap — sebagai Revenue di rekening kas cabang
-- saat transaksi, lalu sebagai Wealth Transfer saat fisik uangnya disetor ke
-- bank. Menghitung setorannya sebagai revenue akan dobel.
--
-- Sejak dashboard kas cabang berhenti dipakai (entri terakhir 15 Juli 2026),
-- setoran bank menjadi SATU-SATUNYA jejak penjualan tunai — jadi mulai
-- 1 Agustus 2026 ia memang harus dihitung sebagai revenue.
--
-- Tanpa kolom ini, rule "Penyetoran tunai -> Revenue" akan ikut mengubah
-- setoran Januari-Juli begitu ada yang menekan retro-apply atau mengunggah
-- ulang rekening koran lama — menaikkan revenue 2026 ~34,6 juta secara semu,
-- tanpa satu pun error yang terlihat.
--
-- NULL = berlaku untuk semua tanggal (perilaku lama, default aman).

alter table public.cashflow_rules
  add column if not exists effective_from date;

comment on column public.cashflow_rules.effective_from is
  'Rule hanya berlaku untuk transaksi dengan transaction_date >= tanggal ini. NULL = semua tanggal.';
