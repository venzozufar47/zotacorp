-- Override nilai manual per aset buyback. Investor komplain formula garis
-- lurus generik terlalu "dipukul rata" utk barang bervalue tinggi (kamera,
-- printer) yang harga pasar secondhand-nya tidak mengikuti kurva depresiasi
-- linear standar. Kolom nullable: kalau diisi, dipakai MENGGANTIKAN hasil
-- formula utk aset itu saja di computeBuybackReport (lihat
-- src/lib/investor/buyback-depreciation.ts); aset lain tetap formula.
-- `override_source` wajib menyertai alasan/sumber riset supaya nilai manual
-- tetap bisa diaudit, bukan angka yang diketik tanpa dasar.
alter table public.yeobo_buyback_assets
  add column if not exists override_value_idr numeric(16, 2),
  add column if not exists override_source text;
