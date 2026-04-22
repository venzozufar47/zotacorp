-- Flag produk yang tidak ingin dihitung di sistem stok (on-hand, opname,
-- produksi, penarikan). Produk tetap bisa dijual lewat POS; hanya saja
-- tidak masuk ke neraca stok fisik. Default true → behavior lama tidak berubah.
alter table public.pos_products
  add column if not exists track_stock boolean not null default true;
