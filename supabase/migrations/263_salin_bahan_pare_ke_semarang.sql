-- Salin master bahan Haengbocake Pare yang BELUM ada di Semarang (cocok nama, tanpa beda huruf besar/kecil),
-- supaya opname harian Semarang punya daftar bahan yang sama dengan Pare. Hanya bahan aktif & sudah disetujui:
-- usulan petugas Pare yang masih menunggu tinjauan (harga 0, bahan uji coba) sengaja tidak ikut.
-- Harga acuan = harga Pare sebagai titik awal; akan menyesuaikan sendiri lewat rata-rata tertimbang nota Semarang.

insert into costing_materials
  (business_unit, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, shrink_factor, shopee_url, is_active, review_status)
select 'Haengbocake Semarang', p.name, p.category, p.purchase_unit, p.purchase_price, p.content_per_purchase, p.usage_unit,
       p.shrink_factor, p.shopee_url, true, 'approved'
  from costing_materials p
 where p.business_unit = 'Haengbocake Pare'
   and p.is_active
   and p.review_status = 'approved'
   and not exists (
     select 1 from costing_materials s
      where s.business_unit = 'Haengbocake Semarang'
        and lower(trim(s.name)) = lower(trim(p.name))
   );
