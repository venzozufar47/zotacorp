-- Haengbocake Semarang: Banana Strudel Large 40.000 -> 50.000 (sesuai menu cetak).
update public.pos_product_variants v
set price = 50000
from public.pos_products p
where v.product_id = p.id
  and p.bank_account_id = 'a514d240-d75a-4621-8639-b445874a1b54'
  and p.name = 'Banana Strudel'
  and v.name = 'Large'
  and v.price = 40000;
