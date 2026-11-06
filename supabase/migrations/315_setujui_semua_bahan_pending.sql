-- Semua bahan costing berstatus 'pending' (46 Pare, 3 Semarang) disetujui atas keputusan Owner: status itu tidak dipakai untuk
-- meninjau apa pun yang penting. Hanya status yang berubah; harga, satuan, dan resep tidak disentuh.
update public.costing_materials
   set review_status = 'approved'
 where review_status = 'pending';
