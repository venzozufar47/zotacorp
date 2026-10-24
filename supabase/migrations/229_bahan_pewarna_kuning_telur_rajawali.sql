insert into public.costing_materials
  (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, shrink_factor, review_status)
select 'Haengbocake Pare', 'Pewarna Kuning Telur Rajawali', 'Pengembang, Perisa & Garam', 'botol', 2500, 12.5, 'ml', 0, 'approved'
where not exists (select 1 from public.costing_materials where business_unit = 'Haengbocake Pare' and name = 'Pewarna Kuning Telur Rajawali');
