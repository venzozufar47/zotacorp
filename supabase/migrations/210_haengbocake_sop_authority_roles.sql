-- Jabatan SOP untuk matriks wewenang PIN POS (Kepala Produksi, Koordinator Toko) ditambahkan sebagai
-- peran GABUNGAN, mengikuti konvensi "Admin & Editor" (Yeobo Space) dan "Admin & Kasir" (Mamaya House):
--   Baker & Kepala Produksi, Staf Depan & Koordinator Toko, Admin & Koordinator Toko.
--
-- Peran dasar (Baker, Staf Depan, Admin) TETAP ada di label — akses produksi cake memakai tabel akses
-- terpisah, dan tidak ada fungsi/policy DB yang membaca profiles.job_role (sudah diperiksa), jadi hanya
-- teks label (slip gaji, kontrak, evaluasi) yang berubah. Kartu "Otorisasi POS" membaca tiap komponen
-- di sebelah "&" (src/lib/pos/authorizer-policy.ts).
--
-- Penetapan per orang (keputusan pemilik): Debar Boles Ananta & Epafroditus Yuan Pico = Kepala Produksi,
-- Nisa Alya Almaida = Koordinator Toko Pare, Tasya Maynanda = Admin sekaligus Koordinator Toko Semarang.
-- Siti Jauharatul Munawaroh (Jara) kembali menjadi Staf Depan: Koordinator Toko Pare adalah Nisa.
-- Idempotent: hanya mengubah baris yang MASIH berlabel lama.

do $$
declare
  bu constant uuid := 'fe515f93-086e-4830-8505-e5ba09d0e418'; -- Haengbocake
begin
  if to_regclass('public.business_unit_roles') is null
     or not exists (select 1 from public.business_units where id = bu) then
    return;
  end if;

  insert into public.business_unit_roles (business_unit_id, role_name)
  select bu, r
  from unnest(array['Baker & Kepala Produksi', 'Staf Depan & Koordinator Toko', 'Admin & Koordinator Toko']) as r
  on conflict (business_unit_id, role_name) do nothing;

  update public.profiles p
  set job_role = m.new_role
  from (values
    ('Debar Boles Ananta',     'Baker',      'Baker & Kepala Produksi'),
    ('Epafroditus Yuan Pico',  'Baker',      'Baker & Kepala Produksi'),
    ('Nisa Alya Almaida',      'Staf Depan', 'Staf Depan & Koordinator Toko'),
    ('Tasya Maynanda',         'Admin',      'Admin & Koordinator Toko'),
    ('Siti Jauharatul Munawaroh', 'Koordinator Toko', 'Staf Depan')
  ) as m(full_name, old_role, new_role)
  where p.full_name = m.full_name
    and p.business_unit = 'Haengbocake'
    and p.job_role = m.old_role;
end $$;
