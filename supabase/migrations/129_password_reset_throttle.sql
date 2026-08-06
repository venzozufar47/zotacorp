-- Throttle untuk permintaan "lupa password" anonim.
--
-- Endpoint lama /api/auth/request-password-reset sengaja dipagari sesi
-- login, dan komentarnya menyebut pagar itu sebagai lapisan pertahanan
-- terhadap penyalahgunaan sekaligus alasan tidak perlu takut enumerasi
-- akun. Masalahnya, orang yang LUPA password tidak bisa login — jadi
-- fitur itu tidak pernah bisa menolong kasus yang paling membutuhkannya.
--
-- Endpoint anonim yang baru melepas pagar tersebut, sehingga kedua
-- perlindungan itu harus digantikan secara eksplisit:
--   1. Enumerasi akun  -> respons SELALU sama, ditangani di route.
--   2. Penyalahgunaan   -> tabel ini.
--
-- Kenapa di database dan bukan Map di memori: Vercel menjalankan banyak
-- instance serverless yang tidak berbagi memori, jadi penghitung
-- in-process bisa dilewati hanya dengan menabrak instance lain. Throttle
-- yang bisa dilewati semudah itu bukan throttle.
--
-- Email disimpan sebagai HASH, bukan teks. Tabel ini menerima input dari
-- siapa pun tanpa autentikasi; menyimpan alamat mentah berarti membangun
-- daftar email yang pernah dicoba orang asing. Hash cukup untuk
-- menghitung, dan tidak berguna kalau bocor.

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash  text NOT NULL,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.password_reset_requests IS
  'Jejak permintaan reset password anonim, untuk throttle. Email disimpan sebagai hash.';
COMMENT ON COLUMN public.password_reset_requests.email_hash IS
  'sha256(lower(trim(email))) — bukan alamat mentah, lihat header migrasi.';

CREATE INDEX IF NOT EXISTS password_reset_requests_email_idx
  ON public.password_reset_requests (email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS password_reset_requests_ip_idx
  ON public.password_reset_requests (ip, created_at DESC)
  WHERE ip IS NOT NULL;

-- RLS menyala TANPA policy apa pun: tabel ini hanya boleh disentuh
-- service-role (yang melewati RLS). Tidak ada peran klien yang punya
-- alasan membaca atau menulisnya.
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
