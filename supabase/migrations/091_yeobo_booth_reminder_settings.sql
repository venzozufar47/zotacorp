-- Yeobo Booth — pengaturan reminder WhatsApp yang dapat dikonfigurasi.
--
-- Sebelumnya checkpoint (H-7/H-3/H-1), jam kirim (11:00 WIB), dan penerima
-- (daftar WA admin global) semuanya hardcoded di kode. Migrasi ini memberi
-- admin utama & admin Yeobo Booth (can_manage_yeobo_booth) kontrol penuh:
--   1. yeobo_booth_reminder_checkpoints — offset hari (H-N) + jam kirim WIB
--      + on/off + pesan custom opsional. Engine membaca tabel ini, bukan
--      konstanta hardcoded.
--   2. yeobo_booth_reminder_recipients  — daftar nomor WA penerima yang bisa
--      ditambah/dikurang admin (bukan daftar WA admin global).
--   3. relax CHECK checkpoint di yeobo_booth_reminder_logs supaya menerima
--      offset H-N apa pun (mis. 'H-14'), bukan cuma 'H-7'/'H-3'/'H-1'.

-- ── 1. Checkpoint config ──────────────────────────────────────────────
CREATE TABLE public.yeobo_booth_reminder_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Offset hari sebelum tanggal sesi (N pada "H-N"). 0 = hari-H.
  days_before int NOT NULL CHECK (days_before >= 0),
  -- Jam kirim (0–23) di zona Asia/Jakarta.
  send_hour int NOT NULL DEFAULT 11 CHECK (send_hour BETWEEN 0 AND 23),
  enabled boolean NOT NULL DEFAULT true,
  label text,
  -- Pesan custom (placeholder {hari}/{namaKlien}/dst). NULL = pakai
  -- template generik `yeobo_booth_reminder_generic`.
  message_template text
    CHECK (message_template IS NULL OR char_length(message_template) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- 1 baris per offset → checkpoint log 'H-{days_before}' tetap unik.
  UNIQUE (days_before)
);

CREATE TRIGGER yeobo_booth_reminder_checkpoints_updated_at
  BEFORE UPDATE ON public.yeobo_booth_reminder_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.yeobo_booth_reminder_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY yeobo_booth_reminder_checkpoints_select
  ON public.yeobo_booth_reminder_checkpoints FOR SELECT TO authenticated
  USING (public.can_manage_yeobo_booth());
CREATE POLICY yeobo_booth_reminder_checkpoints_write
  ON public.yeobo_booth_reminder_checkpoints FOR ALL TO authenticated
  USING (public.can_manage_yeobo_booth())
  WITH CHECK (public.can_manage_yeobo_booth());

-- Seed default H-7 / H-3 / H-1 jam 11:00 WIB → perilaku awal sama persis
-- dengan engine lama. Idempotent.
INSERT INTO public.yeobo_booth_reminder_checkpoints (days_before, send_hour, label)
VALUES
  (7, 11, 'Koordinasi awal'),
  (3, 11, 'Cek alat & tim'),
  (1, 11, 'Final check & briefing')
ON CONFLICT (days_before) DO NOTHING;

-- ── 2. Penerima reminder (daftar nomor custom) ────────────────────────
-- Pola sama dengan whatsapp_notification_recipients (010) tapi khusus
-- Yeobo Booth & dikelola admin booth. phone_e164 = E.164 tanpa '+'.
CREATE TABLE public.yeobo_booth_reminder_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT '',
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^[1-9][0-9]{6,14}$'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TRIGGER yeobo_booth_reminder_recipients_updated_at
  BEFORE UPDATE ON public.yeobo_booth_reminder_recipients
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.yeobo_booth_reminder_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY yeobo_booth_reminder_recipients_select
  ON public.yeobo_booth_reminder_recipients FOR SELECT TO authenticated
  USING (public.can_manage_yeobo_booth());
CREATE POLICY yeobo_booth_reminder_recipients_write
  ON public.yeobo_booth_reminder_recipients FOR ALL TO authenticated
  USING (public.can_manage_yeobo_booth())
  WITH CHECK (public.can_manage_yeobo_booth());

-- ── 3. Relax CHECK checkpoint di reminder_logs → terima 'H-N' apa pun ──
-- CHECK lama (inline, auto-named) hanya izinkan 'H-7'/'H-3'/'H-1'.
ALTER TABLE public.yeobo_booth_reminder_logs
  DROP CONSTRAINT IF EXISTS yeobo_booth_reminder_logs_checkpoint_check;
ALTER TABLE public.yeobo_booth_reminder_logs
  ADD CONSTRAINT yeobo_booth_reminder_logs_checkpoint_fmt
  CHECK (checkpoint ~ '^H-[0-9]+$');
