-- Diskon per baris penjualan (mis. produk menjelang expired).
-- Sebelumnya kasir memakai "item custom" yang product_id-nya null →
-- stok tidak berkurang sehingga stock opname selalu selisih. Sekarang
-- baris tetap menunjuk produk katalog, hanya harganya diturunkan;
-- harga normal disimpan di sini supaya nilai diskon tetap terlacak.
-- null = baris tanpa diskon.
alter table public.pos_sale_items
  add column if not exists original_unit_price numeric(16,2);
