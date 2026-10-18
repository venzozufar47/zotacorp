-- Opsi "tukar shift" dihapus dari fitur izin (hanya izin sakit & izin keluar toko).
-- Guard: menolak bila sudah ada pengajuan tukar shift supaya tidak ada data yang hilang diam-diam
-- (saat dibuat tabel masih 0 baris).
do $$
declare n bigint;
begin
  select count(*) into n from public.leave_requests where kind = 'tukar_shift';
  if n > 0 then raise exception 'leave_requests berisi % pengajuan tukar_shift — tidak dibuang', n; end if;
end $$;

alter table public.leave_requests drop constraint if exists leave_requests_kind_check;
alter table public.leave_requests
  add constraint leave_requests_kind_check check (kind in ('sakit', 'izin_keluar_toko'));

alter table public.leave_requests drop column if exists swap_date;
alter table public.leave_requests drop column if exists swap_with_user_id;
