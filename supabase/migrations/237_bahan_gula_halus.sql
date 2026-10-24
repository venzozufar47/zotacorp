-- Gula Halus (Pare): dibeli per kg (isi 1000 gram), dipakai gram; harga menunggu diisi owner.
insert into public.costing_materials
  (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, shrink_factor, review_status)
select 'Haengbocake Pare', 'Gula Halus', 'Gula & Pemanis', 'kg', 0, 1000, 'gram', 0, 'pending'
where not exists (select 1 from public.costing_materials where business_unit = 'Haengbocake Pare' and name = 'Gula Halus');
