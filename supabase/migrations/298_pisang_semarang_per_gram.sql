-- Pisang (Haengbocake Semarang) dibeli per kg dengan jumlah buah tidak tentu, jadi satuan pakai diganti dari pcs ke gram
-- (sebelumnya nota "10 kg" gagal: "Jumlah/satuan Pisang tidak bisa dikonversi"). Acuan konversi: 13 pcs per kg
-- (Rp1.000/pcs = Rp13.000/kg), sehingga 1 pcs = 1000/13 gram dan HPP tidak berubah.
-- Data pcs lama ikut dikonversi: resep Banana Strudel - Small (18 pcs) dan 1 baris opname (11 pcs).
-- Pare tidak diubah.
do $$
declare
  mid uuid;
  gram_per_pcs numeric := 1000.0 / 13;
begin
  select id into mid from public.costing_materials
   where business_unit = 'Haengbocake Semarang' and name = 'Pisang'
     and usage_unit = 'pcs';
  if mid is null then
    return;
  end if;

  update public.costing_recipe_items
     set qty = round(qty * gram_per_pcs, 4)
   where material_id = mid;

  update public.costing_material_opname_items
     set physical_qty = round(physical_qty * gram_per_pcs, 4),
         expected_qty = round(expected_qty * gram_per_pcs, 4),
         unit_cost_snapshot = round(unit_cost_snapshot / gram_per_pcs, 6),
         usage_unit_snapshot = 'gram'
   where material_id = mid;

  update public.costing_materials
     set purchase_unit = 'kg', content_per_purchase = 1000, purchase_price = 13000, usage_unit = 'gram'
   where id = mid;
end $$;
