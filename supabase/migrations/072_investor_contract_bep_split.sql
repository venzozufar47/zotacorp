-- Split investor contract profit-share into before-BEP and after-BEP
-- rates. Previously a single `bagi_hasil_pct` applied flat; investors
-- typically negotiate a higher share before break-even and a lower one
-- after (or vice-versa), so admins need to record both.
--
-- Additive + backwards-compatible: existing `bagi_hasil_pct` column is
-- kept (the app keeps writing it = before-BEP value) so any legacy
-- reader / sibling branch keeps working. New rows backfill both new
-- columns from the existing single rate.

ALTER TABLE public.investor_contracts
  ADD COLUMN IF NOT EXISTS bagi_hasil_pct_before_bep NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS bagi_hasil_pct_after_bep NUMERIC(5,2);

-- Backfill from the existing flat rate.
UPDATE public.investor_contracts
SET
  bagi_hasil_pct_before_bep = COALESCE(bagi_hasil_pct_before_bep, bagi_hasil_pct),
  bagi_hasil_pct_after_bep  = COALESCE(bagi_hasil_pct_after_bep, bagi_hasil_pct);

-- Lock them down once populated.
ALTER TABLE public.investor_contracts
  ALTER COLUMN bagi_hasil_pct_before_bep SET DEFAULT 0,
  ALTER COLUMN bagi_hasil_pct_after_bep SET DEFAULT 0;

UPDATE public.investor_contracts
SET bagi_hasil_pct_before_bep = 0 WHERE bagi_hasil_pct_before_bep IS NULL;
UPDATE public.investor_contracts
SET bagi_hasil_pct_after_bep = 0 WHERE bagi_hasil_pct_after_bep IS NULL;

ALTER TABLE public.investor_contracts
  ALTER COLUMN bagi_hasil_pct_before_bep SET NOT NULL,
  ALTER COLUMN bagi_hasil_pct_after_bep SET NOT NULL;

ALTER TABLE public.investor_contracts
  ADD CONSTRAINT investor_contracts_bagi_hasil_before_bep_range
    CHECK (bagi_hasil_pct_before_bep >= 0 AND bagi_hasil_pct_before_bep <= 100),
  ADD CONSTRAINT investor_contracts_bagi_hasil_after_bep_range
    CHECK (bagi_hasil_pct_after_bep >= 0 AND bagi_hasil_pct_after_bep <= 100);
