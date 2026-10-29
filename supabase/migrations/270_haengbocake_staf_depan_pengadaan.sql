-- Jabatan gabungan "Staf Depan & Pengadaan" untuk Haengbocake, mengikuti konvensi
-- peran gabungan di migrasi 210 ("Staf Depan & Koordinator Toko", dst.).
--
-- Peran dasar "Staf Depan" TETAP ada. profiles.job_role hanya label (slip gaji, kontrak, evaluasi);
-- tidak ada fungsi/policy DB yang membacanya. Kartu "Otorisasi POS" membaca tiap komponen di sebelah
-- "&" (authorizer-policy.ts): "Staf Depan" tetap berhak pengambilan kue, "Pengadaan" tidak ada di
-- matriks wewenang sehingga wewenang PIN tidak berubah. Tab Pengadaan di menu ditentukan oleh
-- penugasan pengadaan, bukan jabatan.
--
-- Penetapan per orang (keputusan pemilik): Nur Fitri = Staf Depan & Pengadaan.
-- Idempotent: peran hanya ditambah bila belum ada; baris hanya diubah bila MASIH berlabel lama.

do $$
declare
  bu constant uuid := 'fe515f93-086e-4830-8505-e5ba09d0e418'; -- Haengbocake
begin
  if to_regclass('public.business_unit_roles') is null
     or not exists (select 1 from public.business_units where id = bu) then
    return;
  end if;

  insert into public.business_unit_roles (business_unit_id, role_name)
  values (bu, 'Staf Depan & Pengadaan')
  on conflict (business_unit_id, role_name) do nothing;

  update public.profiles
  set job_role = 'Staf Depan & Pengadaan'
  where full_name = 'Nur Fitri'
    and business_unit = 'Haengbocake'
    and job_role = 'Staf Depan';
end $$;
