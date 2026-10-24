-- Membatalkan 234: satuan pakai tetap baku (gram/ml/pcs/meter). Puff Pastry Pare kembali ke pcs (1 pack = 4 pcs), qty resep dipulihkan.
update public.costing_recipe_items r set qty = v.qty
  from (values
    ('e9fb0ffb-88d1-4653-a382-df13a233989f'::uuid, 1.0000::numeric),
    ('0da589a5-98f5-47a0-841c-d27a2dcc6109'::uuid, 1.0000::numeric),
    ('0babcaaf-d47e-4fbe-8e87-ae20caf5b233'::uuid, 0.1667::numeric),
    ('2bf485ed-89bc-4d8c-96c1-33edd4ef1b7c'::uuid, 0.2500::numeric)
  ) v(id, qty)
  where r.id = v.id and r.material_id = '14ed636b-cb1c-416e-9552-5f46ae66160f'
    and exists (select 1 from public.costing_materials where id = '14ed636b-cb1c-416e-9552-5f46ae66160f' and usage_unit = 'pack');

update public.costing_materials set usage_unit = 'pcs', content_per_purchase = 4, updated_at = now()
  where id = '14ed636b-cb1c-416e-9552-5f46ae66160f' and usage_unit = 'pack';

delete from public.costing_units where code = 'pack';
alter table public.costing_units drop constraint costing_units_dimension_check;
alter table public.costing_units add constraint costing_units_dimension_check check (dimension = any (array['mass'::text, 'volume'::text, 'count'::text, 'length'::text]));
