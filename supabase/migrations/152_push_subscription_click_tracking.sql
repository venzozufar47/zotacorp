-- Tidak ada cara sinkron utk server bertanya ke browser "izin notifikasi
-- kamu masih aktif?" -- Web Push API tidak punya endpoint semacam itu.
-- Proxy terbaik yang bisa diukur: apakah karyawan PERNAH benar-benar
-- mengetuk sebuah push notification (bukti device-nya hidup & user-nya
-- memang melihat notifikasi, bukan sekadar pernah subscribe lalu
-- permission dicabut/browser di-uninstall). Kolom ini diisi service
-- worker (event notificationclick) lewat POST /api/push/click.
alter table public.push_subscriptions
  add column if not exists last_clicked_at timestamptz;

comment on column public.push_subscriptions.last_clicked_at is
  'Terakhir kali user mengetuk sebuah push notification di device ini (dicatat service worker via POST /api/push/click). NULL = belum pernah, meski subscription-nya ada -- pertanda subscription mungkin sudah tidak benar2 aktif.';
