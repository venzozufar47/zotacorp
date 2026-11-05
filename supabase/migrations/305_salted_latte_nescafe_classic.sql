-- Salted Creamy Latte (Maple / Vanilla / Butterscotch, Pare): kopi diganti dari Nescafe Gold ke Nescafe Classic (info Owner).
-- Gold 6 g (3 tsp) = Classic 3 sachet (1 sachet = 2 g, satuan pakai pcs). Harga POS TIDAK diubah di sini (menunggu keputusan Owner).
update public.costing_recipe_items ri
   set material_id = (select id from public.costing_materials where business_unit = 'Haengbocake Pare' and name = 'Nescafe Classic' and is_active order by created_at limit 1),
       qty = 3
  from public.costing_products cp, public.costing_materials m
 where ri.product_id = cp.id and ri.material_id = m.id
   and cp.business_unit = 'Haengbocake Pare'
   and cp.name in ('Salted Maple Latte', 'Salted Vanilla Latte', 'Salted Butterscotch Latte')
   and m.name = 'Nescafe Gold';
