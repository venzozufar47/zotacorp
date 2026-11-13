-- Haengbocake Semarang siap soft opening (16 Nov 2026): katalog POS disamakan dengan Pare + HPP tertaut.
--  * Minuman = menu & harga Pare (nama varian, urutan, syarat level gula); HiBean & Air Mineral (R) dihapus.
--  * Tres Leches ditambah (POS + HPP). Sourdough sudah ada (Cranberry Walnut Sourdough) -> HPP ditautkan dari resep Pare.
--  * Dubai Chewy Cookie satu harga (Rp35.000) -> HPP dari resep Grade A Pare.
--  * BCB Matcha, Banana Strudel Large, Fudgy Brownies Large diaktifkan (+HPP). Mille Crepes hanya Tiramisu & Cookies & Cream.
--  * Tiramisu Rp20.000; Ladyfinger memakai bahan setengah jadi "Ladyfinger (buat sendiri)" seperti Pare.
-- Bahan baku yang belum ada di Semarang dibuat berstatus 'pending' dengan harga Pare sebagai perkiraan awal (tim pengadaan
-- Semarang perlu mengoreksi). Padanan bahan beda nama: Dried Cranberry->Cranberry, Walnuts Dry Roasted->Walnut,
-- Kacang Almond Indomaret->Almond. Pisang Pare (pcs, Rp1.000) -> Pisang Semarang (gram, Rp13), 1 pcs = 76,9231 g.

create function pg_temp.copy_recipe(p_src uuid, p_dst uuid) returns void language plpgsql as $f$
declare
  r record;
  m_dst uuid;
  q numeric;
  miss text := '';
begin
  delete from costing_recipe_items where product_id = p_dst;
  for r in
    select ri.qty, ri.sort_order, ri.unit, m.name
    from costing_recipe_items ri join costing_materials m on m.id = ri.material_id
    where ri.product_id = p_src order by ri.sort_order
  loop
    select s.id into m_dst from costing_materials s
     where s.business_unit = 'Haengbocake Semarang' and s.is_active
       and lower(trim(s.name)) = lower(trim(case r.name
             when 'Dried Cranberry' then 'Cranberry'
             when 'Walnuts Dry Roasted' then 'Walnut'
             when 'Kacang Almond Indomaret' then 'Almond'
             else r.name end));
    if m_dst is null then miss := miss || r.name || '; '; continue; end if;
    q := r.qty;
    if r.name = 'Pisang' then q := round(r.qty * 1000 / 13, 4); end if;
    insert into costing_recipe_items (product_id, material_id, qty, sort_order, unit)
    values (p_dst, m_dst, q, r.sort_order, r.unit);
  end loop;
  if miss <> '' then raise exception 'bahan tak ditemukan di Semarang: %', miss; end if;
end $f$;

create function pg_temp.new_cost(p_src uuid, p_name text, p_pos uuid, p_var uuid) returns uuid language plpgsql as $f$
declare nid uuid;
begin
  insert into costing_products
    (business_unit, name, category, type, yield_qty, yield_unit, labor, packaging, overhead_method, overhead_percent,
     overhead_nominal, price_method, target_percent, rounding_unit, rounding_mode, is_active, labor_mode, labor_rate,
     labor_hours, pos_product_id, pos_variant_id, crew_fee, transport, depreciation_per_event, manual_price)
  select 'Haengbocake Semarang', p_name, category, type, yield_qty, yield_unit, labor, packaging, overhead_method,
         overhead_percent, overhead_nominal, price_method, target_percent, rounding_unit, rounding_mode, true, labor_mode,
         labor_rate, labor_hours, p_pos, p_var, crew_fee, transport, depreciation_per_event, manual_price
  from costing_products where id = p_src
  returning id into nid;
  if nid is null then raise exception 'produk costing sumber tidak ada: %', p_name; end if;
  return nid;
end $f$;

do $$
declare
  smg constant uuid := 'a514d240-d75a-4621-8639-b445874a1b54';
  pare constant uuid := '947136f6-4458-40e6-9c4b-fd3a2a183a9f';
  bu_s constant text := 'Haengbocake Semarang';
  bu_p constant text := 'Haengbocake Pare';
  d_s uuid; d_p uuid;
  r record;
  nm text;
  cs uuid; cp uuid; vid uuid; pid uuid; pp uuid;
  n_s int; n_p int;
begin
  -- ===== Bahan baru Semarang (pending, harga Pare sebagai perkiraan) =====
  insert into costing_materials
    (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, shrink_factor,
     halal_kind, in_halal_list, review_status)
  select bu_s, m.name, m.category, m.purchase_unit, m.purchase_price, m.content_per_purchase, m.usage_unit,
         m.shrink_factor, m.halal_kind, m.in_halal_list, 'pending'
  from costing_materials m
  where m.business_unit = bu_p
    and m.name in ('Tepung Easy Sourdough', 'Anggur Muscat', 'Mangga Arum manis', 'SKM Putih Tiga Sapi',
                   'Susu Evaporasi Nestle Carnation')
    and not exists (select 1 from costing_materials s where s.business_unit = bu_s and lower(trim(s.name)) = lower(trim(m.name)));

  -- ===== Minuman: samakan dengan Pare =====
  select id into d_s from pos_products where bank_account_id = smg and name = 'Drinks';
  select id into d_p from pos_products where bank_account_id = pare and name = 'Drinks';
  if d_s is null or d_p is null then raise exception 'produk Drinks tidak ditemukan'; end if;

  update pos_product_variants set name = 'Choco Latte'        where product_id = d_s and name = 'Chocolate Latte';
  update pos_product_variants set name = 'Strawberry Lychee'  where product_id = d_s and name = 'Lychee Squash';
  update pos_product_variants set name = 'Lemonade'          where product_id = d_s and name = 'Lemon Squash';
  update pos_product_variants set name = 'Le Mineral'        where product_id = d_s and name = 'Air Mineral (S)';
  update costing_products set name = 'Choco Latte'       where business_unit = bu_s and name = 'Chocolate Latte';
  update costing_products set name = 'Strawberry Lychee' where business_unit = bu_s and name = 'Lychee Squash';
  update costing_products set name = 'Lemonade'          where business_unit = bu_s and name = 'Lemon Squash';

  -- HiBean & Air Mineral (R): belum pernah terjual / bergerak stok -> hapus.
  delete from pos_product_variants where product_id = d_s and (name like 'HiBean%' or name = 'Air Mineral (R)');

  for r in select name, price, sort_order, requires_sugar_level from pos_product_variants where product_id = d_p and active loop
    update pos_product_variants
       set price = r.price, sort_order = r.sort_order, requires_sugar_level = r.requires_sugar_level, active = true
     where product_id = d_s and name = r.name;
    if not found then
      insert into pos_product_variants (product_id, name, price, active, sort_order, requires_sugar_level)
      values (d_s, r.name, r.price, true, r.sort_order, r.requires_sugar_level);
    end if;
  end loop;
  select count(*) into n_s from pos_product_variants where product_id = d_s and active;
  select count(*) into n_p from pos_product_variants where product_id = d_p and active;
  if n_s <> n_p then raise exception 'varian Drinks aktif Semarang (%) <> Pare (%)', n_s, n_p; end if;

  -- HPP minuman: resep Pare (bahan dipetakan ke bahan Semarang).
  foreach nm in array array['Matcha Latte','Choco Latte','Black Coffee','Strawberry Lychee','Lemonade','Le Mineral','Mont Blanc',
                            'Peach Americano','Berry Americano','Salted Vanilla Latte','Salted Butterscotch Latte','Milkyberry Yakult']
  loop
    select id into cp from costing_products where business_unit = bu_p and name = nm;
    select id into vid from pos_product_variants where product_id = d_s and name = nm;
    select id into cs from costing_products where business_unit = bu_s and name = nm;
    if cp is null or vid is null then raise exception 'minuman % tak lengkap (cp=%, vid=%)', nm, cp, vid; end if;
    if cs is null then
      cs := pg_temp.new_cost(cp, nm, d_s, vid);
    else
      update costing_products set pos_product_id = d_s, pos_variant_id = vid where id = cs;
    end if;
    perform pg_temp.copy_recipe(cp, cs);
  end loop;

  -- ===== Tres Leches (POS + HPP) =====
  select id into pid from pos_products where bank_account_id = smg and name = 'Tres Leches';
  if pid is null then
    insert into pos_products
      (bank_account_id, name, price, active, sort_order, track_stock, stock_aggregate_variants, is_open_price, notes,
       requires_sugar_level, stock_only, not_for_sale)
    select smg, name, price, true, sort_order, track_stock, stock_aggregate_variants, is_open_price, notes,
           requires_sugar_level, stock_only, not_for_sale
    from pos_products where bank_account_id = pare and name = 'Tres Leches'
    returning id into pid;
  end if;
  select id into cp from costing_products where business_unit = bu_p and name = 'Tres Leches';
  cs := pg_temp.new_cost(cp, 'Tres Leches', pid, null);
  perform pg_temp.copy_recipe(cp, cs);

  -- ===== Sourdough (produk POS Semarang = Cranberry Walnut Sourdough) =====
  select id into pid from pos_products where bank_account_id = smg and name = 'Cranberry Walnut Sourdough';
  select id into cp from costing_products where business_unit = bu_p and name = 'Sourdough';
  cs := pg_temp.new_cost(cp, 'Sourdough', pid, null);
  perform pg_temp.copy_recipe(cp, cs);

  -- ===== Dubai Chewy Cookie: satu harga Rp35.000, resep Grade A =====
  select id into pid from pos_products where bank_account_id = smg and name = 'Dubai Chewy Cookie';
  select id into cp from costing_products where business_unit = bu_p and name = 'Dubai Chewy Cookie (Grade A)';
  cs := pg_temp.new_cost(cp, 'Dubai Chewy Cookie', pid, null);
  update costing_products set price_method = 'manual', manual_price = 35000 where id = cs;
  perform pg_temp.copy_recipe(cp, cs);

  -- ===== Aktifkan menu nonaktif + HPP-nya =====
  update pos_products set active = true where bank_account_id = smg and name = 'BCB Matcha';

  select id into pid from pos_products where bank_account_id = smg and name = 'Banana Strudel';
  update pos_product_variants set active = true where product_id = pid and name = 'Large' returning id into vid;
  select id into cp from costing_products where business_unit = bu_p and name = 'Banana Strudel - Large';
  cs := pg_temp.new_cost(cp, 'Banana Strudel - Large', pid, vid);
  update costing_products set manual_price = 40000, price_method = 'manual' where id = cs;
  perform pg_temp.copy_recipe(cp, cs);

  select id into pid from pos_products where bank_account_id = smg and name = 'Fudgy Brownies';
  update pos_product_variants set active = true where product_id = pid and name = 'Large' returning id into vid;
  select id into cp from costing_products where business_unit = bu_p and name = 'Fudgy Brownies Large';
  cs := pg_temp.new_cost(cp, 'Fudgy Brownies Large', pid, vid);
  update costing_products set manual_price = 60000, price_method = 'manual' where id = cs;
  perform pg_temp.copy_recipe(cp, cs);

  -- ===== Mille Crepes: hanya dua varian =====
  select id into pid from pos_products where bank_account_id = smg and name = 'Mille Crepes';
  update pos_product_variants set active = (name in ('Tiramisu', 'Cookies & Cream')) where product_id = pid;

  -- ===== Tiramisu Rp20.000 + Ladyfinger setengah jadi =====
  update pos_products set price = 20000 where bank_account_id = smg and name = 'Tiramisu';
  update costing_products set manual_price = 20000 where business_unit = bu_s and name = 'Tiramisu';

  select id into cp from costing_products where business_unit = bu_p and name = 'Ladyfinger (buat sendiri)';
  cs := pg_temp.new_cost(cp, 'Ladyfinger (buat sendiri)', null, null);
  perform pg_temp.copy_recipe(cp, cs);

  insert into costing_materials
    (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, shrink_factor,
     halal_kind, in_halal_list, review_status, source_product_id)
  select bu_s, m.name, m.category, m.purchase_unit,
         (select round(sum(mm.purchase_price / nullif(mm.content_per_purchase, 0) * ri.qty), 2)
            from costing_recipe_items ri join costing_materials mm on mm.id = ri.material_id where ri.product_id = cs),
         m.content_per_purchase, m.usage_unit, m.shrink_factor, m.halal_kind, m.in_halal_list, 'approved', cs
  from costing_materials m where m.business_unit = bu_p and m.name = 'Ladyfinger (buat sendiri)';

  select id into cs from costing_products where business_unit = bu_s and name = 'Tiramisu';
  select id into vid from costing_materials where business_unit = bu_s and name = 'Ladyfinger (buat sendiri)';
  update costing_recipe_items set material_id = vid, qty = 24
   where product_id = cs
     and material_id = (select id from costing_materials where business_unit = bu_s and name = 'Ladyfinger');
  if not found then raise exception 'baris Ladyfinger di resep Tiramisu Semarang tidak ditemukan'; end if;
end $$;
