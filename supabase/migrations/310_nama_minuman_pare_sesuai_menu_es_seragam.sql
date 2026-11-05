-- (1) Nama minuman Haengbocake Pare disesuaikan dengan menu baru: Lychee Squash -> Strawberry Lychee, Lemon Squash -> Lemonade,
-- Chocolate Latte -> Choco Latte, Air Mineral / Le Minerale - 330ml -> Le Mineral. Hanya NAMA yang diganti: baris (id) varian POS
-- dan produk costing sama, jadi riwayat penjualan, stok, dan tautan HPP tetap utuh. Semarang tidak diubah.
-- (2) Es batu seragam 195 g (es full 1 cup, takaran Black Coffee) di semua minuman gelas Pare: sebelumnya Mont Blanc 60 g,
-- Salted Vanilla / Butterscotch Latte 150 g.
update public.pos_product_variants v
   set name = m.new_name
  from (values
    ('Lychee Squash', 'Strawberry Lychee'), ('Lemon Squash', 'Lemonade'),
    ('Chocolate Latte', 'Choco Latte'), ('Air Mineral', 'Le Mineral')
  ) as m(old_name, new_name)
 where v.name = m.old_name
   and v.product_id = (select id from public.pos_products where name = 'Drinks' and bank_account_id = '947136f6-4458-40e6-9c4b-fd3a2a183a9f');

update public.costing_products cp
   set name = m.new_name
  from (values
    ('Lychee Squash', 'Strawberry Lychee'), ('Lemon Squash', 'Lemonade'),
    ('Chocolate Latte', 'Choco Latte'), ('Le Minerale - 330ml', 'Le Mineral')
  ) as m(old_name, new_name)
 where cp.business_unit = 'Haengbocake Pare' and cp.name = m.old_name;

update public.costing_recipe_items ri
   set qty = 195
  from public.costing_products cp, public.costing_materials m
 where ri.product_id = cp.id and ri.material_id = m.id
   and cp.business_unit = 'Haengbocake Pare'
   and cp.pos_product_id in (select id from public.pos_products where name = 'Drinks' and bank_account_id = '947136f6-4458-40e6-9c4b-fd3a2a183a9f')
   and m.name = 'Es Batu'
   and ri.qty <> 195;
