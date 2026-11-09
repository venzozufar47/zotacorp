-- SM-6 + SM-7 (docs/STATE_MACHINES.md). Diterapkan bersama/sesudah 323.
--
-- SM-6: karyawan hanya boleh mengubah data diri dasar di profilnya. Kebijakan
-- RLS `profiles_update_own` mengizinkan baris sendiri, dan `authenticated`
-- punya hak UPDATE atas semua kolom, sehingga lewat PostgREST karyawan bisa
-- mengubah jam kerja, toleransi telat, pengecualian slip, bonus, dsb. Trigger
-- di bawah menggantikan `profiles_guard_lifecycle` (migrasi 323) dengan daftar
-- putih: kolom di luar daftar hanya boleh diubah admin / service role.
-- Daftar ini SAMA dengan src/lib/profile/edit-policy.ts (+ kolom teknis yang
-- ditulis karyawan sendiri: avatar & PIN POS). Ubah keduanya bersamaan.
--
-- SM-7: kolom hitungan absensi (jam masuk/pulang, status, menit telat,
-- lembur, istirahat) kini ditulis server action dengan service role setelah
-- dihitung di server. Karyawan tidak lagi butuh hak tulis langsung, jadi
-- kebijakan INSERT/UPDATE milik-sendiri dicabut. Baca (SELECT) tetap.

-- ─── SM-6: profiles ────────────────────────────────────────────────────────

drop trigger if exists profiles_guard_lifecycle on public.profiles;
drop function if exists public.profiles_guard_lifecycle();

create or replace function public.profiles_guard_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  self_cols constant text[] := array[
    'full_name', 'nickname', 'gender', 'date_of_birth', 'place_of_birth',
    'current_city', 'whatsapp_number', 'npwp', 'npwp_not_applicable',
    'emergency_contact_name', 'emergency_contact_whatsapp', 'motto', 'shirt_size',
    'domisili_provinsi', 'domisili_kota', 'domisili_kecamatan', 'domisili_kelurahan', 'domisili_alamat',
    'asal_provinsi', 'asal_kota', 'asal_kecamatan', 'asal_kelurahan', 'asal_alamat',
    -- teknis, ditulis karyawan untuk dirinya sendiri
    'avatar_seed', 'avatar_url', 'pos_pin_hash', 'updated_at'
  ];
  -- Diisi karyawan saat onboarding: boleh selama nilai lama masih kosong.
  once_cols constant text[] := array['business_unit', 'job_role', 'first_day_of_work'];
  old_j jsonb := to_jsonb(old);
  k text;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  for k in
    select n.key from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from old_j -> n.key
  loop
    continue when k = any(self_cols);
    continue when k = any(once_cols) and coalesce(old_j ->> k, '') = '';
    raise exception 'Kolom profil "%" hanya boleh diubah admin', k
      using errcode = 'insufficient_privilege';
  end loop;
  return new;
end;
$$;

drop trigger if exists profiles_guard_columns on public.profiles;
create trigger profiles_guard_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_columns();

-- ─── SM-7: absensi ─────────────────────────────────────────────────────────

drop policy if exists attendance_insert_own on public.attendance_logs;
drop policy if exists attendance_update_own on public.attendance_logs;
drop policy if exists attendance_break_insert_own on public.attendance_break_logs;
drop policy if exists attendance_break_update_own on public.attendance_break_logs;
drop policy if exists overtime_requests_insert_own on public.overtime_requests;
