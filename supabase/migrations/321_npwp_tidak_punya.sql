-- Penanda "tidak punya NPWP" di profil.
--
-- Tidak semua karyawan punya NPWP, tetapi NPWP dihitung sebagai kolom wajib
-- untuk status profil lengkap (dan profil lengkap membuka slip gaji). Tanpa
-- penanda ini, karyawan yang memang tidak punya NPWP selamanya "belum lengkap".
--
-- true  = karyawan menyatakan tidak punya NPWP (kolom npwp harus kosong)
-- false = belum menyatakan; NPWP dianggap lengkap hanya bila kolom npwp terisi
--
-- Aplikasi menjaga konsistensi: menyimpan NPWP berisi mengembalikan penanda ke
-- false, mencentang penanda mengosongkan npwp (src/app/api/profile/update).

alter table public.profiles
  add column if not exists npwp_not_applicable boolean not null default false;

comment on column public.profiles.npwp_not_applicable is
  'true = karyawan tidak punya NPWP; dihitung lengkap tanpa mengisi npwp.';

-- Keputusan pemilik 2026-11-09: yang NPWP-nya kosong saat ini dianggap tidak punya.
-- Investor tidak ikut (profil mereka dikelola di /admin/investors).
update public.profiles
   set npwp_not_applicable = true
 where role <> 'investor'
   and (npwp is null or btrim(npwp) = '');
