-- Per-branch investor contracts for Yeobo Space.
--
-- A Yeobo Space investor can be connected to specific physical branches
-- (Tlogosari / Tembalang / Jebres), each with its own contract terms +
-- profit-share + payouts. "Connected to a branch" = a contract row with
-- that branch set.
--
-- branch = NULL keeps the legacy per-BU behaviour (Haengbocake + any
-- pre-existing Yeobo contract) untouched — no backfill.

ALTER TABLE public.investor_contracts
  ADD COLUMN IF NOT EXISTS branch TEXT;

-- The old UNIQUE(user_id, business_unit) blocks more than one contract
-- per (user, BU). Replace it with a branch-aware unique index. Raw NULLs
-- are distinct in Postgres, so COALESCE(branch,'') is used to keep
-- NULL-branch rows colliding per (user, BU) — i.e. still at most one
-- BU-level contract, plus one contract per named branch.
ALTER TABLE public.investor_contracts
  DROP CONSTRAINT IF EXISTS investor_contracts_user_id_business_unit_key;

CREATE UNIQUE INDEX IF NOT EXISTS investor_contracts_user_bu_branch_key
  ON public.investor_contracts (user_id, business_unit, COALESCE(branch, ''));
