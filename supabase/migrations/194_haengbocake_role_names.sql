-- Samakan nama role BU Haengbocake dengan dokumen evaluasi dan SOP:
--   Staf Dapur, Staf Depan, Koordinator Toko, Staf Konten dan Social Media, Marketing Manager.
--
-- Hanya PENAMAAN: yang berubah cuma profiles.job_role dan business_unit_roles.role_name milik BU
-- Haengbocake. Admin, Baker, dan Cake Artist tidak disentuh (terkait akses fitur), begitu pula
-- profiles.role/position dan unit lain (Yeobo Space, Yeobo Booth, Gritamora, Mamaya House, Pare, Semarang).
-- Idempotent: hanya mengubah baris yang MASIH bernama lama, jadi aman dijalankan ulang dan tidak
-- menimpa perubahan admin sesudahnya. Di produksi keadaan ini sudah tercapai (migrasi ini no-op).
-- Dewi Qurrota A'yunin (resign 2 Juli 2026) tidak dipetakan: label lama sengaja dibiarkan.

do $$
declare
  bu constant uuid := 'fe515f93-086e-4830-8505-e5ba09d0e418'; -- Haengbocake
begin
  if to_regclass('public.business_unit_roles') is null
     or not exists (select 1 from public.business_units where id = bu) then
    return;
  end if;

  -- 1) Daftar role resmi (nama baru). Role lama, Admin, Baker, Cake Artist dibiarkan.
  insert into public.business_unit_roles (business_unit_id, role_name)
  select bu, r
  from unnest(array['Staf Dapur', 'Staf Depan', 'Koordinator Toko', 'Staf Konten dan Social Media', 'Marketing Manager']) as r
  on conflict (business_unit_id, role_name) do nothing;

  -- 2) Penetapan per karyawan: hanya yang MASIH berlabel lama ("Kitchen Helper" terpecah tiga).
  update public.profiles p
  set job_role = m.new_role
  from (values
    ('Anjariati',                    'Staf Dapur'),
    ('Sri Nuryati',                  'Staf Dapur'),
    ('Chelsy Anisa May',             'Baker'),
    ('Muhammad Abdul Arifin',        'Baker'),
    ('Adinda Humairoh Putri Aisyah', 'Staf Depan'),
    ('Diva Ayu Ismayana',            'Staf Depan'),
    ('Nisa Alya Almaida',            'Staf Depan'),
    ('Nur Fitri',                    'Staf Depan'),
    ('Siti Jauharatul Munawaroh',    'Koordinator Toko')
  ) as m(full_name, new_role)
  where p.full_name = m.full_name
    and p.business_unit = 'Haengbocake'
    and p.job_role = 'Kitchen Helper';

  update public.profiles
  set job_role = 'Staf Konten dan Social Media'
  where business_unit = 'Haengbocake' and job_role = 'Content Creator';

  -- 3) Buang nama role lama dari daftar Haengbocake (daftar akhir = 8 role). Label lama yang tersisa
  --    di profil nonaktif (mis. Dewi) hanya teks, tidak ada FK ke daftar ini.
  delete from public.business_unit_roles
  where business_unit_id = bu and role_name in ('Kitchen Helper', 'Content Creator');
end $$;
