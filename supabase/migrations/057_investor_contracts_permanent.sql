-- Kontrak investor permanen (tak hingga) — durasi_bulan boleh NULL.
-- NULL = kontrak berlaku sampai pemutusan manual; durasi spesifik tetap
-- ber-CHECK > 0 untuk kontrak ber-tenor.

ALTER TABLE investor_contracts
  ALTER COLUMN durasi_bulan DROP NOT NULL;

ALTER TABLE investor_contracts
  DROP CONSTRAINT IF EXISTS investor_contracts_durasi_bulan_check;

ALTER TABLE investor_contracts
  ADD CONSTRAINT investor_contracts_durasi_bulan_check
  CHECK (durasi_bulan IS NULL OR durasi_bulan > 0);
