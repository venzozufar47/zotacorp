-- Audit trail untuk resign karyawan. Toggle: admin set is_active=false
-- → resigned_at=now() + resigned_by=admin.id. Toggle balik aktif:
-- is_active=true, kolom audit DIPERTAHANKAN sebagai history "pernah
-- resign tanggal X, kembali aktif".
--
-- Berbeda dari is_active=false TANPA resigned_at (legacy/probation drop).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS resigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS resigned_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_resigned_at
  ON public.profiles (resigned_at)
  WHERE resigned_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.resigned_at IS
  'Timestamp tagging resign. NULL = belum pernah di-tag resign. Tetap dipertahankan kalau admin re-activate (audit history).';

COMMENT ON COLUMN public.profiles.resigned_by IS
  'Admin yang nge-tag resign. Pair dengan resigned_at.';
