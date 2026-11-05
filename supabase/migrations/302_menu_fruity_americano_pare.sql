-- Fruity Americano (Haengbocake Pare): Peach Americano & Berry Americano. Dua varian baru di produk POS "Drinks"
-- (tanpa stok, seperti minuman lain), masing-masing dengan HPP di costing dan harga manual Rp14.000 (keputusan Owner).
-- Resep dasar = Black Coffee (es 195 g, air 224 ml, Nescafe Classic 2 sachet = 4 g, cup + tutup) + gula cair 10 ml,
-- lalu Peach: Syrup delifru peach 20 ml; Berry: Berry Juice Diamond 80 gr (dihitung 80 ml). Air Berry tidak dikurangi.
-- Bahan baru: Berry Juice Diamond (Rp44.000 per 1 liter).
do $$
declare
  bu constant text := 'Haengbocake Pare';
  bank constant uuid := '947136f6-4458-40e6-9c4b-fd3a2a183a9f';
  pos_drinks uuid;
  v_sort int;
  v_peach uuid; v_berry uuid;
  p_peach uuid; p_berry uuid;
begin
  insert into public.costing_materials (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, review_status)
  select bu, 'Berry Juice Diamond', 'Minuman', 'pack', 44000, 1000, 'ml', 'approved'
  where not exists (select 1 from public.costing_materials where business_unit = bu and name = 'Berry Juice Diamond');

  create or replace function pg_temp.mid(n text) returns uuid language plpgsql as $f$
  declare r uuid;
  begin
    select id into r from public.costing_materials
      where business_unit = 'Haengbocake Pare' and name = n and is_active order by created_at limit 1;
    if r is null then raise exception 'Bahan Pare tidak ditemukan: %', n; end if;
    return r;
  end $f$;

  insert into public.costing_products (business_unit, name, category, type, yield_qty, price_method, manual_price, target_percent, rounding_unit, rounding_mode)
    values (bu, 'Peach Americano', 'Minuman', 'resep', 1, 'manual', 14000, 0.5, 1000, 'ceil') returning id into p_peach;
  insert into public.costing_products (business_unit, name, category, type, yield_qty, price_method, manual_price, target_percent, rounding_unit, rounding_mode)
    values (bu, 'Berry Americano', 'Minuman', 'resep', 1, 'manual', 14000, 0.5, 1000, 'ceil') returning id into p_berry;

  insert into public.costing_recipe_items (product_id, material_id, qty, sort_order) values
    (p_peach, pg_temp.mid('Es Batu'),              195, 0),
    (p_peach, pg_temp.mid('Air Galon'),            224, 1),
    (p_peach, pg_temp.mid('Nescafe Classic'),      2, 2),
    (p_peach, pg_temp.mid('Gula cair'),            10, 3),
    (p_peach, pg_temp.mid('Syrup delifru peach'),  20, 4),
    (p_peach, pg_temp.mid('Cup + Tutup Minuman'),  1, 5),
    (p_berry, pg_temp.mid('Es Batu'),              195, 0),
    (p_berry, pg_temp.mid('Air Galon'),            224, 1),
    (p_berry, pg_temp.mid('Nescafe Classic'),      2, 2),
    (p_berry, pg_temp.mid('Gula cair'),            10, 3),
    (p_berry, pg_temp.mid('Berry Juice Diamond'),  80, 4),
    (p_berry, pg_temp.mid('Cup + Tutup Minuman'),  1, 5);

  select id into pos_drinks from public.pos_products where bank_account_id = bank and name = 'Drinks';
  if pos_drinks is null then raise exception 'Produk POS Drinks Pare tidak ditemukan'; end if;
  select coalesce(max(sort_order), 0) + 1 into v_sort from public.pos_product_variants where product_id = pos_drinks;

  insert into public.pos_product_variants (product_id, name, price, sort_order)
    values (pos_drinks, 'Peach Americano', 14000, v_sort) returning id into v_peach;
  insert into public.pos_product_variants (product_id, name, price, sort_order)
    values (pos_drinks, 'Berry Americano', 14000, v_sort + 1) returning id into v_berry;

  update public.costing_products set pos_product_id = pos_drinks, pos_variant_id = v_peach where id = p_peach;
  update public.costing_products set pos_product_id = pos_drinks, pos_variant_id = v_berry where id = p_berry;
end $$;
