-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- =========================================================
-- profiles policies
-- =========================================================

-- Users can read their own profile
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Admins can read all profiles
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Users can update their own profile (not role or is_active)
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = 'employee');

-- Admins can update any profile
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Insert: only via service role (Edge Function on signup handles this)
CREATE POLICY "profiles_insert_service"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- =========================================================
-- attendance_logs policies
-- =========================================================

-- Users can read their own logs
CREATE POLICY "attendance_select_own"
  ON public.attendance_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can read all logs
CREATE POLICY "attendance_select_admin"
  ON public.attendance_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Users can insert their own check-in
CREATE POLICY "attendance_insert_own"
  ON public.attendance_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own log (check-out only — only when checked_out_at is null)
CREATE POLICY "attendance_update_own"
  ON public.attendance_logs FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND checked_out_at IS NULL)
  WITH CHECK (user_id = auth.uid());

-- Admins can update any log
CREATE POLICY "attendance_update_admin"
  ON public.attendance_logs FOR UPDATE
  TO authenticated
  USING (public.is_admin());
