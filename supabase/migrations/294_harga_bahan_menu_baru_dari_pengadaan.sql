-- Koreksi harga bahan menu baru Pare (Tres Leches, Strawberry Yogurt Millecrepes, Salted Maple Latte) sesuai info tim
-- pengadaan 2026-11-05. Kayu manis bubuk belum pernah dibeli: harga Rp20.000 per 50 g tetap sementara.
-- Salted Maple Latte memakai margin 50% (bulat ke atas Rp1.000): HPP turun ke Rp16.611 sehingga harga jadi Rp34.000.

update public.costing_materials set purchase_unit = 'botol', purchase_price = 55000, content_per_purchase = 1000, price_updated_at = now()
  where business_unit = 'Haengbocake Pare' and name = 'Sirup Maple Pondan';

update public.costing_materials set name = 'Susu Evaporasi Nestle Carnation', purchase_price = 22800, content_per_purchase = 450, price_updated_at = now()
  where business_unit = 'Haengbocake Pare' and name = 'Susu Evaporasi Tiga Sapi';

update public.costing_materials set purchase_price = 35000, content_per_purchase = 500, price_updated_at = now()
  where business_unit = 'Haengbocake Pare' and name = 'Anggur Muscat';

update public.costing_materials set purchase_price = 13000, price_updated_at = now()
  where business_unit = 'Haengbocake Pare' and name = 'Yogurt Cimory Squeeze';

update public.pos_product_variants set price = 34000
  where name = 'Salted Maple Latte'
    and product_id = (select id from public.pos_products where name = 'Drinks' and bank_account_id = '947136f6-4458-40e6-9c4b-fd3a2a183a9f');
