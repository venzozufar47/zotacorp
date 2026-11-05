-- Salted Creamy Latte (Haengbocake Pare): Salted Vanilla Latte & Salted Butterscotch Latte. Resep sama persis dengan
-- Salted Maple Latte (keputusan Owner), hanya sirup rasanya yang berbeda: Sirup Maple Pondan 10 g diganti Syrup vanila /
-- Syrup butterscotch 10 ml. Resep disalin dari Salted Maple Latte supaya tetap identik. Harga mengikuti margin 50% dibulatkan
-- ke atas Rp1.000 (HPP ~Rp17.300 -> Rp35.000), varian baru di produk POS "Drinks" tanpa stok.
do $$
declare
  bu constant text := 'Haengbocake Pare';
  bank constant uuid := '947136f6-4458-40e6-9c4b-fd3a2a183a9f';
  maple uuid; maple_sirup uuid;
  pos_drinks uuid; v_sort int;
  rec record;
  p_new uuid; v_new uuid;
begin
  select id into maple from public.costing_products where business_unit = bu and name = 'Salted Maple Latte';
  select id into maple_sirup from public.costing_materials where business_unit = bu and name = 'Sirup Maple Pondan';
  if maple is null or maple_sirup is null then raise exception 'Resep Salted Maple Latte Pare tidak ditemukan'; end if;
  select id into pos_drinks from public.pos_products where bank_account_id = bank and name = 'Drinks';
  if pos_drinks is null then raise exception 'Produk POS Drinks Pare tidak ditemukan'; end if;
  select coalesce(max(sort_order), 0) + 1 into v_sort from public.pos_product_variants where product_id = pos_drinks;

  for rec in
    select * from (values ('Salted Vanilla Latte', 'Syrup vanila'), ('Salted Butterscotch Latte', 'Syrup butterscotch')) as t(menu, sirup)
  loop
    insert into public.costing_products (business_unit, name, category, type, yield_qty, price_method, target_percent, rounding_unit, rounding_mode)
      values (bu, rec.menu, 'Minuman', 'resep', 1, 'margin', 0.5, 1000, 'ceil') returning id into p_new;

    insert into public.costing_recipe_items (product_id, material_id, qty, sort_order)
    select p_new,
           case when ri.material_id = maple_sirup
                then (select id from public.costing_materials where business_unit = bu and name = rec.sirup and is_active order by created_at limit 1)
                else ri.material_id end,
           ri.qty, ri.sort_order
      from public.costing_recipe_items ri where ri.product_id = maple;

    insert into public.pos_product_variants (product_id, name, price, sort_order)
      values (pos_drinks, rec.menu, 35000, v_sort) returning id into v_new;
    v_sort := v_sort + 1;

    update public.costing_products set pos_product_id = pos_drinks, pos_variant_id = v_new where id = p_new;
  end loop;
end $$;
