-- Bind a bank_account to a Google Sheet (read-only public CSV export)
-- as its live source of transactions. Used by the Cash rekening that
-- mirrors a shared Google Sheet — e.g. "Cash Haengbocake Semarang".
--
-- Columns:
--   source_url       — full Google Sheets URL (admin paste from browser).
--   source_sheet     — tab name within the workbook (e.g. "CF SMG").
--   default_branch   — applied to every imported row. The sheet has no
--                      branch column; for this use case every row is
--                      implicitly one cabang (admin sets this when
--                      creating the rekening).
--   last_synced_at   — stamped by the sync endpoint; shown in UI so
--                      admin knows when data was last pulled in.

alter table public.bank_accounts
  add column if not exists source_url text,
  add column if not exists source_sheet text,
  add column if not exists default_branch text,
  add column if not exists last_synced_at timestamptz;
