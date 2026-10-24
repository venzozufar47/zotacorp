-- "Tatakan Cake" (Rp3.310, dipakai Cake Sponge 14cm) menjadi ukuran 18cm; tambah 22/24/30cm (harga menunggu diisi owner).
update public.costing_materials
  set name = 'Tatakan Cake 18cm', updated_at = now()
  where id = '6586ca68-fd27-44d4-a932-d535318e446a' and business_unit = 'Haengbocake Pare' and name = 'Tatakan Cake';

insert into public.costing_materials
  (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, shrink_factor, review_status)
select 'Haengbocake Pare', 'Tatakan Cake ' || s || 'cm', 'Kemasan & Label', 'pcs', 0, 1, 'pcs', 0, 'pending'
from unnest(array['22','24','30']) s
where exists (select 1 from public.costing_materials where id = '6586ca68-fd27-44d4-a932-d535318e446a' and name = 'Tatakan Cake 18cm');
