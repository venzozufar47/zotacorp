-- 343: Tingkat es (ice) untuk minuman POS
--
-- Mengikuti pola tingkat gula (migrasi 109): flag wajib-pilih di produk DAN varian
-- (varian menang bila produk punya varian), snapshot nilai per baris penjualan.
-- Pilihan hanya dua: less_ice & normal_ice (tanpa "no ice").
--
-- Keputusan Owner: semua minuman yang wajib pilih gula juga wajib pilih ice; flag bisa
-- diatur per minuman di katalog admin. Le Mineral tak ber-gula, jadi tak ber-ice.
-- Baris penjualan lama dibiarkan NULL (tak ada data ice).

alter table public.pos_products
  add column if not exists requires_ice_level boolean not null default false;

alter table public.pos_product_variants
  add column if not exists requires_ice_level boolean not null default false;

alter table public.pos_sale_items
  add column if not exists ice_level text
  check (ice_level in ('less_ice', 'normal_ice'));

update public.pos_product_variants
set requires_ice_level = true
where requires_sugar_level = true;

update public.pos_products
set requires_ice_level = true
where requires_sugar_level = true;
