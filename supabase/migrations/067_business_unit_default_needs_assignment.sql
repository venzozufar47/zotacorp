-- Default assignee per business unit untuk tx kategori "Needs Assignment".
-- Set sekali → semua tx Needs Assignment (existing yang belum di-assign +
-- semua tx baru ke depan) otomatis ter-assign ke user ini. Admin bisa
-- ubah kapan saja; perubahan opsional backfill existing yang masih NULL.
--
-- Granularity per-BU (bukan per-rekening) supaya 1 karyawan handle
-- semua rekening dalam BU sekaligus (mis. Hasna handle Mandiri + Jago
-- + BCA Yeobo cukup 1 setting).

ALTER TABLE public.business_units
  ADD COLUMN IF NOT EXISTS default_needs_assignment_user_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.business_units.default_needs_assignment_user_id IS
  'User yang otomatis di-assign saat tx di BU ini ber-kategori "Needs Assignment". NULL = tidak ada default (admin manual assign).';
