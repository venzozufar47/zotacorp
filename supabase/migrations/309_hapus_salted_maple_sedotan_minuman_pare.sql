-- (1) Salted Maple Latte (Pare) tidak jadi dijual: dihapus dari POS dan costing. Belum pernah terjual / punya stok / snapshot HPP,
-- jadi aman dihapus penuh. Bahan Sirup Maple Pondan, Kayu Manis Bubuk, Nescafe Gold dibiarkan di daftar bahan.
-- (2) Sedotan plastik masuk resep minuman gelas Pare (info Owner): bahan baru "Sedotan Plastik Kecil" (Rp34.000 per 500 pcs) dan
-- "Sedotan Plastik Besar (Boba)" (Rp48.000 per 250 pcs). Boba: Lychee Squash & Milkyberry Yakult. Kecil: semua minuman gelas lain.
-- Air Mineral (Le Minerale) tanpa sedotan. Semarang tidak diubah.
do $$
declare
  bu constant text := 'Haengbocake Pare';
  rec record;
begin
  delete from public.costing_products where business_unit = bu and name = 'Salted Maple Latte';
  delete from public.pos_product_variants
   where name = 'Salted Maple Latte'
     and product_id = (select id from public.pos_products where name = 'Drinks' and bank_account_id = '947136f6-4458-40e6-9c4b-fd3a2a183a9f');

  insert into public.costing_materials (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, review_status)
  select bu, v.name, 'Kemasan & Label', 'pack', v.price, v.content, 'pcs', 'approved'
    from (values ('Sedotan Plastik Kecil', 34000, 500), ('Sedotan Plastik Besar (Boba)', 48000, 250)) as v(name, price, content)
   where not exists (select 1 from public.costing_materials m where m.business_unit = bu and m.name = v.name);

  for rec in
    select cp.id, cp.name,
           (select coalesce(max(sort_order), 0) + 1 from public.costing_recipe_items where product_id = cp.id) as next_sort
      from public.costing_products cp
     where cp.business_unit = bu
       and cp.name in ('Black Coffee', 'Mont Blanc', 'Peach Americano', 'Berry Americano', 'Salted Vanilla Latte',
                       'Salted Butterscotch Latte', 'Lemon Squash', 'Matcha Latte', 'Chocolate Latte',
                       'Lychee Squash', 'Milkyberry Yakult')
  loop
    insert into public.costing_recipe_items (product_id, material_id, qty, sort_order)
    select rec.id,
           (select id from public.costing_materials
             where business_unit = bu and is_active
               and name = case when rec.name in ('Lychee Squash', 'Milkyberry Yakult')
                               then 'Sedotan Plastik Besar (Boba)' else 'Sedotan Plastik Kecil' end
             order by created_at limit 1),
           1, rec.next_sort;
  end loop;
end $$;
