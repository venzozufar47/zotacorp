-- Klaim gratis karyawan atas Ready Cake: jalur stok keluar yang tercatat.
--
-- Masalah: Tasya menandai ready cake sebagai "klaim gratis karyawan" (total Rp0), tetapi stok Ready Cake tidak ikut
-- berkurang dan kartunya tetap di kolom Siap. Kue sebenarnya sudah diambil karyawan, sehingga opname kasir (5 Nov 2026,
-- Pare) menemukan Ready Cake DIY "kurang 1" dan memaksa kasir membayar selisih Rp60.000 ke laci.
--
-- Perbaikan: alasan penarikan baru 'klaim_karyawan' (kelompok terpakai, BUKAN susut). Kode kini menulis baris keluar
-- bertanda alasan ini, memakai penanda yang sudah ada (cake_orders.free_claim / free_claim_at / free_claim_by) untuk
-- pencatatan siapa & kapan, dan menutup kartu otomatis.
alter table public.pos_stock_movements drop constraint if exists pos_stock_movements_withdrawal_reason_check;
alter table public.pos_stock_movements
  add constraint pos_stock_movements_withdrawal_reason_check
  check (
    withdrawal_reason is null
    or (
      type = 'withdrawal'
      and withdrawal_reason in (
        'expired', 'rusak', 'gagal_produksi', 'testing', 'konten', 'konsumsi_internal',
        'hadiah_kompensasi', 'order_admin_cake', 'klaim_karyawan', 'konversi_sku', 'koreksi_input', 'lainnya'
      )
    )
  );

-- Backfill kasus yang memicu masalah: "ready klaim mba ana" (Pare, DIY) diklaim 5 Nov 2026 10:34 WIB. Baris keluar
-- diberi created_at = saat klaim, jadi jatuh SEBELUM semua opname hari itu dan tidak mengubah stok sekarang (mesin stok
-- hanya menghitung gerakan setelah opname terakhir).
update public.cake_orders
   set status = 'done', picked_up_at = free_claim_at, picked_up_by = free_claim_by, picked_up_via = 'staff_board'
 where id = '48b5d656-3e2b-4e2c-9cbf-d2cc65bf7aec'
   and is_ready_stock and free_claim and status = 'ready';

insert into public.pos_stock_movements
  (bank_account_id, product_id, variant_id, type, qty, notes, withdrawal_reason, cake_order_id,
   movement_date, movement_time, created_by, created_at)
select '947136f6-4458-40e6-9c4b-fd3a2a183a9f', '40f0d37c-77ea-4cb6-8316-53651185d624', 'e56e727e-1c92-4e34-9a54-94e350593b29',
       'withdrawal', 1, 'Klaim gratis karyawan (dicatat admin cake) — dicatat belakangan', 'klaim_karyawan', o.id,
       (o.free_claim_at at time zone 'Asia/Jakarta')::date,
       to_char(o.free_claim_at at time zone 'Asia/Jakarta', 'HH24:MI'),
       o.free_claim_by, o.free_claim_at
  from public.cake_orders o
 where o.id = '48b5d656-3e2b-4e2c-9cbf-d2cc65bf7aec'
   and o.free_claim
   and not exists (
     select 1 from public.pos_stock_movements m where m.cake_order_id = o.id and m.type = 'withdrawal'
   );
