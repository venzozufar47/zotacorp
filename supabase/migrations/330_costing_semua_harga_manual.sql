-- HPP Pare & Semarang: semua produk memakai harga manual (tanpa formula margin/markup).
-- Produk bermetode margin yang tertaut POS memakai harga POS (harga yang benar-benar dijual);
-- bahan setengah jadi tanpa harga jual (mis. Ladyfinger) jadi Rp0. Sudah diterapkan ke produksi 2026-11-14.
update costing_products c
set price_method = 'manual',
    manual_price = coalesce(
      nullif((select coalesce(v.price, p.price)
                from pos_products p
                left join pos_product_variants v on v.id = c.pos_variant_id
               where p.id = c.pos_product_id), 0),
      0)
where c.price_method <> 'manual';
