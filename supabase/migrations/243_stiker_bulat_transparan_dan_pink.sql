-- Stiker Bulat Transparan: spesifikasi disalin dari Stiker Bulat (pcs, Rp450); lalu Stiker Bulat diganti nama jadi Stiker Bulat Pink.
insert into public.costing_materials
  (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, shrink_factor, review_status)
select business_unit, 'Stiker Bulat Transparan', category, purchase_unit, purchase_price, content_per_purchase, usage_unit, shrink_factor, 'approved'
from public.costing_materials
where id = '47cb093b-8f48-4f52-bb04-d6311351a3d5' and name = 'Stiker Bulat'
  and not exists (select 1 from public.costing_materials where business_unit = 'Haengbocake Pare' and name = 'Stiker Bulat Transparan');

update public.costing_materials set name = 'Stiker Bulat Pink', updated_at = now()
  where id = '47cb093b-8f48-4f52-bb04-d6311351a3d5' and business_unit = 'Haengbocake Pare' and name = 'Stiker Bulat';
