-- Stiker Bulat Dubai: spesifikasi sama dengan Stiker Bulat (pcs, Rp450). Stiker Logotype diganti nama.
insert into public.costing_materials
  (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, shrink_factor, review_status)
select business_unit, 'Stiker Bulat Dubai', category, purchase_unit, purchase_price, content_per_purchase, usage_unit, shrink_factor, 'approved'
from public.costing_materials
where id = '47cb093b-8f48-4f52-bb04-d6311351a3d5' and name = 'Stiker Bulat'
  and not exists (select 1 from public.costing_materials where business_unit = 'Haengbocake Pare' and name = 'Stiker Bulat Dubai');

update public.costing_materials set name = 'Stiker Panjang Transparan', updated_at = now()
  where id = '8ab32453-184a-483e-9104-3574cbdfa8cf' and business_unit = 'Haengbocake Pare' and name = 'Stiker Logotype';
