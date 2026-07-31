-- Service level adalah kebijakan SUPERADMIN. Aksi server sudah tidak
-- mengeksposnya ke staf, tapi policy `cmp_staff_rw` bersifat FOR ALL —
-- lewat REST API langsung, staf masih bisa menulis kolomnya sendiri.
--
-- RLS tidak bisa membatasi per-kolom, jadi tutup di lapisan hak akses.
-- PENTING: grant di level TABEL mencakup SEMUA kolom, sehingga
-- `revoke update (kolom)` saja tidak berpengaruh. Harus dicabut dulu di
-- level tabel, lalu diberikan kembali kolom per kolom.
--
-- `service_role` (dipakai semua server action, termasuk aksi admin yang
-- memang boleh menyetel override) punya grant sendiri dan tak terpengaruh.

revoke insert, update on public.costing_material_procurement from authenticated;

grant insert (
  material_id, business_unit,
  avg_daily_usage, lead_time_days, usage_sigma_daily, lead_time_sigma_days,
  moq_purchase_units, order_multiple_units, supplier, is_tracked, notes,
  updated_by, updated_at
) on public.costing_material_procurement to authenticated;

grant update (
  avg_daily_usage, lead_time_days, usage_sigma_daily, lead_time_sigma_days,
  moq_purchase_units, order_multiple_units, supplier, is_tracked, notes,
  updated_by, updated_at
) on public.costing_material_procurement to authenticated;
