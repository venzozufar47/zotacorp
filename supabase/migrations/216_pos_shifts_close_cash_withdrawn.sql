-- Uang yang diambil/disetor dari laci setelah hitungan tutup shift (sisanya jadi modal laci shift berikutnya).
-- Kas seharusnya saat buka = hitungan tutup sebelumnya − yang diambil + gerakan kas di antaranya.
alter table public.pos_shifts
  add column if not exists close_cash_withdrawn numeric not null default 0 check (close_cash_withdrawn >= 0);

comment on column public.pos_shifts.close_cash_withdrawn is
  'Uang yang diambil/disetor dari laci setelah hitungan tutup shift (sisanya jadi modal laci shift berikutnya).';
