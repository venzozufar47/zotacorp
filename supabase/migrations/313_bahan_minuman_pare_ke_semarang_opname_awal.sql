-- Bahan resep minuman Haengbocake Pare yang belum ada di Haengbocake Semarang disalin ke Semarang (satuan, isi, harga beli, status
-- review mengikuti Pare; harga bisa dikoreksi tim Semarang), lalu dicatat sebagai opname awal berjumlah 0 supaya muncul di daftar
-- opname. Bahan yang sudah ada di Semarang (16 bahan, mis. Air Galon, Es Batu, Diamond Milk, Nescafe Classic, Strawberry) tidak disentuh.
-- 'Kacang Almond Indomaret' (Pare) dianggap sama dengan 'Almond' (Semarang) -> tidak ditambah. Idempoten.
with src as (
  select m.* from public.costing_materials m
   where m.business_unit = 'Haengbocake Pare' and m.is_active
     and m.name in ('Orange Juice Diamond', 'Berry Juice Diamond', 'Kayu Manis Bubuk', 'Jeruk Sunkies',
                    'Sedotan Plastik Besar (Boba)', 'Sedotan Plastik Kecil',
                    'Syrup butterscotch', 'Syrup delifru peach', 'Syrup vanila', 'Yakult')
)
insert into public.costing_materials
  (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit,
   shrink_factor, review_status, halal_kind, in_halal_list, is_active, price_updated_at)
select 'Haengbocake Semarang', s.name, s.category, s.purchase_unit, s.purchase_price, s.content_per_purchase, s.usage_unit,
       s.shrink_factor, s.review_status, s.halal_kind, s.in_halal_list, true, now()
  from src s
 where not exists (
   select 1 from public.costing_materials x
    where x.business_unit = 'Haengbocake Semarang' and x.name = s.name
 );

do $$
declare
  v_op uuid;
  marker constant text := 'Opname awal bahan minuman (salinan dari resep Pare): jumlah 0, mohon diisi saat penghitungan.';
begin
  if exists (select 1 from public.costing_material_opnames where business_unit = 'Haengbocake Semarang' and notes = marker) then
    return;
  end if;
  insert into public.costing_material_opnames (business_unit, opname_date, opname_time, notes)
    values ('Haengbocake Semarang', current_date, '00:01', marker) returning id into v_op;
  insert into public.costing_material_opname_items
    (opname_id, material_id, material_name_snapshot, usage_unit_snapshot, unit_cost_snapshot, physical_qty)
  select v_op, m.id, m.name, m.usage_unit, m.purchase_price / nullif(m.content_per_purchase, 0), 0
    from public.costing_materials m
   where m.business_unit = 'Haengbocake Semarang'
     and m.name in ('Orange Juice Diamond', 'Berry Juice Diamond', 'Kayu Manis Bubuk', 'Jeruk Sunkies',
                    'Sedotan Plastik Besar (Boba)', 'Sedotan Plastik Kecil',
                    'Syrup butterscotch', 'Syrup delifru peach', 'Syrup vanila', 'Yakult');
end $$;
