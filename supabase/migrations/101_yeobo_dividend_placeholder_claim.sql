-- Placeholder investor + claim-link auto-connect.
--
-- Beberapa investor Yeobo belum punya akun. Admin mengisi slot dividen
-- dengan PLACEHOLDER (nama saja) lalu membagikan "claim link" rahasia.
-- Saat calon investor mendaftar lewat link itu, placeholder otomatis
-- tersambung ke akun barunya (kontrak dibuat + backfill payout) — tanpa
-- perlu tahu email lebih dulu.
--
--   placeholder_name    : nama asli calon investor (tampil di UI)
--   placeholder_contact : opsional (WA/email) — catatan admin, bukan match key
--   claim_token         : rahasia; DIBAGI oleh semua slot milik 1 orang
--                          (lintas cabang) → 1 link menyambungkan semuanya.
--                          Dikosongkan (NULL) begitu terklaim.
ALTER TABLE yeobo_dividend_recipients
  ADD COLUMN IF NOT EXISTS placeholder_name text,
  ADD COLUMN IF NOT EXISTS placeholder_contact text,
  ADD COLUMN IF NOT EXISTS claim_token text;

-- Lookup cepat saat klaim: token aktif (belum terpakai, belum ter-link).
CREATE INDEX IF NOT EXISTS yeobo_dividend_recipients_claim_token_idx
  ON yeobo_dividend_recipients (claim_token)
  WHERE claim_token IS NOT NULL AND user_id IS NULL;

-- RLS tetap admin-only (kebijakan ydiv_recipients_admin_all dari migrasi 081).
-- Klaim dijalankan server-side via service-role, bukan lewat RLS.
