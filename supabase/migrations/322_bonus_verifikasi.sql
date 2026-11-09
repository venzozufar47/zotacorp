-- Verifikasi tutup buku sebelum bonus koordinator & kepala produksi diterbitkan.
--
-- Satu baris per bulan ('YYYY-MM', berlaku untuk kedua cabang): hasil cek otomatis saat disimpan (snapshot),
-- centang manual owner, alasan bila syarat otomatis yang gagal diloloskan, dan catatan. `verified_at` terisi
-- hanya bila semua syarat lolos/diloloskan DAN semua centang manual lengkap; Terbitkan menolak bulan tanpa itu.
--
-- Akses lewat service role (pola bonus_*); GRANT eksplisit karena tabel baru tidak lagi mendapat auto-grant.

create table if not exists public.bonus_verifications (
  period text primary key check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  checks_snapshot jsonb not null default '[]'::jsonb,
  manual_checks jsonb not null default '{}'::jsonb,
  overrides jsonb not null default '{}'::jsonb,
  note text,
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

alter table public.bonus_verifications enable row level security;

drop policy if exists bonus_verifications_admin_all on public.bonus_verifications;
create policy bonus_verifications_admin_all on public.bonus_verifications
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.bonus_verifications to service_role;
grant select, insert, update, delete on public.bonus_verifications to authenticated;
