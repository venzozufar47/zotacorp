-- Dimensi baru "length" (satuan dasar meter) + bahan Baking Paper (pack 75 meter, harga menunggu diisi owner).
alter table public.costing_units drop constraint costing_units_dimension_check;
alter table public.costing_units add constraint costing_units_dimension_check check (dimension = any (array['mass'::text, 'volume'::text, 'count'::text, 'length'::text]));

insert into public.costing_units (code, label, dimension, to_base) values
  ('meter', 'Meter', 'length', 1),
  ('cm', 'Sentimeter', 'length', 0.01)
on conflict (code) do nothing;

insert into public.costing_materials
  (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, shrink_factor, review_status)
select 'Haengbocake Pare', 'Baking Paper', 'Kemasan & Label', 'pack', 0, 75, 'meter', 0, 'pending'
where not exists (select 1 from public.costing_materials where business_unit = 'Haengbocake Pare' and name = 'Baking Paper');
