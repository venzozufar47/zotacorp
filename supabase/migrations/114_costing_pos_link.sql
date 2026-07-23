-- 114: Costing C2 — tautan ke produk POS (FR-14, POS saja; cake ditunda)
--
-- Menautkan produk costing ke produk/varian POS untuk banding "harga
-- rekomendasi (HPP) vs harga POS aktual" + terapkan harga rekomendasi.
-- ON DELETE SET NULL: kalau produk/varian POS dihapus, tautan lepas
-- otomatis (pos delete = soft, tapi tetap aman).

alter table public.costing_products
  add column if not exists pos_product_id uuid
    references public.pos_products(id) on delete set null,
  add column if not exists pos_variant_id uuid
    references public.pos_product_variants(id) on delete set null;
