-- Satuan bahan Haengbocake yang tidak baku dirapikan ke daftar baku (lihat src/lib/costing/unit-options.ts).
-- Hanya label: isi per kemasan dan harga tidak berubah, jadi harga per satuan pakai (dan HPP) sama persis.
-- Takaran resep memakai satuan pakai bahan (tak ada baris resep ber-satuan sendiri), sehingga arti angkanya tetap.
-- Dijalankan 2026-10-24. Nilai lama dicadangkan di zz_backup_material_units_20261024 (hapus bila sudah yakin).
--   satuan beli : gram → pack · "sak 5kg" → sak · kotak → pack · "pack 10" → pack · sachet (Kopi Nescafe) → renceng
--   satuan pakai: lembar / sachet / stick → pcs

create table if not exists public.zz_backup_material_units_20261024 as
  select id, business_unit, name, purchase_unit, usage_unit from public.costing_materials where business_unit like 'Haengbocake%';
alter table public.zz_backup_material_units_20261024 enable row level security;

update public.costing_materials m set
  purchase_unit = case
    when m.purchase_unit = 'gram' then 'pack'
    when m.purchase_unit = 'sak 5kg' then 'sak'
    when m.purchase_unit = 'kotak' then 'pack'
    when m.purchase_unit = 'pack 10' then 'pack'
    when m.purchase_unit = 'sachet' and m.name = 'Kopi Nescafe' then 'renceng'
    else m.purchase_unit
  end,
  usage_unit = case
    when m.usage_unit in ('lembar','sachet','stick') then 'pcs'
    else m.usage_unit
  end
where m.business_unit like 'Haengbocake%'
  and (m.purchase_unit in ('gram','sak 5kg','kotak','pack 10') or (m.purchase_unit = 'sachet' and m.name = 'Kopi Nescafe') or m.usage_unit in ('lembar','sachet','stick'));
