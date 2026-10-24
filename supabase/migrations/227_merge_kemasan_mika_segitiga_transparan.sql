-- Gabung 3 kemasan identik (pcs, Rp1.750/pcs, Haengbocake Pare) jadi satu bahan HPP.
-- Survivor = "Kemasan Red Velvet" (23421b29-...), diganti nama. Dua lainnya (Blackforest 5c51e7d4-...,
-- Matcha Strawberry Cake 3bac8c80-...) dipindahkan referensi resepnya lalu dihapus. Harga/satuan sama -> HPP tak berubah.
update public.costing_materials
  set name = 'Kemasan Mika Segitiga Transparan', updated_at = now()
  where id = '23421b29-e86d-4c36-9730-6eb957dc06fa' and business_unit = 'Haengbocake Pare' and name = 'Kemasan Red Velvet';

update public.costing_recipe_items
  set material_id = '23421b29-e86d-4c36-9730-6eb957dc06fa'
  where id in ('f7c6e74f-0931-49a0-8745-6f9702fd143f', '21cc5f36-9a26-4bbf-b015-bfc626b7cf93')
    and material_id in ('5c51e7d4-78d0-4790-a30c-03ac86c4303d', '3bac8c80-1cd7-4e5d-a20d-5b5cc22f99fa');

delete from public.costing_materials
  where id in ('5c51e7d4-78d0-4790-a30c-03ac86c4303d', '3bac8c80-1cd7-4e5d-a20d-5b5cc22f99fa')
    and not exists (select 1 from public.costing_recipe_items r where r.material_id = costing_materials.id);
