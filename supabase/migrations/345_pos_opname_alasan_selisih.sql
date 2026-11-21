-- Alasan selisih opname dicatat di opname itu sendiri (kasir tidak lagi harus kembali ke POS untuk catat penarikan /
-- penjualan susulan). Superadmin meninjau lewat /admin/pos/selisih-opname.
--
--   tertukar            salah beri antar produk (nota A, yang diberikan B); dipasangkan lewat diff_swap_label
--   lupa_catat_tarik    kurang: penarikan (expired/rusak/dll) lupa dicatat
--   lupa_catat_jual     kurang: terjual/diberikan tapi tidak lewat kasir
--   bayar_selisih       kurang: kasir mengganti nilainya (uang masuk buku kas, kategori Penyesuaian)
--   lupa_catat_produksi lebih: produksi/penerimaan stok lupa dicatat
--   salah_hitung_awal   lebih: stok awal/hitungan sebelumnya yang keliru
--   belum_diketahui     tidak tahu sebabnya; ditandai untuk ditinjau superadmin
-- Baris tanpa selisih (dan opname lama) tidak punya alasan: kolom null.

alter table public.pos_stock_opname_items
  add column diff_reason text
    check (diff_reason is null or diff_reason in (
      'tertukar', 'lupa_catat_tarik', 'lupa_catat_jual', 'bayar_selisih',
      'lupa_catat_produksi', 'salah_hitung_awal', 'belum_diketahui'
    )),
  add column diff_swap_label text;

create index pos_stock_opname_items_reason_idx
  on public.pos_stock_opname_items (diff_reason) where diff_reason is not null;
