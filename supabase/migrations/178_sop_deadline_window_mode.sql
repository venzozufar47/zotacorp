-- SOP berulang (sebelumnya "Kebersihan"): mode jam BARU `deadline` = batas waktu.
--
-- Beda dengan `before`/`between` yang MENGUNCI (kiriman setelah jam ditolak
-- server), `deadline` tetap menerima kiriman kapan pun, tetapi yang selesai
-- setelah window_end dicatat TERLAMBAT (status `late` di laporan rentang), dan
-- yang belum selesai begitu jamnya lewat langsung tampil sebagai TIDAK
-- TERCAPAI (`miss`). window_start tidak dipakai (null), window_end wajib diisi
-- — normalizeWindow mengubah deadline tanpa jam menjadi `anytime`.

alter table public.cleaning_assignments
  drop constraint cleaning_assignments_window_mode_check,
  add constraint cleaning_assignments_window_mode_check
    check (window_mode = any (array['anytime', 'before', 'after', 'between', 'deadline']));
