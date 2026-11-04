-- Ready cake yang dijual lewat keranjang POS: omsetnya tetap omset Custom Cake, uangnya (kalau tunai) tetap masuk laci kasir.
--
-- Sebelumnya seluruh nilai keranjang dibukukan sebagai penjualan POS ("Sales"), sedangkan pesanan kuenya tetap tanpa
-- catatan bayar: kanban menampilkan "belum lunas" untuk kue yang sudah diserahkan, dan omset/bonus kue tidak melihatnya.
--
-- Sekarang satu penjualan dipecah dua:
--  - pos_sales.total / gross_total : HANYA bagian POS biasa (setelah diskon). Semua laporan omset POS tetap memakai kolom ini.
--  - pos_sales.ready_cake_total    : jumlah harga ready cake di keranjang (tidak kena diskon). Dibukukan sebagai pembayaran
--                                    pesanan kue (cake_order_payments), jadi masuk omset kue, bonus admin, dan status lunas kanban.
--  - cake_order_payments.pos_sale_id: penjualan POS yang menerima pembayaran itu, supaya void bisa membatalkannya.

alter table public.pos_sales
  add column if not exists ready_cake_total numeric not null default 0;

comment on column public.pos_sales.ready_cake_total is
  'Jumlah harga ready cake yang dijual di transaksi ini. TIDAK termasuk total/gross_total: dibukukan sebagai pembayaran pesanan kue (omset Custom Cake), bukan omset POS.';

alter table public.cake_order_payments
  add column if not exists pos_sale_id uuid references public.pos_sales(id) on delete set null;

comment on column public.cake_order_payments.pos_sale_id is
  'Terisi bila pembayaran ini diterima lewat keranjang POS (ready cake). Void penjualan membatalkan pembayaran ini.';

create index if not exists cake_order_payments_pos_sale_idx
  on public.cake_order_payments (pos_sale_id) where pos_sale_id is not null;
