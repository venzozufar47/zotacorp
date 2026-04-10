-- Singleton table for company-wide attendance configuration
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_start_time  time        NOT NULL DEFAULT '09:00',
  work_end_time    time        NOT NULL DEFAULT '18:00',
  grace_period_min integer     NOT NULL DEFAULT 15,
  working_days     integer[]   NOT NULL DEFAULT '{1,2,3,4,5}',
  timezone         text        NOT NULL DEFAULT 'Asia/Jakarta',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_attendance_settings_updated_at
  BEFORE UPDATE ON public.attendance_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.attendance_settings (id) VALUES (gen_random_uuid());

ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY attendance_settings_select_authenticated ON public.attendance_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY attendance_settings_update_admin ON public.attendance_settings
  FOR UPDATE TO authenticated USING (public.is_admin());
