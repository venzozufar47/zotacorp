-- Kebijakan POS Semarang: Matcha Strawberry Cake, Black Forest, dan Salt Bread HANYA bisa dibeli dengan voucher promo soft opening.
-- Tidak bisa dibeli lewat mode normal maupun Tebus Murah, sekalipun dengan harga non-promo.
-- Aturan melekat di kampanye soft opening (item_price): berlaku selama kampanye berlaku, dan ditegakkan di createPosSale.
-- Tak ada tabel baru, jadi tak perlu GRANT tambahan.

alter table public.pos_discount_campaigns
  add column if not exists voucher_only_product_ids uuid[];

do $$
declare
  v_account uuid := 'a514d240-d75a-4621-8639-b445874a1b54'; -- Haengbocake Semarang
  v_locked uuid[];
  v_updated int;
begin
  select array_agg(id) into v_locked
  from public.pos_products
  where bank_account_id = v_account
    and name in ('Black Forest', 'Matcha Strawberry Cake', 'Salt Bread');

  if v_locked is null or cardinality(v_locked) <> 3 then
    raise exception 'Produk hanya-voucher Semarang tidak lengkap (ditemukan %)', coalesce(cardinality(v_locked), 0);
  end if;

  update public.pos_discount_campaigns
  set voucher_only_product_ids = v_locked,
      updated_at = now()
  where bank_account_id = v_account and kind = 'item_price';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Kampanye soft opening Semarang harus tepat 1 (ditemukan %)', v_updated;
  end if;
end $$;
