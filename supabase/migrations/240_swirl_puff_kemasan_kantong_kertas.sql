-- Swirl Puff memakai "Kemasan Kantong Kertas" (qty 1 tetap), menggantikan "Kemasan Swirl Puff".
update public.costing_recipe_items set material_id = '1e45533a-4764-466c-b40f-2e4e5b26f271'
  where id = 'c490b449-fd08-4597-8e36-350bae47ce5b'
    and exists (select 1 from public.costing_materials where id = '1e45533a-4764-466c-b40f-2e4e5b26f271' and name = 'Kemasan Kantong Kertas');
