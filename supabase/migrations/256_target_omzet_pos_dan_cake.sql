-- Target omzet cabang dipisah: POS dan Custom Cake punya target bulanan sendiri (target total = jumlahnya).
-- Kolom tunggal dari migrasi 255 belum pernah terisi, jadi aman diganti.
alter table public.scorecard_branch_targets
  drop column monthly_omzet_target,
  add column monthly_pos_target numeric(14, 0) check (monthly_pos_target is null or monthly_pos_target > 0),
  add column monthly_cake_target numeric(14, 0) check (monthly_cake_target is null or monthly_cake_target > 0);
