-- Per-rekening custom category list. Set for cash rekening where the
-- admin manages the category dropdown themselves (different from the
-- accounting-style preset baked into categories.ts). Stored as a
-- JSONB array of strings; null means "use the default preset".
alter table public.bank_accounts
  add column if not exists custom_categories jsonb;
