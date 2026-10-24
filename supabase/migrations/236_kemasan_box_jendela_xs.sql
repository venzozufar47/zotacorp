-- "Kemasan Fruit Puff" (Rp1.500/pcs) diganti nama jadi "Kemasan Box Jendela XS" dan dipakai juga oleh
-- Burnt Cheesecake, Burnt Cheesecake Brownies (BCB), BCB Matcha, Fudgy Brownies Small (qty resep tetap).
update public.costing_materials set name = 'Kemasan Box Jendela XS', updated_at = now()
  where id = 'ce29ec4f-9fbe-4f99-b95e-5ca2276bc1de' and business_unit = 'Haengbocake Pare' and name = 'Kemasan Fruit Puff';

update public.costing_recipe_items set material_id = 'ce29ec4f-9fbe-4f99-b95e-5ca2276bc1de'
  where id in (
    'f8051634-86ee-4a1f-9ba8-9eebaf9c1050',  -- Burnt Cheesecake
    '8da25dc8-0eca-4c7b-b150-6c12757e2047',  -- Burnt Cheesecake Brownies
    '5616daa6-c2a3-41d7-802a-20a08de9f351',  -- BCB Matcha
    'a624d0d2-f17e-44a8-915c-82bc044247cf'   -- Fudgy Brownies Small
  )
  and exists (select 1 from public.costing_materials where id = 'ce29ec4f-9fbe-4f99-b95e-5ca2276bc1de' and name = 'Kemasan Box Jendela XS');
