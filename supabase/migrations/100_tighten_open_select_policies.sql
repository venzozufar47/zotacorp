-- Security audit 2026-07: tiga tabel punya SELECT `USING (true)` untuk semua
-- user terautentikasi — terlalu terbuka:
--
--   1. salary_allocations   → nama karyawan + nominal alokasi gaji terbaca
--      oleh SEMUA user login (karyawan/investor mana pun). Pembaca sah hanya
--      admin (UI alokasi) dan investor Yeobo via P&L aggregator
--      (src/lib/cashflow/pnl-yeobo.ts membaca dengan client user-scoped di
--      dashboard investor).
--   2. whatsapp_notification_recipients → nomor HP admin terbaca semua user.
--      Kebijakan terbuka dulunya dibutuhkan jalur notif check-in karyawan
--      (fonnte.ts membaca di scope request karyawan); kini fonnte.ts membaca
--      via service-role sehingga policy terbuka tidak diperlukan lagi.
--   3. employee_branch_map  → keyword nama karyawan + cabang terbaca semua
--      user. Pembacanya (pipeline categorize) berjalan di route admin / cron
--      service-role, jadi admin-only cukup.
--
-- Catatan: policy `FOR ALL ... USING (is_admin())` yang sudah ada di ketiga
-- tabel tetap meng-cover SELECT untuk admin (policy bersifat permissive/OR),
-- jadi cukup DROP policy terbuka + tambah jalur investor utk salary_allocations.

-- 1) salary_allocations ------------------------------------------------------
DROP POLICY IF EXISTS "salary_allocations_select_authenticated"
  ON public.salary_allocations;

-- Investor hanya boleh membaca alokasi milik transaksi pada business unit
-- yang di-assign padanya (pola mig 053/054). Join berjalan di bawah RLS
-- invoker: investor memang bisa membaca tx/statement/bank_account BU-nya.
CREATE POLICY "salary_allocations_select_investor_bu"
  ON public.salary_allocations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cashflow_transactions t
      JOIN public.cashflow_statements st ON st.id = t.statement_id
      JOIN public.bank_accounts ba ON ba.id = st.bank_account_id
      WHERE t.id = salary_allocations.transaction_id
        AND public.is_investor_for_business_unit(ba.business_unit)
    )
  );

-- 2) whatsapp_notification_recipients ---------------------------------------
DROP POLICY IF EXISTS "wa_recipients_read_authenticated"
  ON public.whatsapp_notification_recipients;

-- 3) employee_branch_map -----------------------------------------------------
DROP POLICY IF EXISTS "employee_branch_map_select_authenticated"
  ON public.employee_branch_map;
