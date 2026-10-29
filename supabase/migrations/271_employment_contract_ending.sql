-- Pencatatan berakhirnya hubungan kerja pada kontrak kerja (Pasal 15 template Haengbocake).
--
-- Sebelumnya kontrak yang sudah ditandatangani tidak bisa diakhiri dari panel admin (status
-- 'terminated' ada tetapi tak terjangkau), sehingga tidak ada catatan resign/PHK, batas 12 bulan
-- larangan usaha sejenis, maupun denda resign kurang dari 30 hari.
--
--   ended_at         tanggal efektif berakhirnya hubungan kerja
--   end_reason       'resign' | 'phk' | 'lainnya'
--   resign_notice_at tanggal pemberitahuan tertulis resign (dasar hitung 30 hari)
--   end_note         catatan admin
--
-- Semua nullable; kontrak aktif tidak terpengaruh. Idempotent.

alter table public.employment_contracts
  add column if not exists ended_at date,
  add column if not exists end_reason text,
  add column if not exists resign_notice_at date,
  add column if not exists end_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employment_contracts_end_reason_check'
  ) then
    alter table public.employment_contracts
      add constraint employment_contracts_end_reason_check
      check (end_reason is null or end_reason in ('resign', 'phk', 'lainnya'));
  end if;
end $$;

comment on column public.employment_contracts.ended_at is
  'Tanggal efektif berakhirnya hubungan kerja (diisi saat admin mengakhiri kontrak).';
comment on column public.employment_contracts.resign_notice_at is
  'Tanggal pemberitahuan tertulis resign; selisih ke ended_at < 30 hari = kena denda 1x upah.';
