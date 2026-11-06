-- Strawberry Lychee (Haengbocake Pare): harga jual menu final Rp12.000 (sama dengan POS). Sebelumnya costing memakai metode margin
-- (target 63,27%) yang pas di Rp12.000 saat resep belum ada stroberi; setelah Strawberry 2 pcs masuk (migrasi 311, HPP ~Rp6.485)
-- metode itu menyarankan Rp18.000, tidak sama dengan harga POS. Disamakan seperti minuman lain berharga menu (Lemonade,
-- Black Coffee, dst.): metode manual Rp12.000, sehingga laporan margin memakai harga jual yang sebenarnya.
update public.costing_products cp
   set price_method = 'manual', manual_price = v.price
  from public.pos_product_variants v
 where cp.pos_variant_id = v.id
   and cp.business_unit = 'Haengbocake Pare'
   and cp.name = 'Strawberry Lychee'
   and v.price = 12000;
