-- Rapikan daftar bahan Haengbocake Pare (hasil evaluasi 2026-11-07). Hanya Pare; Semarang tidak disentuh.
--  1. Duplikat input pengadaan digabung ke bahan yang sudah ada (pembelian dipindah, bukan hilang).
--  2. Barang non-resep (kresek, sabun, tisu, sarung tangan, sendok teh) bukan bahan: baris nota lamanya diubah
--     menjadi baris "lain" kategori Office Supplies (kas ikut: COGS -> Office Supplies), lalu bahannya dihapus.
--  3. Bahan yang masih tanpa kategori diberi kategori dari 12 kategori baku (migrasi 223).
-- Cadangan baris yang diubah/dihapus: zz_backup_pare_bahan_20261107_* (hapus bila sudah yakin).
-- Semua statement kas yang tersentuh berstatus draft.

create table if not exists public.zz_backup_pare_bahan_20261107_materials as
  select * from public.costing_materials
  where business_unit = 'Haengbocake Pare'
    and name in ('Gula (cair)', 'Iching sugar', 'Filing strawbery', 'Colatta Dark White Compund',
                 'Sabun cuci piring', 'Sarung tangan latex S', 'Tissue gantung', 'Tisue kecil', 'Sendok teh transpara',
                 'Kresek hitam putih', 'Kresek macan 15', 'Kresek Qonaah', 'Kresek uji coba',
                 'Kresek Bawang uk. 10', 'Kresek Bawang uk. 15', 'Kresek Bawang uk. 20', 'Kresek Bawang uk. 25', 'Kresek Bawang uk. 30');
alter table public.zz_backup_pare_bahan_20261107_materials enable row level security;

create table if not exists public.zz_backup_pare_bahan_20261107_lines as
  select l.* from public.procurement_purchase_lines l
  where l.material_id in (select id from public.zz_backup_pare_bahan_20261107_materials);
alter table public.zz_backup_pare_bahan_20261107_lines enable row level security;

create table if not exists public.zz_backup_pare_bahan_20261107_receipts as
  select r.* from public.costing_material_receipts r
  where r.material_id in (select id from public.zz_backup_pare_bahan_20261107_materials);
alter table public.zz_backup_pare_bahan_20261107_receipts enable row level security;

create table if not exists public.zz_backup_pare_bahan_20261107_txs as
  select t.* from public.cashflow_transactions t
  where t.id in (select cashflow_transaction_id from public.zz_backup_pare_bahan_20261107_lines where cashflow_transaction_id is not null);
alter table public.zz_backup_pare_bahan_20261107_txs enable row level security;

create table if not exists public.zz_backup_pare_bahan_20261107_recipe_items as
  select i.* from public.costing_recipe_items i
  where i.material_id in (select id from public.zz_backup_pare_bahan_20261107_materials);
alter table public.zz_backup_pare_bahan_20261107_recipe_items enable row level security;

create table if not exists public.zz_backup_pare_bahan_20261107_categories as
  select id, name, category from public.costing_materials where business_unit = 'Haengbocake Pare';
alter table public.zz_backup_pare_bahan_20261107_categories enable row level security;

do $$
declare
  bu constant text := 'Haengbocake Pare';
  gula_cair uuid;  gula_halus uuid;
  gula_cair_dup uuid;  iching uuid;
  new_price numeric;
begin
  select id into gula_cair from public.costing_materials where business_unit = bu and name = 'Gula cair';
  select id into gula_halus from public.costing_materials where business_unit = bu and name = 'Gula Halus';
  select id into gula_cair_dup from public.costing_materials where business_unit = bu and name = 'Gula (cair)';
  select id into iching from public.costing_materials where business_unit = bu and name = 'Iching sugar';

  -- 1a. Gula (cair) -> Gula cair. Dibeli "500 gram" padahal Gula cair bersatuan ml: dicatat 500 ml (0,5 botol).
  if gula_cair is not null and gula_cair_dup is not null then
    update public.costing_material_receipts set
      material_id = gula_cair, qty_purchase_units = 0.5, content_per_purchase_snapshot = 1000,
      qty_usage_units = 500, unit_price_paid = 17800
    where material_id = gula_cair_dup;
    update public.procurement_purchase_lines set
      material_id = gula_cair, unit_input = 'ml', qty_purchase_units = 0.5, qty_usage_units = 500,
      unit_price_usage = 17.8, description = 'Beli Gula cair 500 ml',
      ref_price_before = (select purchase_price from public.costing_materials where id = gula_cair),
      ref_price_after = (select purchase_price from public.costing_materials where id = gula_cair)
    where material_id = gula_cair_dup;
    update public.cashflow_transactions set description = 'Beli Gula cair 500 ml'
    where id in (select cashflow_transaction_id from public.zz_backup_pare_bahan_20261107_lines
                 where material_id = gula_cair_dup and cashflow_transaction_id is not null);
    delete from public.costing_materials where id = gula_cair_dup;
  end if;

  -- 1b. Iching sugar -> Gula Halus. Nota salah isi ("1 gram"); sebenarnya 1 bungkus 425 g seharga Rp 26.890,
  --     jadi harga acuan Gula Halus (sebelumnya Rp 0) = 26.890 / 0,425 kg.
  if gula_halus is not null and iching is not null then
    new_price := round(26890 / 0.425, 2);
    update public.costing_material_receipts set
      material_id = gula_halus, qty_purchase_units = 0.425, content_per_purchase_snapshot = 1000,
      qty_usage_units = 425, unit_price_paid = new_price
    where material_id = iching;
    update public.procurement_purchase_lines set
      material_id = gula_halus, qty_input = 425, unit_input = 'gram', qty_purchase_units = 0.425, qty_usage_units = 425,
      unit_price_usage = round(26890 / 425.0, 6), description = 'Beli Gula Halus 425 gram',
      ref_price_before = 0, ref_price_after = new_price
    where material_id = iching;
    update public.costing_materials set purchase_price = new_price, price_updated_at = now() where id = gula_halus;
    insert into public.costing_material_price_history (material_id, purchase_price, content_per_purchase)
      values (gula_halus, new_price, 1000);
    delete from public.costing_materials where id = iching;
  end if;
end $$;

-- 1c. Duplikat tanpa riwayat apa pun (ejaan salah / bahan kembar nonaktif).
delete from public.costing_materials m
where m.business_unit = 'Haengbocake Pare'
  and m.name in ('Filing strawbery', 'Colatta Dark White Compund')
  and not exists (select 1 from public.costing_recipe_items r where r.material_id = m.id)
  and not exists (select 1 from public.procurement_purchase_lines l where l.material_id = m.id);

update public.costing_materials set name = 'Filling strawberry'
where business_unit = 'Haengbocake Pare' and name = 'Filling strawbery';

-- 2. Non-bahan -> baris pembelian "lain" (Office Supplies).
create temporary table _nonbahan on commit drop as
  select id from public.costing_materials
  where business_unit = 'Haengbocake Pare'
    and name in ('Sabun cuci piring', 'Sarung tangan latex S', 'Tissue gantung', 'Tisue kecil', 'Sendok teh transpara',
                 'Kresek hitam putih', 'Kresek macan 15', 'Kresek Qonaah', 'Kresek uji coba',
                 'Kresek Bawang uk. 10', 'Kresek Bawang uk. 15', 'Kresek Bawang uk. 20', 'Kresek Bawang uk. 25', 'Kresek Bawang uk. 30');

-- Kas: kategori transaksi ikut pindah dari COGS ke Office Supplies.
update public.cashflow_transactions set category = 'Office Supplies'
where id in (select cashflow_transaction_id from public.procurement_purchase_lines
             where material_id in (select id from _nonbahan) and cashflow_transaction_id is not null);

-- Lepas tautan baris <-> barang masuk, lalu hapus barang masuk (barang habis pakai tidak distok/opname).
update public.procurement_purchase_lines set receipt_id = null where material_id in (select id from _nonbahan);
delete from public.costing_material_receipts where material_id in (select id from _nonbahan);

update public.procurement_purchase_lines set
  kind = 'lain', category = 'Office Supplies', material_id = null, brand_id = null,
  qty_input = null, unit_input = null, qty_purchase_units = null, qty_usage_units = null, unit_price_usage = null,
  ref_price_before = null, ref_price_after = null, price_flag = 'ok'
where material_id in (select id from _nonbahan);

delete from public.costing_recipe_items where material_id in (select id from _nonbahan);
delete from public.costing_material_brands where material_id in (select id from _nonbahan);
delete from public.costing_materials where id in (select id from _nonbahan);

-- 3. Kategori bahan Pare yang masih kosong.
update public.costing_materials m set category = case
  when m.name in ('Kacang Almond Indomaret', 'Walnuts Dry Roasted', 'Mangga Arum manis', 'Lemon') then 'Buah & Kacang'
  when m.name in ('Chococip elmer coklat', 'Chococip lancip chefmate', 'Collata Dark Milk Compund', 'Colatta Dark White Compund') then 'Coklat & Kakao'
  when m.name in ('Collin Chococrunchy(croisant)', 'Filling strawberry', 'Fillling coklat', 'La kreiva Crumble oreo',
                  'Pocky Cookies N Cream', 'Dried Cranberry') then 'Topping & Isian'
  when m.name = 'Tepung puratos S 500' then 'Tepung & Pati'
  when m.name in ('Syrup butterscotch', 'Syrup delifru peach', 'Syrup vanila', 'Nescafe botol', 'Carlo') then 'Minuman'
  when m.name in ('Pewarna cross Rose pink', 'Pewarna coklat tua', 'Pewarna Hitam Rajawali') then 'Pengembang, Perisa & Garam'
  when m.name in ('Kotak kue mika 24 cm putih', 'Pack kardus(30 cm)', 'Paping bag kecil', 'Thinwal square 120 ml') then 'Kemasan & Label'
  else m.category
end
where m.business_unit = 'Haengbocake Pare' and (m.category is null or btrim(m.category) = '');
