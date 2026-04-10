-- Move working time settings to per-user on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS work_start_time time NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS work_end_time time NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS grace_period_min integer NOT NULL DEFAULT 15;

-- Remove working_days from attendance_settings (keep table for timezone only)
ALTER TABLE public.attendance_settings
  DROP COLUMN IF EXISTS working_days;

-- Add overtime_status to attendance_logs for tracking approval state
ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS overtime_status text DEFAULT NULL
    CHECK (overtime_status IN ('pending','approved','rejected'));
