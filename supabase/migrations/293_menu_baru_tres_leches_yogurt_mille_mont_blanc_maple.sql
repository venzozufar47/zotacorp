-- Menu baru Haengbocake Pare: Tres Leches, Strawberry Yogurt Millecrepes (produk POS sendiri, stok & service level
-- sendiri), Mont Blanc dan Salted Maple Latte (varian di produk "Drinks"). Plus: gabung "Kopi Nescafe" ke "Nescafe Classic".
--
-- Harga jual: Tres Leches Rp23.000 & Strawberry Yogurt Rp26.000 (ditetapkan manual oleh Owner); Mont Blanc & Salted
-- Maple Latte margin 50% dibulatkan ke atas Rp1.000 (price_method = margin). HPP tidak disimpan: dihitung dari resep.
--
-- Asumsi takaran (Owner: ikut perkiraan): 1 tsp gold coffee = 2 g, 1 tsp brown sugar = 4 g; susu evaporasi 180 ml ~ 190 g,
-- SKM 60 ml ~ 78 g; anggur muscat ~10 g/butir (5-6 butir); strawberry ~15 g/butir; 1 pencet gula cair = 5 ml.
-- Sponge Tres Leches = 1/3 batch sponge Blackforest/Matcha Strawberry (14 telur = 3 kue), gula dikurangi 30 g per kue.

-- 1. Gabung Nescafe (Pare + Semarang) -------------------------------------
do $$
declare
  bu text;
  old_id uuid;
  new_id uuid;
begin
  foreach bu in array array['Haengbocake Pare', 'Haengbocake Semarang'] loop
    select id into old_id from public.costing_materials where business_unit = bu and name = 'Kopi Nescafe';
    select id into new_id from public.costing_materials where business_unit = bu and name in ('Nesafe Classic', 'Nescafe Classic');
    if old_id is not null and new_id is not null then
      update public.costing_recipe_items set material_id = new_id where material_id = old_id;
      update public.costing_material_opname_items set material_id = new_id where material_id = old_id
        and not exists (select 1 from public.costing_material_opname_items o2
                        where o2.material_id = new_id and o2.opname_id = costing_material_opname_items.opname_id);
      update public.costing_material_receipts set material_id = new_id where material_id = old_id;
      update public.costing_material_brands set material_id = new_id where material_id = old_id;
      update public.procurement_purchase_lines set material_id = new_id where material_id = old_id;
      update public.costing_materials set is_active = false where id = old_id;
    end if;
    update public.costing_materials set name = 'Nescafe Classic' where business_unit = bu and name = 'Nesafe Classic';
  end loop;
  update public.costing_material_opname_items set material_name_snapshot = 'Nescafe Classic'
    where material_name_snapshot = 'Nesafe Classic';
end $$;

-- 2. Bahan baru + resep + POS (Pare) ---------------------------------------
do $$
declare
  bu constant text := 'Haengbocake Pare';
  bank uuid;
  p_tres uuid; p_yog uuid; p_mont uuid; p_maple uuid;
  pos_tres uuid; pos_yog uuid; pos_drinks uuid;
  v_mont uuid; v_maple uuid;
  next_sort int;
  v_sort int;
begin
  if exists (select 1 from public.costing_products where business_unit = bu and name = 'Tres Leches') then
    return;
  end if;

  select bank_account_id into bank from public.pos_products where name = 'Mille Crepes' and id = '4842d2b6-dc8f-4c68-8aeb-0573d63f70d0';
  if bank is null then raise exception 'Produk POS Mille Crepes Pare tidak ditemukan'; end if;

  -- bahan baru (belum ada) ---------------------------------------------------
  insert into public.costing_materials (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, review_status)
  select bu, v.name, v.category, v.purchase_unit, v.price, v.content, v.usage_unit, 'approved'
  from (values
    ('Sirup Maple Pondan',        'Gula & Pemanis',            'botol',  26000, 200,  'gram'),
    ('Susu Evaporasi Tiga Sapi',  'Susu & Lemak',              'kaleng', 22000, 500,  'gram'),
    ('SKM Putih Tiga Sapi',       'Susu & Lemak',              'kaleng', 20000, 500,  'gram'),
    ('Anggur Muscat',             'Buah & Kacang',             'pack',   40000, 500,  'gram'),
    ('Yogurt Cimory Squeeze',     'Susu & Lemak',              'pcs',    10000, 120,  'gram'),
    ('Kayu Manis Bubuk',          'Pengembang, Perisa & Garam','pack',   20000, 50,   'gram'),
    ('Orange Juice Diamond',      'Minuman',                   'pack',   44000, 1000, 'ml'),
    ('Nescafe Gold',              'Minuman',                   'pack',   185000,100,  'gram'),
    ('Jeruk Sunkies',             'Buah & Kacang',             'pcs',    10000, 25,   'pcs')  -- 1 jeruk = 25 gelas (serutan kulit)
  ) as v(name, category, purchase_unit, price, content, usage_unit)
  where not exists (select 1 from public.costing_materials m where m.business_unit = bu and m.name = v.name);

  -- helper: id bahan Pare menurut nama (aktif) ----------------------------------
  create or replace function pg_temp.mid(n text) returns uuid language plpgsql as $f$
  declare r uuid;
  begin
    select id into r from public.costing_materials
      where business_unit = 'Haengbocake Pare' and name = n and is_active order by created_at limit 1;
    if r is null then raise exception 'Bahan Pare tidak ditemukan: %', n; end if;
    return r;
  end $f$;

  -- produk costing ---------------------------------------------------------------
  insert into public.costing_products (business_unit, name, category, type, yield_qty, yield_unit, price_method, manual_price, target_percent, rounding_unit, rounding_mode)
    values (bu, 'Tres Leches', 'Cake', 'resep', 10, 'slice', 'manual', 23000, 0.5, 1000, 'ceil') returning id into p_tres;
  insert into public.costing_products (business_unit, name, category, type, yield_qty, yield_unit, price_method, manual_price, target_percent, rounding_unit, rounding_mode)
    values (bu, 'Strawberry Yogurt Millecrepes', 'Cake', 'resep', 10, 'slice', 'manual', 26000, 0.5, 1000, 'ceil') returning id into p_yog;
  insert into public.costing_products (business_unit, name, category, type, yield_qty, price_method, target_percent, rounding_unit, rounding_mode)
    values (bu, 'Mont Blanc', 'Minuman', 'resep', 1, 'margin', 0.5, 1000, 'ceil') returning id into p_mont;
  insert into public.costing_products (business_unit, name, category, type, yield_qty, price_method, target_percent, rounding_unit, rounding_mode)
    values (bu, 'Salted Maple Latte', 'Minuman', 'resep', 1, 'margin', 0.5, 1000, 'ceil') returning id into p_maple;

  -- resep: Tres Leches (1 kue 22 cm = 10 slice) ----------------------------------
  insert into public.costing_recipe_items (product_id, material_id, qty, sort_order) values
    (p_tres, pg_temp.mid('Telur'),                            4.6667, 0),
    (p_tres, pg_temp.mid('Tepung Terigu'),                    66.6667, 1),
    (p_tres, pg_temp.mid('Gula pasir'),                       70, 2),
    (p_tres, pg_temp.mid('Maizena'),                          16.6667, 3),
    (p_tres, pg_temp.mid('Susu Bubuk'),                       16.6667, 4),
    (p_tres, pg_temp.mid('SP 28 (sponge 28)'),                15, 5),
    (p_tres, pg_temp.mid('Margarin'),                         100, 6),
    (p_tres, pg_temp.mid('Diamond Milk'),                     180, 7),
    (p_tres, pg_temp.mid('Susu Evaporasi Tiga Sapi'),         190, 8),
    (p_tres, pg_temp.mid('SKM Putih Tiga Sapi'),              78, 9),
    (p_tres, pg_temp.mid('Whipping cream'),                   60, 10),
    (p_tres, pg_temp.mid('Strawberry'),                       105, 11),
    (p_tres, pg_temp.mid('Mangga Arum manis'),                0.5, 12),
    (p_tres, pg_temp.mid('Anggur Muscat'),                    55, 13),
    (p_tres, pg_temp.mid('Kemasan Mika Segitiga Transparan'), 10, 14),
    (p_tres, pg_temp.mid('Stiker Bulat Pink'),                10, 15);

  -- resep: Strawberry Yogurt Millecrepes (1 resep = 10 slice) ----------------------
  insert into public.costing_recipe_items (product_id, material_id, qty, sort_order) values
    (p_yog, pg_temp.mid('Telur'),                    6, 0),
    (p_yog, pg_temp.mid('Tepung Serba Guna'),        225, 1),
    (p_yog, pg_temp.mid('Gula pasir'),               105, 2),
    (p_yog, pg_temp.mid('Minyak goreng'),            105, 3),
    (p_yog, pg_temp.mid('Susu UHT Diamond'),         750, 4),
    (p_yog, pg_temp.mid('Pewarna cross Rose pink'),  2, 5),
    (p_yog, pg_temp.mid('Whipping cream'),           150, 6),  -- base luar (pinky)
    (p_yog, pg_temp.mid('Whipping cream'),           350, 7),  -- base dalam (putih)
    (p_yog, pg_temp.mid('Yogurt Cimory Squeeze'),    240, 8),  -- 2 cup x 120 g
    (p_yog, pg_temp.mid('Strawberry'),               125, 9),  -- isian
    (p_yog, pg_temp.mid('Strawberry'),               75, 10),  -- topping
    (p_yog, pg_temp.mid('Creamcheese'),              50, 11),  -- spuit topping
    (p_yog, pg_temp.mid('Kemasan Mille Crepes'),     10, 12);

  -- resep: Mont Blanc (1 gelas) ---------------------------------------------------
  insert into public.costing_recipe_items (product_id, material_id, qty, sort_order) values
    (p_mont, pg_temp.mid('Nescafe Classic'),            2, 0),
    (p_mont, pg_temp.mid('Air Galon'),                  30, 1),
    (p_mont, pg_temp.mid('Orange Juice Diamond'),       80, 2),
    (p_mont, pg_temp.mid('Es Batu'),                    60, 3),
    (p_mont, pg_temp.mid('Gula cair'),                  5, 4),
    (p_mont, pg_temp.mid('Orange Juice Diamond'),       10, 5),  -- cream
    (p_mont, pg_temp.mid('Whipping cream'),             15, 6),
    (p_mont, pg_temp.mid('Diamond Milk'),               15, 7),
    (p_mont, pg_temp.mid('Jeruk Sunkies'),              1, 8),   -- serutan kulit (1 jeruk = 25 gelas)
    (p_mont, pg_temp.mid('Garam'),                      0.2, 9),
    (p_mont, pg_temp.mid('Keju'),                       2, 10),
    (p_mont, pg_temp.mid('Kacang Almond Indomaret'),    3, 11),
    (p_mont, pg_temp.mid('Cup + Tutup Minuman'),        1, 12);

  -- resep: Salted Maple Latte (1 gelas) -------------------------------------------
  insert into public.costing_recipe_items (product_id, material_id, qty, sort_order) values
    (p_maple, pg_temp.mid('Nescafe Gold'),              6, 0),   -- 3 tsp
    (p_maple, pg_temp.mid('Dark brown sugar'),          8, 1),   -- 2 tsp
    (p_maple, pg_temp.mid('Garam'),                     0.5, 2),
    (p_maple, pg_temp.mid('Air Galon'),                 30, 3),
    (p_maple, pg_temp.mid('Whipping cream'),            15, 4),
    (p_maple, pg_temp.mid('Sirup Maple Pondan'),        10, 5),  -- 5 g cream + 5 g cup
    (p_maple, pg_temp.mid('Diamond Milk'),              75, 6),  -- 5 g cream + 70 g cup
    (p_maple, pg_temp.mid('Es Batu'),                   150, 7),
    (p_maple, pg_temp.mid('Kayu Manis Bubuk'),          0.5, 8),
    (p_maple, pg_temp.mid('Cup + Tutup Minuman'),       1, 9);

  -- POS: produk baru + varian minuman ----------------------------------------------
  select coalesce(max(sort_order), 0) + 1 into next_sort
    from public.pos_products where bank_account_id = bank and sort_order < 9000;

  insert into public.pos_products (bank_account_id, name, price, track_stock, sort_order)
    values (bank, 'Tres Leches', 23000, true, next_sort) returning id into pos_tres;
  insert into public.pos_products (bank_account_id, name, price, track_stock, sort_order)
    values (bank, 'Strawberry Yogurt Millecrepes', 26000, true, next_sort + 1) returning id into pos_yog;

  select id into pos_drinks from public.pos_products where bank_account_id = bank and name = 'Drinks';
  if pos_drinks is null then raise exception 'Produk POS Drinks Pare tidak ditemukan'; end if;
  select coalesce(max(sort_order), 0) + 1 into v_sort from public.pos_product_variants where product_id = pos_drinks;
  insert into public.pos_product_variants (product_id, name, price, sort_order)
    values (pos_drinks, 'Mont Blanc', 23000, v_sort) returning id into v_mont;
  insert into public.pos_product_variants (product_id, name, price, sort_order)
    values (pos_drinks, 'Salted Maple Latte', 35000, v_sort + 1) returning id into v_maple;

  update public.costing_products set pos_product_id = pos_tres where id = p_tres;
  update public.costing_products set pos_product_id = pos_yog  where id = p_yog;
  update public.costing_products set pos_product_id = pos_drinks, pos_variant_id = v_mont  where id = p_mont;
  update public.costing_products set pos_product_id = pos_drinks, pos_variant_id = v_maple where id = p_maple;
end $$;
