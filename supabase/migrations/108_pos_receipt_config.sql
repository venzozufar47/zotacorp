-- Setelan ISI struk yang dibagikan lintas perangkat (per rekening POS).
-- Sebelumnya setelan struk tersimpan device-local (localStorage), jadi
-- header/footer/label yang diubah di satu HP tidak muncul di HP lain.
-- Kolom jsonb ini menampung konten bersama: header, alamat, footer,
-- showBranch, branchOverride, labels. Metode cetak & auto-cetak TETAP
-- device-local (tiap HP punya printer/koneksi sendiri).
alter table public.bank_accounts
  add column if not exists pos_receipt_config jsonb;

comment on column public.bank_accounts.pos_receipt_config is
  'Konten struk POS bersama (header/alamat/footer/label/cabang). Null = default.';
