-- Aturan baru POS Semarang (antrean voucher dipisah dari antrean reguler):
--  - Tebus Murah: maks 1 pcs per orang (kasir mengisi jumlah orang per nota). Tiap tebus butuh 1 pcs produk syarat:
--    harga normal, non-minuman, bukan produk tebus. Minuman & tambahan (Drinks, Lilin, Tambah Nama, Freebies Tiramisu)
--    tidak dihitung sebagai syarat -> ditambahkan ke excluded_product_ids kampanye Tebus Murah.
--  - Nota voucher tak boleh dicampur produk lain: ditegakkan di kode (voucherMixedProblem), bukan di data.
-- Tak ada tabel baru, jadi tak perlu GRANT tambahan.

do $$
declare
  v_account uuid := 'a514d240-d75a-4621-8639-b445874a1b54'; -- Haengbocake Semarang
  v_extra uuid[];
  v_updated int;
begin
  select array_agg(id) into v_extra
  from public.pos_products
  where bank_account_id = v_account
    and name in ('Drinks', 'Lilin', 'Tambah Nama', 'Freebies Tiramisu');

  if v_extra is null or cardinality(v_extra) <> 4 then
    raise exception 'Produk non-syarat Semarang tidak lengkap (ditemukan %)', coalesce(cardinality(v_extra), 0);
  end if;

  update public.pos_discount_campaigns
  set excluded_product_ids = (
        select array_agg(distinct x) from unnest(coalesce(excluded_product_ids, '{}'::uuid[]) || v_extra) as x
      ),
      note = 'Maks 1 pcs per orang. Syarat: 1 produk harga normal non-minuman per tebus (bukan produk tebus). Jumlah orang diisi kasir per nota.',
      updated_at = now()
  where bank_account_id = v_account and kind = 'tebus_murah';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Kampanye Tebus Murah Semarang harus tepat 1 (ditemukan %)', v_updated;
  end if;
end $$;
