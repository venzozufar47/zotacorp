-- Dasar hitung target omzet per cabang (catatan keputusan owner, tampil sebagai popup di halaman Scorecard Cabang). Isinya
-- berupa rincian gaji per orang, jadi disimpan di database dan hanya terbaca admin, BUKAN di kode sumber. Datanya diisi
-- lewat SQL oleh owner/asisten, bukan lewat migrasi ini.
create table if not exists public.branch_target_basis (
  branch text primary key check (branch in ('Pare', 'Semarang')),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.branch_target_basis enable row level security;
drop policy if exists bt_basis_admin_all on public.branch_target_basis;
create policy bt_basis_admin_all on public.branch_target_basis for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Grant eksplisit (tabel baru: Supabase berhenti memberi grant otomatis mulai 30 Okt 2026).
grant select, insert, update, delete on public.branch_target_basis to authenticated, service_role;
