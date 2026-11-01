-- Ready Cake sebagai stok resmi POS.
--
-- Ready cake = kue yang dibuat untuk dipajang di toko (bukan untuk pelanggan tertentu). Sebelumnya hanya
-- terlihat dari nama pesanan berawalan "ready", dan tidak ada di sistem stok. Sekarang:
--  - cake_orders.is_ready_stock : penanda resmi yang dipilih Tasya di form pesanan (independen dari is_diy,
--                                 karena DIY itu jenis kue sedangkan ready itu peruntukan).
--  - pos_products.stock_only    : produk yang ikut stok/opname/penarikan/service level tetapi TIDAK tampil di grid
--                                 kasir (penjualannya lewat serah terima pesanan, bukan keranjang, supaya omzet
--                                 tidak terhitung dua kali).
--  - pos_stock_movements.cake_order_id : jejak pergerakan stok otomatis (masuk saat produksi selesai, keluar saat
--                                 diserahkan) agar tiap pesanan paling banyak satu kali masuk dan satu kali keluar.

alter table public.cake_orders
  add column if not exists is_ready_stock boolean not null default false;

comment on column public.cake_orders.is_ready_stock is
  'Pesanan ini ready cake (stok toko), bukan untuk pelanggan tertentu. Produksi selesai (baker + cake artist) menambah stok produk "Ready Cake" di POS cabang; serah terima di POS mengurangi. Independen dari is_diy.';

-- Pesanan lama yang namanya berawalan "ready" ditandai supaya riwayat konsisten. Tidak ada pergerakan stok
-- yang dibuat untuk pesanan lama: stok baru dipercaya sejak opname pertama setelah fitur ini dipasang.
update public.cake_orders
  set is_ready_stock = true
  where customer_name ~* '^\s*ready';

alter table public.pos_products
  add column if not exists stock_only boolean not null default false;

comment on column public.pos_products.stock_only is
  'Produk khusus stok (mis. Ready Cake): ikut opname, penarikan, dan service level, tetapi tidak tampil di grid penjualan kasir.';

alter table public.pos_stock_movements
  add column if not exists cake_order_id uuid references public.cake_orders(id) on delete set null;

comment on column public.pos_stock_movements.cake_order_id is
  'Terisi untuk pergerakan otomatis ready cake (produksi masuk / serah terima atau buang keluar). Penarikan manual kasir tidak memilikinya.';

create unique index if not exists pos_stock_movements_cake_order_type_uidx
  on public.pos_stock_movements (cake_order_id, type)
  where cake_order_id is not null;

-- Produk "Ready Cake" per kasir di-seed terpisah oleh migrasi 282 (dijalankan setelah kode penyaring grid live).
