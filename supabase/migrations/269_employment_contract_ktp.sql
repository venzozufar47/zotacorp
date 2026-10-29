-- Foto KTP karyawan pada kontrak kerja. (Sudah diterapkan ke database sebagai 251_employment_contract_ktp; dinomori ulang 269 agar urut. Idempoten.)
--
-- Karyawan wajib memfoto KTP saat menandatangani kontrak (Pasal 12 template
-- Haengbocake). File disimpan di bucket privat `employment-contracts`
-- (path `{contractId}/ktp-{uuid}.{ext}`) dan HANYA bisa dibuka lewat signed
-- URL dari server action admin — tidak pernah dimasukkan ke PDF kontrak.
--
-- Kolom nullable: kontrak lama (sebelum fitur ini) tidak punya foto KTP, dan
-- kontrak yang sudah ditandatangani tidak diubah. Kolom hanya terisi saat
-- karyawan (menandatangani / menandatangani ulang).

alter table public.employment_contracts
  add column if not exists ktp_photo_path text;

comment on column public.employment_contracts.ktp_photo_path is
  'Path foto KTP di bucket employment-contracts (privat). Wajib diisi saat tanda tangan; tidak ikut ke PDF.';
