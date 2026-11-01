-- Seed produk "Ready Cake" (lihat 281). Dipisah dan dijalankan SAAT kode penyaring grid sudah live: produk stock_only
-- yang muncul sebelum itu akan tampil di grid kasir dan form opname versi lama.
--
-- Satu produk per kasir POS Haengbocake (Pare dan Semarang), dua varian: Reguler dan DIY (mengikuti cake_orders.is_diy).
-- Harga hanya dipakai untuk nilai selisih opname; penjualan sebenarnya memakai total pesanan.

do $$
declare
  acc record;
  pid uuid;
begin
  for acc in
    select id from public.bank_accounts
    where business_unit = 'Haengbocake' and pos_enabled and is_active and default_branch in ('Pare', 'Semarang')
  loop
    select id into pid from public.pos_products
      where bank_account_id = acc.id and stock_only and name = 'Ready Cake';
    if pid is null then
      insert into public.pos_products (bank_account_id, name, price, active, sort_order, track_stock, stock_only)
        values (acc.id, 'Ready Cake', 70000, true, 9000, true, true)
        returning id into pid;
      insert into public.pos_product_variants (product_id, name, price, active, sort_order)
        values (pid, 'Reguler', 70000, true, 0), (pid, 'DIY', 60000, true, 1);
    end if;
  end loop;
end $$;
