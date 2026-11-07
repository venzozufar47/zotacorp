-- Resep baru Salt Bread (1 resep = 26 pcs) & Sourdough (1 resep = 16 pcs), Haengbocake Pare.
-- Bahan baru: Tepung Easy Sourdough (sak 5 kg, Rp 530.000). Bahan lain memakai yang sudah ada.
-- Harga jual mengikuti POS (Rp 15.000), produk costing ditautkan ke produk POS Pare.

do $$
declare
  bu constant text := 'Haengbocake Pare';
  p_salt constant uuid := '259ac72e-19f0-40f3-839b-a826bcb7448f';
  p_sour constant uuid := 'acd5d096-6f2a-42af-9c45-0ac172776e15';
  pos_salt constant uuid := '93be68b2-1088-45c3-9a45-7baececffd75';
  pos_sour constant uuid := '3318933c-cbf9-448f-a314-2b253efa6305';
  m_easy uuid;
  m uuid;
begin
  select id into m_easy from costing_materials
   where business_unit = bu and name = 'Tepung Easy Sourdough';
  if m_easy is null then
    insert into costing_materials
      (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit)
    values
      (bu, 'Tepung Easy Sourdough', 'Tepung & Pati', 'sak', 530000, 5000, 'gram')
    returning id into m_easy;
  end if;

  delete from costing_recipe_items where product_id in (p_salt, p_sour);

  -- Salt Bread: 26 pcs
  insert into costing_recipe_items (product_id, material_id, qty, sort_order)
  select p_salt, mat.id, v.qty, v.ord
  from (values
    ('Tepung pro+ (cakra kembar)', 800, 0),
    ('Air Galon',                  560, 1),
    ('Ragi',                        10, 2),
    ('Gula pasir',                  60, 3),
    ('Unsalted Butter',             30, 4),
    ('Salted Butter',              200, 5),
    ('Kemasan Salt Bread',          26, 6)
  ) as v(name, qty, ord)
  join costing_materials mat on mat.business_unit = bu and mat.name = v.name;

  -- Sourdough: 16 pcs
  insert into costing_recipe_items (product_id, material_id, qty, sort_order)
  select p_sour, mat.id, v.qty, v.ord
  from (values
    ('Tepung pro+ (cakra kembar)', 800, 0),
    ('Air Galon',                  780, 1),
    ('Ragi',                         6, 2),
    ('Gula pasir',                  50, 3),
    ('Salted Butter',               50, 4),
    ('Tepung Easy Sourdough',      200, 5),
    ('Walnuts Dry Roasted',         80, 6),
    ('Dried Cranberry',            120, 7)
  ) as v(name, qty, ord)
  join costing_materials mat on mat.business_unit = bu and mat.name = v.name;

  update costing_products
     set yield_qty = 26, price_method = 'manual', manual_price = 15000, pos_product_id = pos_salt
   where id = p_salt;
  update costing_products
     set yield_qty = 16, price_method = 'manual', manual_price = 15000, pos_product_id = pos_sour
   where id = p_sour;

  -- Sanity: jumlah baris sesuai (7 + 8).
  if (select count(*) from costing_recipe_items where product_id = p_salt) <> 7
     or (select count(*) from costing_recipe_items where product_id = p_sour) <> 8 then
    raise exception 'jumlah bahan resep tidak sesuai (ada nama bahan yang tidak ketemu)';
  end if;
end $$;
