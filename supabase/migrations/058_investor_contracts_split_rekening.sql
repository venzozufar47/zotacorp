-- Pisah kolom rekening payout jadi bank_name + nomor untuk input
-- yang lebih terstruktur. payout_rekening_label tetap di-keep untuk
-- backward compat + sebagai display fallback (manual paste yang
-- belum ke-migrasi).

ALTER TABLE investor_contracts
  ADD COLUMN IF NOT EXISTS payout_bank_name TEXT,
  ADD COLUMN IF NOT EXISTS payout_rekening_number TEXT;
