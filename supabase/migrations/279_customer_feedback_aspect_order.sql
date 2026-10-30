-- Urutan tombol masukan yang DITAMPILKAN ke pelanggan (diacak per pelanggan untuk menghindari bias posisi). Dicatat agar
-- bias posisi bisa diperiksa dan dikoreksi saat analisis. Baris lama (sebelum pengacakan) tetap null.
alter table public.customer_feedback add column if not exists aspect_order text[];
