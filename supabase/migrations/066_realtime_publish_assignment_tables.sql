-- Tambah salary_allocations + employee_branch_map ke publication
-- supabase_realtime supaya postgres_changes event sampai ke client.
-- Tanpa publish, RealtimeRefresher silent no-op.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.salary_allocations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_branch_map;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
