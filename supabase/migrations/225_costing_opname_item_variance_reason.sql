-- Alasan selisih opname bahan: wajib diisi petugas saat selisih melewati toleransi kategori
-- (src/lib/procurement/cycle-count.ts). Null = tidak ada selisih di luar toleransi / bahan belum punya baseline.
alter table public.costing_material_opname_items
  add column if not exists variance_reason text;
