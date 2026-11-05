-- Harga POS minuman Haengbocake Pare mengikuti menu terbaru (gambar dari Owner, 5 Nov 2026). Hanya varian "Drinks" Pare.
-- Pemetaan nama menu -> varian POS: Lemonade = Lemon Squash, Strawberry Lychee = Lychee Squash, Choco Latte = Chocolate Latte,
-- Le Mineral = Air Mineral. Salted Maple Latte tidak ada di menu: tidak diubah. Semarang tidak diubah.
-- Produk costing berharga manual ikut disamakan (manual_price) supaya laporan margin memakai harga jual yang sama.
update public.pos_product_variants v
   set price = m.price
  from (values
    ('Black Coffee', 12000), ('Mont Blanc', 23000),
    ('Peach Americano', 14000), ('Berry Americano', 14000),
    ('Salted Vanilla Latte', 23000), ('Salted Butterscotch Latte', 23000),
    ('Air Mineral', 3000), ('Lychee Squash', 12000), ('Lemon Squash', 12000),
    ('Milkyberry Yakult', 17000), ('Chocolate Latte', 14000), ('Matcha Latte', 14000)
  ) as m(name, price)
 where v.name = m.name
   and v.product_id = (select id from public.pos_products where name = 'Drinks' and bank_account_id = '947136f6-4458-40e6-9c4b-fd3a2a183a9f');

update public.costing_products cp
   set manual_price = v.price
  from public.pos_product_variants v
 where cp.pos_variant_id = v.id
   and cp.business_unit = 'Haengbocake Pare'
   and cp.price_method = 'manual'
   and cp.name in ('Black Coffee', 'Peach Americano', 'Berry Americano', 'Le Minerale - 330ml', 'Lemon Squash', 'Chocolate Latte');
