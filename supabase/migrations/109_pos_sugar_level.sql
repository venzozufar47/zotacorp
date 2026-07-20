-- 109: Tingkat gula wajib untuk minuman (POS)
--
-- Model produk POS tidak punya kolom kategori, jadi "minuman" ditandai
-- eksplisit lewat flag `requires_sugar_level`. Flag ada di DUA level:
--   - varian  → dipakai bila produknya punya varian (kasus Haengbocake
--               Pare: satu produk "Drinks" berisi 8 varian minuman)
--   - produk  → dipakai bila produk TIDAK punya varian (minuman berdiri
--               sendiri di masa depan)
-- Aturan resolusi: variantId ? varian.flag : produk.flag
--
-- Gula sengaja BUKAN varian: varian adalah SKU ber-harga, sedangkan gula
-- tidak memengaruhi harga dan akan melipatgandakan katalog kalau digabung.

alter table public.pos_products
  add column if not exists requires_sugar_level boolean not null default false;

alter table public.pos_product_variants
  add column if not exists requires_sugar_level boolean not null default false;

-- Kolom snapshot per baris penjualan, mengikuti konvensi `variant_name` /
-- `fulfillment_type`: nullable, karena mayoritas item bukan minuman.
alter table public.pos_sale_items
  add column if not exists sugar_level text
  check (sugar_level in ('no_sugar', 'less_sugar', 'normal_sugar'));

-- Seed Haengbocake Pare: hanya minuman RACIKAN yang wajib pilih gula.
-- Air Mineral & HiBean Bottle (S/L) itu minuman kemasan botol — gulanya
-- tidak bisa diatur, jadi sengaja dibiarkan false.
update public.pos_product_variants v
set requires_sugar_level = true
from public.pos_products p
where v.product_id = p.id
  and p.bank_account_id = '947136f6-4458-40e6-9c4b-fd3a2a183a9f'
  and p.name = 'Drinks'
  and v.name in (
    'Matcha Latte',
    'Chocolate Latte',
    'Black Coffee',
    'Lychee Squash',
    'Lemon Squash'
  );
