-- Link pembelian (Shopee dsb) per bahan — memudahkan restock: klik
-- langsung ke halaman produk supplier. Nullable; hanya URL http(s).
alter table public.costing_materials
  add column if not exists shopee_url text;
