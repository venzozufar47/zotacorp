-- Log per-penerima untuk notifikasi push perayaan (ulang tahun, anniversary,
-- streak milestone) — pengganti `whatsapp_send_logs` yang sudah mati sejak
-- WhatsApp diganti Web Push (lihat migration 141): tidak ada lagi kode yang
-- menulis ke situ, jadi "Riwayat WA perayaan" di halaman Monitoring
-- Karyawan selalu kosong/basi. Tabel ini ditulis LANGSUNG oleh pemanggil
-- (bukan di dalam sendPushToUser generik — itu dipakai puluhan fitur lain
-- yang tidak semuanya perayaan) tiap kali salah satu dari 6 event ini
-- terjadi: sapaan pagi ulang tahun/anniversary ke sang perayaan, broadcast
-- ajakan ke rekan kerja, milestone streak presensi, atau notifikasi "ada
-- ucapan baru" ke sang perayaan saat kolega posting greeting.
create table if not exists public.celebration_push_logs (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in (
    'birthday_morning',
    'anniversary_morning',
    'birthday_broadcast',
    'anniversary_broadcast',
    'streak_milestone',
    'greeting_notified'
  )),
  title text not null,
  body text not null,
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists celebration_push_logs_recipient_idx
  on public.celebration_push_logs (recipient_profile_id, created_at desc);
create index if not exists celebration_push_logs_created_at_idx
  on public.celebration_push_logs (created_at desc);

alter table public.celebration_push_logs enable row level security;

-- Admin-only read. Ditulis lewat service-role client (bypass RLS) dari
-- server action/cron — tidak ada jalur insert dari klien.
drop policy if exists celebration_push_logs_admin_read on public.celebration_push_logs;
create policy celebration_push_logs_admin_read on public.celebration_push_logs
  for select using (public.is_admin());

comment on table public.celebration_push_logs is
  'Satu baris per pengiriman push perayaan (birthday/anniversary/streak/greeting) ke SATU penerima — dipakai Monitoring Karyawan utk riwayat & deteksi gap. Pengganti whatsapp_send_logs yang sudah tidak ditulis lagi.';
