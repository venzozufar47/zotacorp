-- Alokasi gaji per-karyawan untuk transaksi Salaries & Wages dengan
-- branch="All" (bulk payroll lewat Flip atau pembayaran kolektif).
-- Tanpa baris alokasi, PnL fallback ke auto-split rata 3 cabang via
-- `expandBranchAllSplits`. Dengan alokasi, PnL pakai breakdown ini.
--
-- Cascade saat tx parent dihapus → alokasi ikut ke-purge.

CREATE TABLE IF NOT EXISTS public.salary_allocations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id uuid NOT NULL
    REFERENCES public.cashflow_transactions(id) ON DELETE CASCADE,
  employee_name text NOT NULL,
  branch text NOT NULL,
  amount numeric(15, 2) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_salary_allocations_tx
  ON public.salary_allocations (transaction_id);

CREATE INDEX IF NOT EXISTS idx_salary_allocations_branch
  ON public.salary_allocations (branch);

COMMENT ON TABLE public.salary_allocations IS
  'Breakdown alokasi tx Salaries & Wages (branch=All) per karyawan → cabang. Dipakai PnL aggregator menggantikan auto-split rata.';

COMMENT ON COLUMN public.salary_allocations.amount IS
  'Nominal alokasi (positif). Jumlah total seluruh alokasi suatu transaction_id harus = tx.debit; validasi di layer aplikasi, bukan DB constraint.';

ALTER TABLE public.salary_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salary_allocations_select_authenticated"
  ON public.salary_allocations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "salary_allocations_admin_modify"
  ON public.salary_allocations FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
