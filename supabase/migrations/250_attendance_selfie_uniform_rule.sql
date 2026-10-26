-- Ketentuan Seragam Tim Perempuan Haengbocake (Semarang & Pare) — tambahan
-- filter "uniform" ke gate AI selfie absen yang sudah ada (migrasi 192).
-- Warna kerudung per hari (Senin-Selasa biru, Rabu-Kamis coklat, Jumat-
-- Sabtu pink) dan larangan nuansa hitam/gelap dihitung di kode
-- (`uniformRequiredHijabColor`, selfie-gate.ts) — kolom ini cuma
-- menyalakan filternya untuk business_unit Haengbocake.
--
-- Filter hanya aktif untuk profil gender='Female' (lihat loadSelfieRules)
-- — Debar Boles Ananta gender-nya salah tercatat 'Female' di data lama,
-- dikoreksi di sini supaya dia tidak ikut kena ketentuan kerudung yang
-- memang tidak berlaku untuknya.

update public.attendance_selfie_rules
set filters = filters || '{"uniform": true}'::jsonb,
    updated_at = now()
where business_unit = 'Haengbocake';

update public.profiles
set gender = 'Male'
where id = '695dbbdd-6609-4d7b-9685-e49fe311af6a'; -- Debar Boles Ananta
