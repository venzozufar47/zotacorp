-- Mode agregat varian untuk stok: produk yang diproduksi plain (tanpa
-- varian) tapi dijual dengan varian. Contoh Croissant — dipanggang
-- polos, varian (Coklat/Keju) ditentukan saat disajikan ke customer.
--
-- Saat `stock_aggregate_variants=true`:
--   • Produksi / penarikan / opname hanya tercatat di level produk
--     (variant_id=null). Dialog produksi & penarikan hanya tampilkan
--     produk tsb sebagai 1 opsi, bukan per-varian.
--   • Penjualan yang pakai varian tetap mengurangi stok — qty-nya
--     di-pool ke bucket level-produk (variant_id=null) saat expected
--     dihitung.
--
-- Default false supaya perilaku lama (per-varian) tidak berubah untuk
-- katalog existing.
alter table public.pos_products
  add column if not exists stock_aggregate_variants boolean not null default false;
