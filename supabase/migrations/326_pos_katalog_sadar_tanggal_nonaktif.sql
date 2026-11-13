-- Service Level: produk/varian yang dinonaktifkan tidak lagi menggeser angka hari-hari SEBELUM penonaktifan.
--
-- Masalah: daftar SKU service level diambil dari katalog SAAT INI (active = true). Begitu produk dinonaktifkan, produk itu
-- hilang dari penyebut seluruh jendela hitung ulang (3 hari terakhir tiap malam), termasuk hari ketika ia masih dijual.
--
-- Perbaikan: catat TANGGAL (WIB) penonaktifan dan pengaktifan kembali. Mesin service level memuat juga SKU nonaktif yang punya
-- tanggal, lalu tidak menghitungnya pada tanggal D bila  inactive_since <= D  dan  (reactivated_on kosong atau D < reactivated_on).
--   inactive_since : tanggal WIB terakhir kali active berubah true -> false. NULL = tak diketahui / tak pernah dinonaktifkan
--                    (produk nonaktif lama yang tanggalnya tak diketahui tetap diperlakukan seperti sebelumnya: tidak dihitung).
--   reactivated_on : tanggal WIB active berubah false -> true setelah inactive_since; NULL selama masih nonaktif.
-- Hanya satu periode nonaktif TERAKHIR yang diingat (cukup untuk jendela hitung ulang 3 hari).

alter table pos_products
  add column inactive_since date,
  add column reactivated_on date,
  add constraint pos_products_reactivated_after_inactive
    check (reactivated_on is null or (inactive_since is not null and reactivated_on >= inactive_since));

alter table pos_product_variants
  add column inactive_since date,
  add column reactivated_on date,
  add constraint pos_product_variants_reactivated_after_inactive
    check (reactivated_on is null or (inactive_since is not null and reactivated_on >= inactive_since));

create function pos_track_active_dates() returns trigger
language plpgsql
set search_path = public
as $$
declare
  d constant date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if old.active and not new.active then
    new.inactive_since := d;
    new.reactivated_on := null;
  elsif not old.active and new.active then
    -- Tanggal nonaktif lama yang tak diketahui (NULL) dibiarkan NULL: produk dianggap aktif penuh, seperti perilaku sebelumnya.
    if old.inactive_since is not null then
      new.reactivated_on := d;
    end if;
  end if;
  return new;
end $$;

create trigger pos_products_track_active_dates
  before update of active on pos_products
  for each row execute function pos_track_active_dates();

create trigger pos_product_variants_track_active_dates
  before update of active on pos_product_variants
  for each row execute function pos_track_active_dates();

-- Backfill perubahan katalog Semarang 13 Nov 2026 (dilakukan sebelum trigger ada).
do $$
declare
  smg constant uuid := 'a514d240-d75a-4621-8639-b445874a1b54';
begin
  -- Dinonaktifkan hari ini: hari sebelumnya tetap terhitung seperti snapshot lama.
  update pos_products set inactive_since = date '2026-11-13'
   where bank_account_id = smg and name in ('Brownies Kunafa', 'Butter Tteok') and not active;
  update pos_product_variants v set inactive_since = date '2026-11-13'
    from pos_products p
   where p.id = v.product_id and p.bank_account_id = smg and p.name = 'Mille Crepes'
     and v.name not in ('Tiramisu', 'Cookies & Cream') and not v.active;

  -- Diaktifkan hari ini setelah lama nonaktif: hari sebelumnya tidak boleh dihitung (snapshot lama pun tidak menghitungnya).
  update pos_products set inactive_since = date '2026-01-01', reactivated_on = date '2026-11-13'
   where bank_account_id = smg and name = 'BCB Matcha' and active;
  update pos_product_variants v set inactive_since = date '2026-01-01', reactivated_on = date '2026-11-13'
    from pos_products p
   where p.id = v.product_id and p.bank_account_id = smg and v.active
     and ((p.name = 'Banana Strudel' and v.name = 'Large') or (p.name = 'Fudgy Brownies' and v.name = 'Large'));
end $$;
