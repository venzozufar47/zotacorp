-- Cheap count untuk badge nav di Sidebar/BottomNav. Dipanggil di
-- (employee)/layout.tsx setiap navigation — harus cepat. SECURITY
-- DEFINER bypass RLS supaya non-admin user bisa hitung tx mereka
-- sendiri tanpa harus baca tabel.

CREATE OR REPLACE FUNCTION public.count_my_needs_assignments()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.cashflow_transactions
  WHERE assigned_to_user_id = auth.uid()
    AND (category = 'Needs Assignment' OR branch = 'Needs Assignment');
$$;

GRANT EXECUTE ON FUNCTION public.count_my_needs_assignments() TO authenticated;
