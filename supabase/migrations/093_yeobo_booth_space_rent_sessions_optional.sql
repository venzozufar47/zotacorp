-- Yeobo Booth — Sewa Space: jumlah_sesi opsional saat booking dibuat.
--
-- `jumlah_sesi` baru diketahui SETELAH sesi/event selesai, jadi tidak bisa
-- diwajibkan saat create. Relax constraint integritas: space_rent cukup
-- wajib `harga_per_sesi`; `jumlah_sesi` boleh NULL (diisi belakangan via
-- edit). Revenue (harga_total = harga_per_sesi × jumlah_sesi) = 0 selama
-- jumlah_sesi belum diisi.

ALTER TABLE public.yeobo_booth_bookings
  DROP CONSTRAINT IF EXISTS yeobo_booth_bookings_type_fields_chk;

ALTER TABLE public.yeobo_booth_bookings
  ADD CONSTRAINT yeobo_booth_bookings_type_fields_chk CHECK (
    (booking_type = 'space_rent' AND harga_per_sesi IS NOT NULL)
    OR
    (booking_type = 'event_hire'
       AND biaya_sewa_space IS NULL AND harga_per_sesi IS NULL
       AND bagi_hasil_per_sesi IS NULL AND jumlah_sesi IS NULL)
  );
