-- Tiga sirup minuman yang disalin ke Haengbocake Semarang (migrasi 313) ikut berstatus 'pending' seperti di Pare. Status itu hanya
-- menandai bahan yang diajukan petugas pengadaan untuk ditinjau admin; untuk salinan di Semarang tidak diperlukan, jadi disetujui.
-- Harga tetap harga salinan sampai tim Semarang mengisi harga belinya sendiri. Bahan Pare tidak diubah.
update public.costing_materials
   set review_status = 'approved'
 where business_unit = 'Haengbocake Semarang'
   and review_status = 'pending'
   and name in ('Syrup butterscotch', 'Syrup delifru peach', 'Syrup vanila');
