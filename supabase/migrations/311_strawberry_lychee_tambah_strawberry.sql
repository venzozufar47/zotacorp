-- Strawberry Lychee (Haengbocake Pare) kini memakai Strawberry 2 pcs per gelas (info Owner). Sebelumnya resep hanya sirup leci,
-- padahal namanya menjanjikan stroberi. Takaran mengikuti Milkyberry Yakult: 2 pcs dihitung 15 g/pcs = 30 g (perkiraan).
-- Harga jual POS tidak diubah (Rp12.000); HPP naik sesuai harga Strawberry. Idempoten: tidak menambah kalau baris sudah ada.
insert into public.costing_recipe_items (product_id, material_id, qty, sort_order)
select cp.id, m.id, 30,
       coalesce((select max(sort_order) from public.costing_recipe_items where product_id = cp.id), -1) + 1
  from public.costing_products cp
  join public.costing_materials m
    on m.business_unit = 'Haengbocake Pare' and m.name = 'Strawberry' and m.is_active
 where cp.business_unit = 'Haengbocake Pare'
   and cp.name = 'Strawberry Lychee'
   and not exists (
     select 1 from public.costing_recipe_items ri
      where ri.product_id = cp.id and ri.material_id = m.id
   );
