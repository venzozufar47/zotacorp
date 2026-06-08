-- Allow non-round bagi-hasil percentages entered as fractions in the UI
-- (e.g. 50/360 = 13.88889%, 1/36 = 2.77778%). Widen bagi_hasil_pct from
-- NUMERIC(5,2) (2 decimals) to NUMERIC(8,5) (5 decimals). The existing
-- 0..100 CHECK constraint is preserved by ALTER COLUMN TYPE.
ALTER TABLE public.investor_contracts
  ALTER COLUMN bagi_hasil_pct TYPE numeric(8,5);
