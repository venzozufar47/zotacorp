ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_flexible_schedule boolean NOT NULL DEFAULT false;

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('on_time','late','late_excused','flexible','unknown')),
  ADD COLUMN IF NOT EXISTS late_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_proof_url text,
  ADD COLUMN IF NOT EXISTS is_overtime boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overtime_minutes integer NOT NULL DEFAULT 0;
