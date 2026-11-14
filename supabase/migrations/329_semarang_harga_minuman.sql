-- Haengbocake Semarang: harga minuman disamakan dengan menu cetak. Sudah diterapkan ke produksi 2026-11-14.
-- HPP bermetode 'margin' mengikuti harga varian POS; hanya yang 'manual' (Peach/Berry Americano) perlu diubah di costing.
update pos_product_variants v set price = t.p
from (values ('Matcha Latte',16000),('Choco Latte',16000),('Black Coffee',14000),('Strawberry Lychee',14000),
             ('Lemonade',14000),('Le Mineral',3000),('Mont Blanc',24000),('Peach Americano',16000),
             ('Berry Americano',16000),('Salted Vanilla Latte',24000),('Salted Butterscotch Latte',24000),
             ('Milkyberry Yakult',19000)) t(n, p)
where v.name = t.n
  and v.product_id = (select id from pos_products where bank_account_id = 'a514d240-d75a-4621-8639-b445874a1b54' and name = 'Drinks');

update costing_products set manual_price = 16000
where id in ('484b7a8e-86b2-431a-b822-c596d5213fd5', '01611f1f-eb3a-4aed-917b-60193283dc18') and price_method = 'manual';
