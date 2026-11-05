-- Milkyberry Yakult (Haengbocake Pare): varian baru di produk POS "Drinks" (tanpa stok) dengan HPP di costing.
-- Resep per gelas (info Owner): Strawberry 2 pcs (dihitung 15 g/pcs = 30 g, perkiraan), es batu 195 g (sama dengan Black Coffee,
-- untuk cup 14 oz), gula cair 10 ml, cup + tutup 1 set, Diamond Milk 100 ml, Yakult 1 botol (Rp2.500).
-- Bahan baru: Yakult (pcs, Rp2.500). Harga POS = margin 50% dibulatkan ke atas Rp1.000 dari HPP ~Rp8.350 -> Rp17.000.
do $$
declare
  bu constant text := 'Haengbocake Pare';
  bank constant uuid := '947136f6-4458-40e6-9c4b-fd3a2a183a9f';
  pos_drinks uuid; v_sort int; v_new uuid; p_new uuid;
begin
  insert into public.costing_materials (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, review_status)
  select bu, 'Yakult', 'Minuman', 'pcs', 2500, 1, 'pcs', 'approved'
  where not exists (select 1 from public.costing_materials where business_unit = bu and name = 'Yakult');

  create or replace function pg_temp.mid(n text) returns uuid language plpgsql as $f$
  declare r uuid;
  begin
    select id into r from public.costing_materials
      where business_unit = 'Haengbocake Pare' and name = n and is_active order by created_at limit 1;
    if r is null then raise exception 'Bahan Pare tidak ditemukan: %', n; end if;
    return r;
  end $f$;

  insert into public.costing_products (business_unit, name, category, type, yield_qty, price_method, target_percent, rounding_unit, rounding_mode)
    values (bu, 'Milkyberry Yakult', 'Minuman', 'resep', 1, 'margin', 0.5, 1000, 'ceil') returning id into p_new;

  insert into public.costing_recipe_items (product_id, material_id, qty, sort_order) values
    (p_new, pg_temp.mid('Strawberry'),             30, 0),
    (p_new, pg_temp.mid('Es Batu'),                195, 1),
    (p_new, pg_temp.mid('Gula cair'),              10, 2),
    (p_new, pg_temp.mid('Diamond Milk'),           100, 3),
    (p_new, pg_temp.mid('Yakult'),                 1, 4),
    (p_new, pg_temp.mid('Cup + Tutup Minuman'),    1, 5);

  select id into pos_drinks from public.pos_products where bank_account_id = bank and name = 'Drinks';
  if pos_drinks is null then raise exception 'Produk POS Drinks Pare tidak ditemukan'; end if;
  select coalesce(max(sort_order), 0) + 1 into v_sort from public.pos_product_variants where product_id = pos_drinks;
  insert into public.pos_product_variants (product_id, name, price, sort_order)
    values (pos_drinks, 'Milkyberry Yakult', 17000, v_sort) returning id into v_new;

  update public.costing_products set pos_product_id = pos_drinks, pos_variant_id = v_new where id = p_new;
end $$;
