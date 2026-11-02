-- Ready cake dijual lewat keranjang POS (bukan tab Pesanan).
--  - pos_sale_items.ready_cake_order_id : baris penjualan yang menjual satu kue ready (satu pesanan kue = satu baris, qty 1).
--  - cake_orders.sold_pos_sale_id       : penjualan POS yang menjual kue ini. Terisi = kue sudah terjual lewat POS; pendapatannya
--    dibukukan sebagai penjualan POS, jadi rekap keuangan kue mengabaikan pesanan ini (tanpa catatan bayar di pesanan kue).
-- Batal/void penjualan mengosongkan kolom ini lagi dan kue kembali ke daftar ready.

alter table public.pos_sale_items
  add column if not exists ready_cake_order_id uuid references public.cake_orders(id) on delete set null;

alter table public.cake_orders
  add column if not exists sold_pos_sale_id uuid references public.pos_sales(id) on delete set null;

create index if not exists pos_sale_items_ready_cake_idx on public.pos_sale_items (ready_cake_order_id) where ready_cake_order_id is not null;
create index if not exists cake_orders_sold_pos_sale_idx on public.cake_orders (sold_pos_sale_id) where sold_pos_sale_id is not null;
