-- Haengbocake Pare: bahan "Mentega" (pack 200 g, Rp9.000) identik dengan "Margarin"; resep dialihkan ke Margarin lalu Mentega dihapus.
update public.costing_recipe_items
  set material_id = '0a278d60-6ad4-4c65-8cf8-e7e73daeec51'
  where material_id = 'b492316a-8857-42f9-9bb9-49a69c91a745'
    and exists (select 1 from public.costing_materials where id = 'b492316a-8857-42f9-9bb9-49a69c91a745' and business_unit = 'Haengbocake Pare' and name = 'Mentega');

delete from public.costing_materials
  where id = 'b492316a-8857-42f9-9bb9-49a69c91a745' and business_unit = 'Haengbocake Pare' and name = 'Mentega'
    and not exists (select 1 from public.costing_recipe_items r where r.material_id = costing_materials.id);
