CREATE TABLE IF NOT EXISTS public.overtime_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_log_id uuid        NOT NULL REFERENCES public.attendance_logs(id) ON DELETE CASCADE,
  user_id           uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date              date        NOT NULL,
  overtime_minutes  integer     NOT NULL,
  reason            text        NOT NULL,
  status            text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  admin_note        text,
  reviewed_by       uuid        REFERENCES public.profiles(id),
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT overtime_requests_log_unique UNIQUE (attendance_log_id)
);

CREATE INDEX IF NOT EXISTS overtime_requests_user_id_idx ON public.overtime_requests (user_id);
CREATE INDEX IF NOT EXISTS overtime_requests_status_idx ON public.overtime_requests (status);
CREATE INDEX IF NOT EXISTS overtime_requests_date_idx ON public.overtime_requests (date DESC);

CREATE TRIGGER set_overtime_requests_updated_at
  BEFORE UPDATE ON public.overtime_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY overtime_requests_select_own ON public.overtime_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY overtime_requests_select_admin ON public.overtime_requests
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY overtime_requests_insert_own ON public.overtime_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY overtime_requests_update_admin ON public.overtime_requests
  FOR UPDATE TO authenticated USING (public.is_admin());
