-- Security wrapper untuk non-admin assignee:
--   1. SECURITY DEFINER function get_my_needs_assignments() yang return
--      hanya kolom yang BOLEH dilihat assignee (tidak ada running_balance,
--      tidak ada saldo agregat). Cuma return row yang assigned ke
--      current user DAN status needs assignment.
--   2. RLS policy UPDATE supaya assignee bisa resolve (set category +
--      branch) tx mereka. Tx lain di rekening yang sama tetap tidak
--      bisa di-touch.
--
-- Pendekatan ini lebih aman daripada bikin RLS SELECT generic:
-- assignee tidak bisa enumerate tx lain via direct query, dan saldo
-- selalu di-strip di output function.

CREATE OR REPLACE FUNCTION public.get_my_needs_assignments()
RETURNS TABLE (
  id uuid,
  transaction_date date,
  description text,
  source_destination text,
  transaction_details text,
  notes text,
  debit numeric,
  credit numeric,
  category text,
  branch text,
  effective_period_month int,
  effective_period_year int,
  assigned_to_user_id uuid,
  bank_account_id uuid,
  bank_account_name text,
  business_unit text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.transaction_date,
    t.description,
    t.source_destination,
    t.transaction_details,
    t.notes,
    t.debit,
    t.credit,
    t.category,
    t.branch,
    t.effective_period_month,
    t.effective_period_year,
    t.assigned_to_user_id,
    ba.id AS bank_account_id,
    ba.account_name AS bank_account_name,
    ba.business_unit
  FROM public.cashflow_transactions t
  JOIN public.cashflow_statements s ON s.id = t.statement_id
  JOIN public.bank_accounts ba ON ba.id = s.bank_account_id
  WHERE t.assigned_to_user_id = auth.uid()
    AND (t.category = 'Needs Assignment' OR t.branch = 'Needs Assignment')
  ORDER BY t.transaction_date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_needs_assignments() TO authenticated;

-- RLS policy: assignee bisa UPDATE row yang ter-assign ke mereka dengan
-- status needs assignment. WITH CHECK: tidak bisa transfer assignment
-- ke user lain via update (assigned_to_user_id harus tetap = mereka).
CREATE POLICY "cashflow_transactions_assignee_resolve_update"
  ON public.cashflow_transactions FOR UPDATE
  TO authenticated
  USING (
    assigned_to_user_id = auth.uid()
    AND (category = 'Needs Assignment' OR branch = 'Needs Assignment')
  )
  WITH CHECK (assigned_to_user_id = auth.uid());
