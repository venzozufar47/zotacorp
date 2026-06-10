-- Yeobo Booth — tipe booking kedua: "Sewa Space" (space rent).
--
-- Sebelumnya yeobo_booth_bookings hanya memodelkan "Event Hire" (wedding):
-- satu harga_total + alur pembayaran DP/pelunasan. Migrasi ini menambah
-- diskriminator `booking_type` + 4 kolom ekonomi untuk tipe 'space_rent'
-- (operator): revenue = harga_per_sesi × jumlah_sesi; biaya = biaya_sewa_space
-- + (bagi_hasil_per_sesi ?? 0) × jumlah_sesi.
--
-- Additive only. Untuk row space_rent, server action set
-- harga_total = harga_per_sesi × jumlah_sesi (sehingga read harga_total yang
-- sudah ada = revenue), dan CHECK pembayaran lama (063) tetap valid karena
-- dp_nominal/pelunasan_nominal NULL → 0 <= harga_total. RLS & realtime
-- di-inherit dari tabel (tidak ada perubahan).

ALTER TABLE public.yeobo_booth_bookings
  ADD COLUMN booking_type text NOT NULL DEFAULT 'event_hire'
    CHECK (booking_type IN ('event_hire', 'space_rent')),
  ADD COLUMN biaya_sewa_space numeric(16,2)
    CHECK (biaya_sewa_space IS NULL OR biaya_sewa_space >= 0),
  ADD COLUMN harga_per_sesi numeric(16,2)
    CHECK (harga_per_sesi IS NULL OR harga_per_sesi >= 0),
  ADD COLUMN bagi_hasil_per_sesi numeric(16,2)
    CHECK (bagi_hasil_per_sesi IS NULL OR bagi_hasil_per_sesi >= 0),
  ADD COLUMN jumlah_sesi int
    CHECK (jumlah_sesi IS NULL OR jumlah_sesi >= 1);

-- Integrity: space_rent wajib harga_per_sesi + jumlah_sesi; event_hire wajib
-- NULL untuk semua field sewa space. Server action menjaga konsistensi
-- (set/clear kolom sesuai tipe); ini safety net DB.
ALTER TABLE public.yeobo_booth_bookings
  ADD CONSTRAINT yeobo_booth_bookings_type_fields_chk CHECK (
    (booking_type = 'space_rent'
       AND harga_per_sesi IS NOT NULL AND jumlah_sesi IS NOT NULL)
    OR
    (booking_type = 'event_hire'
       AND biaya_sewa_space IS NULL AND harga_per_sesi IS NULL
       AND bagi_hasil_per_sesi IS NULL AND jumlah_sesi IS NULL)
  );

-- Index untuk filter daftar/kalender berdasarkan tipe.
CREATE INDEX yeobo_booth_bookings_type_tanggal_idx
  ON public.yeobo_booth_bookings (booking_type, tanggal);
