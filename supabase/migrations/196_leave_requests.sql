-- Izin Sakit & Izin Keluar Toko (PRD-4) — mengganti alur WhatsApp bebas
-- dengan pengajuan terstruktur yang di-routing otomatis ke atasan langsung
-- (SOP 4.1, 4.6, Rencana Tim Mandiri bagian "Dilepas ke tim"/"Didelegasikan
-- dengan batas"). Atasan = leader di tabel `team_members` yang SUDAH ADA
-- (migrasi 175) — tidak menambah sistem hierarki baru. Karyawan tanpa
-- leader (mis. Koordinator Toko sendiri) otomatis jatuh ke admin (Owner)
-- sebagai fallback — ditangani di action, bukan di skema.
--
-- Owner SENGAJA tidak dibuatkan jalur notifikasi per-pengajuan di sini —
-- itu titik yang mau dihindari ("Owner menerima ringkasan, bukan
-- permintaan izin"). Ringkasannya dibaca lewat halaman admin kapan saja,
-- bukan didorong satu-satu.
--
-- Terkunci ke service-role seperti `cash_closings` — semua akses staf
-- lewat `leave-requests.actions.ts`.

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  kind text not null check (kind in ('sakit', 'izin_keluar_toko', 'tukar_shift')),
  reason text not null,
  -- "kapan bisa kembali" — teks bebas (SOP minta "perkiraan", bukan jam
  -- presisi), dipakai untuk sakit & izin_keluar_toko.
  planned_return text,
  -- Khusus tukar_shift.
  swap_date date,
  swap_with_user_id uuid references public.profiles (id),

  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approver_id uuid references public.profiles (id),
  approver_note text,
  -- Pengganti yang ditugaskan atasan saat menyetujui (SOP 4.1: "Atasan
  -- mengatur pengganti dan mencatatnya di Zota Apps").
  backup_user_id uuid references public.profiles (id),
  decided_at timestamptz,

  created_at timestamptz not null default now()
);

create index leave_requests_user_idx on public.leave_requests (user_id, created_at desc);
create index leave_requests_status_idx on public.leave_requests (status, created_at desc);

alter table public.leave_requests enable row level security;

create policy leave_requests_admin_all on public.leave_requests
  for all using (public.is_admin()) with check (public.is_admin());

grant all on public.leave_requests to service_role;
