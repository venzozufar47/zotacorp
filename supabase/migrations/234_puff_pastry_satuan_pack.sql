-- Satuan pakai "pack" (dimensi sendiri, tak bisa dikonversi ke pcs). Puff Pastry Pare: pakai per pack (isi 1);
-- qty resep dibagi 4 (dulu pcs, 1 pack = 4 pcs) sehingga HPP tetap.
alter table public.costing_units drop constraint costing_units_dimension_check;
alter table public.costing_units add constraint costing_units_dimension_check check (dimension = any (array['mass'::text, 'volume'::text, 'count'::text, 'length'::text, 'pack'::text]));
insert into public.costing_units (code, label, dimension, to_base) values ('pack', 'Pack', 'pack', 1) on conflict (code) do nothing;

update public.costing_recipe_items set qty = qty / 4
  where material_id = '14ed636b-cb1c-416e-9552-5f46ae66160f' and unit is null
    and exists (select 1 from public.costing_materials where id = '14ed636b-cb1c-416e-9552-5f46ae66160f' and usage_unit = 'pcs' and content_per_purchase = 4);

update public.costing_materials set usage_unit = 'pack', content_per_purchase = 1, updated_at = now()
  where id = '14ed636b-cb1c-416e-9552-5f46ae66160f' and usage_unit = 'pcs' and content_per_purchase = 4;
