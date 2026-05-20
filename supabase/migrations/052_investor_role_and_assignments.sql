-- Investor role + per-business-unit assignment table.
-- Role baru di profiles.role + tabel investor_business_unit_assignments
-- (multi-unit). Hanya investor yang punya assignment yang boleh read
-- data finance unit bisnis tsb. Read-only via RLS — DDL untuk read
-- access ada di migration 053; tidak ada policy INSERT/UPDATE/DELETE
-- untuk investor di tabel finance.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'employee', 'investor'));

CREATE TABLE public.investor_business_unit_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_unit TEXT NOT NULL,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, business_unit)
);

CREATE INDEX investor_assignments_user_idx
  ON public.investor_business_unit_assignments(user_id);
CREATE INDEX investor_assignments_bu_idx
  ON public.investor_business_unit_assignments(business_unit);

ALTER TABLE public.investor_business_unit_assignments
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "investor_assign_select_own"
  ON public.investor_business_unit_assignments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "investor_assign_admin_select"
  ON public.investor_business_unit_assignments FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "investor_assign_admin_modify"
  ON public.investor_business_unit_assignments FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Helper dipakai RLS finance untuk gate per-BU.
CREATE OR REPLACE FUNCTION public.is_investor_for_business_unit(bu TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.investor_business_unit_assignments a
      ON a.user_id = p.id
    WHERE p.id = auth.uid()
      AND p.role = 'investor'
      AND a.business_unit = bu
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_investor_for_business_unit(TEXT)
  TO authenticated;
