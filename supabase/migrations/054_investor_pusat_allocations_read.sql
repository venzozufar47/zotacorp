-- Investor butuh baca cashflow_pusat_allocations supaya warning
-- "Pusat belum teralokasi" tidak salah-positif di PnL view. Tanpa
-- policy ini, policy admin-only di table tsb return 0 rows untuk
-- investor → fetchPnL menganggap semua bucket unallocated meski
-- admin sudah lakukan alokasi. Visi investor tetap read-only —
-- tidak ada policy INSERT/UPDATE/DELETE.

CREATE POLICY "cashflow_pusat_allocations_investor_select"
  ON public.cashflow_pusat_allocations FOR SELECT
  TO authenticated
  USING (public.is_investor_for_business_unit(business_unit));
