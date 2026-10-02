-- Nama layanan / akun kini wajib (bagian utama form, sejajar email & password).
-- Tabel baru dan semua barisnya sudah punya nama (dicek sebelum migrasi ini).
alter table public.managed_accounts
  alter column service set not null,
  add constraint managed_accounts_service_not_blank
    check (length(btrim(service)) > 0);
