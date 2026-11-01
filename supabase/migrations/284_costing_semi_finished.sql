-- Bahan setengah jadi di costing.
--
-- Sebuah bahan (costing_materials) dapat "bersumber" dari sebuah produk costing (source_product_id): harganya tidak diisi
-- manual, melainkan mengikuti HPP produk itu (HPP per batch ÷ hasil per batch). Dengan begitu resep lain (mis. Tiramisu)
-- memakai bahan setengah jadi seperti bahan biasa dan HPP-nya ikut berubah saat harga bahan baku di resep sumbernya berubah.
-- Sinkronisasi harga dilakukan di kode (lib/costing/derived.ts) setiap kali costing dimuat.
--
-- Isi awal: "Ladyfinger (buat sendiri)" untuk Haengbocake Pare menggantikan Ladyfinger beli jadi di resep Tiramisu Pare.
-- Resep: telur 4 butir, gula pasir 125 g, tepung serbaguna 120 g => 31 pcs (icing sugar sengaja belum dimasukkan: sedikit,
-- harganya belum diisi). Tiramisu memakai 24 pcs (setara 1 pack lama). Semarang tidak diubah.

alter table public.costing_materials
  add column if not exists source_product_id uuid references public.costing_products(id) on delete restrict;

create unique index if not exists costing_materials_source_product_uidx
  on public.costing_materials (source_product_id)
  where source_product_id is not null;

comment on column public.costing_materials.source_product_id is
  'Bahan setengah jadi: harga mengikuti HPP produk costing ini (batch ÷ hasil). Harga/isi disinkronkan otomatis; jangan diedit manual.';

do $$
declare
  bu constant text := 'Haengbocake Pare';
  pid uuid;
  mid uuid;
  tiramisu uuid;
  old_mat uuid;
  telur record;
  gula record;
  tepung record;
  batch_cost numeric;
begin
  if exists (select 1 from public.costing_products where business_unit = bu and name = 'Ladyfinger (buat sendiri)') then
    return;
  end if;

  select id, purchase_price, content_per_purchase into telur from public.costing_materials where business_unit = bu and name = 'Telur';
  select id, purchase_price, content_per_purchase into gula from public.costing_materials where business_unit = bu and name = 'Gula pasir';
  select id, purchase_price, content_per_purchase into tepung from public.costing_materials where business_unit = bu and name = 'Tepung Serba Guna';
  select id into tiramisu from public.costing_products where business_unit = bu and name = 'Tiramisu';
  select id into old_mat from public.costing_materials where business_unit = bu and name = 'Ladyfinger' and source_product_id is null;
  if telur.id is null or gula.id is null or tepung.id is null or tiramisu is null or old_mat is null then
    raise exception 'Data bahan/resep Pare tidak lengkap, seed Ladyfinger (buat sendiri) dibatalkan';
  end if;

  insert into public.costing_products (business_unit, name, category, type, yield_qty, yield_unit)
    values (bu, 'Ladyfinger (buat sendiri)', 'Bahan setengah jadi', 'resep', 31, 'pcs')
    returning id into pid;

  insert into public.costing_recipe_items (product_id, material_id, qty, sort_order) values
    (pid, telur.id, 4, 0),
    (pid, gula.id, 125, 1),
    (pid, tepung.id, 120, 2);

  batch_cost := 4 * telur.purchase_price / telur.content_per_purchase
              + 125 * gula.purchase_price / gula.content_per_purchase
              + 120 * tepung.purchase_price / tepung.content_per_purchase;

  insert into public.costing_materials
    (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, source_product_id, review_status)
    values (bu, 'Ladyfinger (buat sendiri)', 'Topping & Isian', 'pack', round(batch_cost, 2), 31, 'pcs', pid, 'approved')
    returning id into mid;

  update public.costing_recipe_items
    set material_id = mid, qty = 24, unit = null
    where product_id = tiramisu and material_id = old_mat;
end $$;
