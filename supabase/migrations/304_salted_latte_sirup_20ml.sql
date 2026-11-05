-- Salted Creamy Latte (Maple / Vanilla / Butterscotch, Pare): takaran sirup = 20 ml per cup (info Owner), sebelumnya 10.
-- Maple dicatat per gram: 20 ml dihitung 20 g (sama seperti 10 g sebelumnya). Harga POS mengikuti margin 50% dibulatkan ke atas
-- Rp1.000 dari HPP baru: Maple ~Rp17.161 -> Rp35.000, Vanilla ~Rp18.603 -> Rp38.000, Butterscotch ~Rp18.459 -> Rp37.000.
update public.costing_recipe_items ri
   set qty = 20
  from public.costing_products cp, public.costing_materials m
 where ri.product_id = cp.id and ri.material_id = m.id
   and cp.business_unit = 'Haengbocake Pare'
   and cp.name in ('Salted Maple Latte', 'Salted Vanilla Latte', 'Salted Butterscotch Latte')
   and m.name in ('Sirup Maple Pondan', 'Syrup vanila', 'Syrup butterscotch');

update public.pos_product_variants v
   set price = case v.name
                 when 'Salted Maple Latte' then 35000
                 when 'Salted Vanilla Latte' then 38000
                 when 'Salted Butterscotch Latte' then 37000
               end
 where v.name in ('Salted Maple Latte', 'Salted Vanilla Latte', 'Salted Butterscotch Latte')
   and v.product_id = (select id from public.pos_products where name = 'Drinks' and bank_account_id = '947136f6-4458-40e6-9c4b-fd3a2a183a9f');
