CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id              uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date            date        NOT NULL,
  checked_in_at   timestamptz NOT NULL,
  checked_out_at  timestamptz,
  latitude        float8,
  longitude       float8,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendance_logs_user_date_unique UNIQUE (user_id, date)
);

CREATE TRIGGER set_attendance_logs_updated_at
  BEFORE UPDATE ON public.attendance_logs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX attendance_logs_user_id_idx ON public.attendance_logs (user_id);
CREATE INDEX attendance_logs_date_idx ON public.attendance_logs (date DESC);
