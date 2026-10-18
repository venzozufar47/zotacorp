-- Menambah kategori izin "lainnya" (selain sakit dan izin keluar toko).
alter table public.leave_requests drop constraint if exists leave_requests_kind_check;
alter table public.leave_requests
  add constraint leave_requests_kind_check check (kind in ('sakit', 'izin_keluar_toko', 'lainnya'));
