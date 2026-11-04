-- Produk yang dipantau stoknya di POS tetapi tidak dijual di kasir (mis. "Freebies Tiramisu": berkurang otomatis dari
-- pengisian feedback pelanggan). Berbeda dari stock_only (Ready Cake), yang masuk dan keluarnya lewat pesanan kue: produk
-- not_for_sale tetap bisa diproduksi, ditarik, dan di-opname seperti SKU biasa.
alter table public.pos_products
  add column if not exists not_for_sale boolean not null default false;

comment on column public.pos_products.not_for_sale is
  'Tidak tampil di grid kasir dan ditolak server saat dijual, tetapi ikut stok (produksi, penarikan, opname) dan jumlahnya tampil di POS sebagai pemantauan.';

update public.pos_products set not_for_sale = true where name = 'Freebies Tiramisu';
