-- 337: Kelompok stok produk POS (urutan & pengelompokan di form opname)
--
-- Keputusan Owner 2026-11-16: form opname shift dikelompokkan supaya kasir
-- menghitung berurutan menurut letak barang: pastry, roti, brownies & dubai
-- chewy (+ soft cookies), lalu isi kulkas. NULL = "Lainnya", tampil paling akhir.
--
-- Hanya kolom pada tabel yang sudah ada: grant tabel tidak berubah.

alter table public.pos_products
  add column if not exists stock_group text
  check (stock_group in ('pastry', 'roti', 'brownies_dubai', 'kulkas'));

comment on column public.pos_products.stock_group is
  'Kelompok hitung opname: pastry | roti | brownies_dubai | kulkas. NULL = Lainnya (paling akhir).';

update public.pos_products set stock_group = case
  when name in ('Croissant', 'Fruit Puff', 'Swirl Puff', 'Banana Strudel') then 'pastry'
  when name in ('Salt Bread', 'Cranberry Walnut Sourdough') then 'roti'
  when name in ('Fudgy Brownies', 'Dubai Chewy Cookie', 'Soft Cookies') then 'brownies_dubai'
  when name in (
    'BCB', 'BCB Matcha', 'Cheesecake (Burnt)', 'Tiramisu', 'Mille Crepes', 'Black Forest',
    'Matcha Strawberry Cake', 'Red Velvet', 'Tres Leches', 'Freebies Tiramisu', 'Ready Cake'
  ) then 'kulkas'
  else stock_group
end
where track_stock = true and stock_group is null;
