-- Promo harga per item (kind = 'item_price'): produk tertentu dijual di harga promo tetap, maksimal 1 pcs per nota.
-- Dipakai pertama kali untuk soft opening Haengbocake Semarang, 16-30 Nov 2026:
-- Salt Bread (semua varian), Black Forest, Matcha Strawberry Cake = Rp2.000, 1 pcs per nota, otomatis.
-- Tak ada tabel baru, jadi tak perlu GRANT tambahan.

alter table public.pos_discount_campaigns
  add column if not exists promo_price numeric(12,2),
  add column if not exists product_ids uuid[];

alter table public.pos_discount_campaigns drop constraint if exists pos_disc_kind_chk;
alter table public.pos_discount_campaigns add constraint pos_disc_kind_chk
  check (
    kind in ('percent','nominal','item_price')
    and (kind <> 'nominal' or (amount_off is not null and amount_off > 0))
    and (kind <> 'item_price' or (promo_price is not null and promo_price >= 0
         and product_ids is not null and cardinality(product_ids) > 0))
  );

do $$
declare
  v_account uuid := 'a514d240-d75a-4621-8639-b445874a1b54'; -- Haengbocake Semarang
  v_ids uuid[];
  v_id uuid := gen_random_uuid();
begin
  select array_agg(id) into v_ids
  from public.pos_products
  where bank_account_id = v_account
    and name in ('Salt Bread', 'Black Forest', 'Matcha Strawberry Cake');

  if v_ids is null or cardinality(v_ids) <> 3 then
    raise exception 'Produk promo Semarang tidak lengkap (ditemukan %)', coalesce(cardinality(v_ids), 0);
  end if;

  insert into public.pos_discount_campaigns
    (id, group_id, bank_account_id, name, is_active, kind, percent_off, promo_price, product_ids,
     start_date, end_date, mode, note)
  values
    (v_id, v_id, v_account, 'Soft Opening Semarang — Rp2.000', true, 'item_price', 0, 2000, v_ids,
     '2026-11-16', '2026-11-30', 'otomatis',
     'Salt Bread, Black Forest, Matcha Strawberry Cake Rp2.000. 1 pcs per nota.');
end $$;
