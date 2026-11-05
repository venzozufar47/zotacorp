-- Matcha Latte & Chocolate Latte (Haengbocake Pare): takaran Diamond Milk 100 ml per gelas (info Owner), sebelumnya 105 ml.
-- Semarang tidak diubah (belum ada instruksi).
update public.costing_recipe_items ri
   set qty = 100
  from public.costing_products cp, public.costing_materials m
 where ri.product_id = cp.id and ri.material_id = m.id
   and cp.business_unit = 'Haengbocake Pare'
   and cp.name in ('Matcha Latte', 'Chocolate Latte')
   and m.name = 'Diamond Milk';
