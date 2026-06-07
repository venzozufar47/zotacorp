-- Collapse the per-contract dual bagi-hasil rate (before/after BEP) back into
-- ONE flat rate. The before/after-BEP distinction now lives ONLY in the Yeobo
-- dividend pool (yeobo_dividend_branch_config.mgmt_pct_before_bep /
-- mgmt_pct_after_bep), not per investor contract.
--
-- The surviving single rate is the existing bagi_hasil_pct column. Migration
-- 072 added bagi_hasil_pct_before_bep / _after_bep and the app always kept
-- bagi_hasil_pct in sync with the before-BEP value, so collapsing onto
-- bagi_hasil_pct loses no data for the single-rate model.
--
-- The BEP TARGET (bep_target_idr) and its recoup-progress tracking are NOT
-- affected by this change and remain in place.

ALTER TABLE public.investor_contracts
  DROP CONSTRAINT IF EXISTS investor_contracts_bagi_hasil_before_bep_range,
  DROP CONSTRAINT IF EXISTS investor_contracts_bagi_hasil_after_bep_range;

ALTER TABLE public.investor_contracts
  DROP COLUMN IF EXISTS bagi_hasil_pct_before_bep,
  DROP COLUMN IF EXISTS bagi_hasil_pct_after_bep;
