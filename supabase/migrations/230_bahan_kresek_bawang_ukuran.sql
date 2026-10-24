-- Kresek Bawang uk. 10/15/20/25/30: dibeli per pack isi 50 lembar, dipakai per pcs; harga menunggu diisi owner.
insert into public.costing_materials
  (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, shrink_factor, review_status)
select 'Haengbocake Pare', 'Kresek Bawang uk. ' || s, 'Kemasan & Label', 'pack', 0, 50, 'pcs', 0, 'pending'
from unnest(array['10','15','20','25','30']) s
where not exists (select 1 from public.costing_materials where business_unit = 'Haengbocake Pare' and name = 'Kresek Bawang uk. ' || s);
