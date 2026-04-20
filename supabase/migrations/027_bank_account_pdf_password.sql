-- Store the PDF password per bank account so admin doesn't have to
-- re-enter it every upload. Stored as plaintext since the
-- bank_accounts table is already admin-only via RLS (same trust
-- boundary as Supabase service role key access). Nullable because
-- not every account's PDF is password-protected.
alter table public.bank_accounts
  add column if not exists pdf_password text;
