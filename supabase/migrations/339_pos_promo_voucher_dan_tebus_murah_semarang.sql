-- Promo Semarang, evaluasi soft opening + program Tebus Murah.
--  1. Soft opening (item_price): tak lagi "1 pcs per nota". Kasir mengisi jumlah voucher yang berhak diklaim di satu nota
--     (antrean sudah memilah pembeli yang berhak); tiap voucher = 1 pcs Matcha Strawberry / Black Forest / Salt Bread Rp2.000.
--     Jumlah voucher yang terpakai dicatat di pos_sales.promo_voucher_count.
--  2. Tebus Murah (kind = 'tebus_murah'): tiap 1 pcs produk non-promo berhak menebus 1 pcs Red Velvet / Tiramisu /
--     Cranberry Walnut Sourdough Rp2.000. Produk soft opening tidak dihitung sebagai syarat (excluded_product_ids).
-- Tak ada tabel baru, jadi tak perlu GRANT tambahan.

alter table public.pos_discount_campaigns
  add column if not exists excluded_product_ids uuid[];

alter table public.pos_sales
  add column if not exists promo_voucher_count integer not null default 0;

alter table public.pos_discount_campaigns drop constraint if exists pos_disc_kind_chk;
alter table public.pos_discount_campaigns add constraint pos_disc_kind_chk
  check (
    kind in ('percent','nominal','item_price','tebus_murah')
    and (kind <> 'nominal' or (amount_off is not null and amount_off > 0))
    and (kind not in ('item_price','tebus_murah') or (promo_price is not null and promo_price >= 0
         and product_ids is not null and cardinality(product_ids) > 0))
  );

do $$
declare
  v_account uuid := 'a514d240-d75a-4621-8639-b445874a1b54'; -- Haengbocake Semarang
  v_promo uuid[];
  v_tebus uuid[];
  v_id uuid := gen_random_uuid();
begin
  select array_agg(id) into v_promo
  from public.pos_products
  where bank_account_id = v_account
    and name in ('Salt Bread', 'Black Forest', 'Matcha Strawberry Cake');

  select array_agg(id) into v_tebus
  from public.pos_products
  where bank_account_id = v_account
    and name in ('Red Velvet', 'Tiramisu', 'Cranberry Walnut Sourdough');

  if v_promo is null or cardinality(v_promo) <> 3 then
    raise exception 'Produk soft opening Semarang tidak lengkap (ditemukan %)', coalesce(cardinality(v_promo), 0);
  end if;
  if v_tebus is null or cardinality(v_tebus) <> 3 then
    raise exception 'Produk Tebus Murah Semarang tidak lengkap (ditemukan %)', coalesce(cardinality(v_tebus), 0);
  end if;

  update public.pos_discount_campaigns
  set note = 'Matcha Strawberry Cake, Black Forest, Salt Bread Rp2.000. Jumlah voucher diisi kasir per nota.',
      updated_at = now()
  where bank_account_id = v_account and kind = 'item_price';

  insert into public.pos_discount_campaigns
    (id, group_id, bank_account_id, name, is_active, kind, percent_off, promo_price, product_ids, excluded_product_ids,
     start_date, end_date, mode, note)
  values
    (v_id, v_id, v_account, 'Tebus Murah Semarang — Rp2.000', true, 'tebus_murah', 0, 2000, v_tebus, v_promo,
     '2026-11-16', '2026-11-30', 'otomatis',
     'Tiap 1 pcs produk non-promo: tebus 1 Red Velvet / Tiramisu / Sourdough Rp2.000. Produk soft opening tak dihitung.');
end $$;
