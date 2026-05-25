-- Yeobo Booth — unit photobooth rental.
--
-- Schema operasional scheduling + booking + master freelance + reminder
-- audit. Pendapatan booking dicatat sebagai single-source-of-truth di
-- yeobo_booth_bookings; saat DP / pelunasan diinput, server action
-- (yeobo-booth.actions.ts) membuat row di cashflow_transactions dan
-- menyimpan FK-nya di kolom dp_cashflow_transaction_id /
-- pelunasan_cashflow_transaction_id. Pola sama dengan POS
-- (pos_sales.cashflow_transaction_id, lihat 034 + 037).
--
-- Access control: admin Zota (is_admin()) atau admin Yeobo Booth
-- (yeobo_booth_admins membership) lewat helper can_manage_yeobo_booth().
-- Investor read laporan ditangani lewat existing investor finance
-- pathways (053 + 054) yang sudah expose per-business_unit; cukup
-- tambah assignment ke business_unit='Yeobo Booth' lewat
-- investor_business_unit_assignments biasa.

-- Seed business unit. Idempotent — pakai ON CONFLICT pada nama supaya
-- migration safe untuk environment yang sudah pernah pakai nama ini.
INSERT INTO public.business_units (name)
VALUES ('Yeobo Booth')
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- Membership: siapa saja admin Yeobo Booth (selain admin Zota global).
-- Pola serupa bank_account_assignees (031): non-admin profile yang
-- listed di sini mendapat akses CRUD penuh ke modul Yeobo Booth tanpa
-- harus jadi admin global.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE public.yeobo_booth_admins (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text
);

ALTER TABLE public.yeobo_booth_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY yeobo_booth_admins_admin_all
  ON public.yeobo_booth_admins FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY yeobo_booth_admins_self_select
  ON public.yeobo_booth_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Helper RLS — apakah caller adalah admin Yeobo Booth (membership
-- table). SECURITY DEFINER agar bisa baca yeobo_booth_admins meskipun
-- caller belum lulus policy lain.
CREATE OR REPLACE FUNCTION public.is_yeobo_booth_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.yeobo_booth_admins
    WHERE user_id = auth.uid()
  );
$$;

-- Gabungan: admin global ATAU admin Yeobo Booth. Dipakai di semua
-- policy yeobo_booth_* supaya tidak repeat OR clause.
CREATE OR REPLACE FUNCTION public.can_manage_yeobo_booth()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.is_yeobo_booth_admin();
$$;

GRANT EXECUTE ON FUNCTION public.is_yeobo_booth_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_yeobo_booth() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- Master freelance — operator/kru lepas yang bertugas di sesi booth.
-- Tidak punya akun login; hanya data referensi yang dipilih saat
-- admin input booking. Soft delete via aktif=false agar booking
-- historis tetap punya referensi nama.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE public.yeobo_booth_freelance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL,
  no_hp text,
  fee_per_sesi numeric(16,2),
  aktif boolean NOT NULL DEFAULT true,
  catatan text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX yeobo_booth_freelance_aktif_idx
  ON public.yeobo_booth_freelance (aktif, nama);

CREATE TRIGGER yeobo_booth_freelance_updated_at
  BEFORE UPDATE ON public.yeobo_booth_freelance
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.yeobo_booth_freelance ENABLE ROW LEVEL SECURITY;

CREATE POLICY yeobo_booth_freelance_manage_select
  ON public.yeobo_booth_freelance FOR SELECT TO authenticated
  USING (public.can_manage_yeobo_booth());

CREATE POLICY yeobo_booth_freelance_manage_write
  ON public.yeobo_booth_freelance FOR ALL TO authenticated
  USING (public.can_manage_yeobo_booth())
  WITH CHECK (public.can_manage_yeobo_booth());

-- ─────────────────────────────────────────────────────────────────────
-- Bookings — satu row per sesi photobooth.
--
-- Harga & jam fleksibel (input bebas per booking, no master paket).
-- Pembayaran 2-tahap opsional: DP dulu lalu pelunasan, atau langsung
-- lunas. Setiap nominal yang masuk auto-membentuk 1 row
-- cashflow_transactions dengan FK disimpan di kolom *_cashflow_*_id
-- (pola POS). Server action yang mengatur orchestration; trigger DB
-- hanya menghandle reversal saat tx dihapus (lihat di bawah).
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE public.yeobo_booth_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  nama_klien text NOT NULL,
  no_hp_klien text,

  tanggal date NOT NULL,
  jam_mulai time NOT NULL,
  jam_selesai time NOT NULL,
  lokasi_event text,

  harga_total numeric(16,2) NOT NULL CHECK (harga_total >= 0),

  payment_status text NOT NULL DEFAULT 'belum_bayar'
    CHECK (payment_status IN ('belum_bayar', 'dp', 'lunas')),

  dp_nominal numeric(16,2) CHECK (dp_nominal IS NULL OR dp_nominal >= 0),
  dp_tanggal date,
  dp_bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  dp_cashflow_transaction_id uuid REFERENCES public.cashflow_transactions(id) ON DELETE SET NULL,

  pelunasan_nominal numeric(16,2) CHECK (pelunasan_nominal IS NULL OR pelunasan_nominal >= 0),
  pelunasan_tanggal date,
  pelunasan_bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  pelunasan_cashflow_transaction_id uuid REFERENCES public.cashflow_transactions(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),

  catatan text,

  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX yeobo_booth_bookings_tanggal_idx
  ON public.yeobo_booth_bookings (tanggal, jam_mulai);
CREATE INDEX yeobo_booth_bookings_status_tanggal_idx
  ON public.yeobo_booth_bookings (status, tanggal);
CREATE INDEX yeobo_booth_bookings_payment_status_idx
  ON public.yeobo_booth_bookings (payment_status);

CREATE TRIGGER yeobo_booth_bookings_updated_at
  BEFORE UPDATE ON public.yeobo_booth_bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.yeobo_booth_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY yeobo_booth_bookings_manage_select
  ON public.yeobo_booth_bookings FOR SELECT TO authenticated
  USING (public.can_manage_yeobo_booth());

CREATE POLICY yeobo_booth_bookings_manage_write
  ON public.yeobo_booth_bookings FOR ALL TO authenticated
  USING (public.can_manage_yeobo_booth())
  WITH CHECK (public.can_manage_yeobo_booth());

-- Investor read access — mirror pola 053 (investor_finance_read).
-- Investor hanya dapat read booking-level metadata yang diperlukan
-- laporan (gross, jumlah sesi). Tidak ada policy WRITE.
CREATE POLICY yeobo_booth_bookings_investor_select
  ON public.yeobo_booth_bookings FOR SELECT TO authenticated
  USING (public.is_investor_for_business_unit('Yeobo Booth'));

-- ─────────────────────────────────────────────────────────────────────
-- M2M: freelance yang ditugaskan di booking. Bisa 1+ freelance per
-- sesi. Soft delete master freelance tidak menghapus baris ini —
-- kalau freelance dihapus hard (jarang), baris di sini cascade-delete.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE public.yeobo_booth_booking_freelance (
  booking_id uuid NOT NULL REFERENCES public.yeobo_booth_bookings(id) ON DELETE CASCADE,
  freelance_id uuid NOT NULL REFERENCES public.yeobo_booth_freelance(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, freelance_id)
);

CREATE INDEX yeobo_booth_booking_freelance_freelance_idx
  ON public.yeobo_booth_booking_freelance (freelance_id);

ALTER TABLE public.yeobo_booth_booking_freelance ENABLE ROW LEVEL SECURITY;

CREATE POLICY yeobo_booth_booking_freelance_manage_select
  ON public.yeobo_booth_booking_freelance FOR SELECT TO authenticated
  USING (public.can_manage_yeobo_booth());

CREATE POLICY yeobo_booth_booking_freelance_manage_write
  ON public.yeobo_booth_booking_freelance FOR ALL TO authenticated
  USING (public.can_manage_yeobo_booth())
  WITH CHECK (public.can_manage_yeobo_booth());

CREATE POLICY yeobo_booth_booking_freelance_investor_select
  ON public.yeobo_booth_booking_freelance FOR SELECT TO authenticated
  USING (public.is_investor_for_business_unit('Yeobo Booth'));

-- ─────────────────────────────────────────────────────────────────────
-- Audit log reminder WhatsApp. 1 row per (booking, checkpoint) sukses
-- atau gagal. UNIQUE constraint jamin idempotency — cron yang ter-fire
-- 2x untuk slot yang sama tidak duplicate kirim.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE public.yeobo_booth_reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.yeobo_booth_bookings(id) ON DELETE CASCADE,
  checkpoint text NOT NULL CHECK (checkpoint IN ('H-7', 'H-3', 'H-1')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message text,
  recipient_count int NOT NULL DEFAULT 0,
  UNIQUE (booking_id, checkpoint)
);

CREATE INDEX yeobo_booth_reminder_logs_booking_idx
  ON public.yeobo_booth_reminder_logs (booking_id);
CREATE INDEX yeobo_booth_reminder_logs_sent_at_idx
  ON public.yeobo_booth_reminder_logs (sent_at DESC);

ALTER TABLE public.yeobo_booth_reminder_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY yeobo_booth_reminder_logs_manage_select
  ON public.yeobo_booth_reminder_logs FOR SELECT TO authenticated
  USING (public.can_manage_yeobo_booth());

-- INSERT/UPDATE/DELETE oleh server action via service-role client.
-- Tidak ada policy INSERT untuk authenticated agar cron endpoint
-- yang resmi saja yang boleh tulis.

-- ─────────────────────────────────────────────────────────────────────
-- Trigger: kalau cashflow_transactions terkait DP/pelunasan dihapus
-- (admin reverse via /admin/finance), reset field pembayaran di
-- booking sehingga UI Yeobo Booth merefleksikan kondisi ledger. Pola
-- sama dengan pos_sales_mark_voided_on_tx_delete (037), kecuali di
-- sini kita reset field individual karena booking masih hidup
-- (booking belum tentu cancelled hanya karena tx-nya hilang — bisa
-- jadi admin mau re-input pembayaran).
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.yeobo_booth_clear_payment_on_tx_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- DP: reset semua field DP + payment_status jatuh ke 'belum_bayar'
  UPDATE public.yeobo_booth_bookings
  SET dp_nominal = NULL,
      dp_tanggal = NULL,
      dp_bank_account_id = NULL,
      dp_cashflow_transaction_id = NULL,
      payment_status = CASE
        WHEN pelunasan_cashflow_transaction_id IS NOT NULL THEN 'lunas'
        ELSE 'belum_bayar'
      END
  WHERE dp_cashflow_transaction_id = OLD.id;

  -- Pelunasan: reset field pelunasan + payment_status turun ke 'dp'
  -- kalau DP masih ada, atau 'belum_bayar' kalau tidak.
  UPDATE public.yeobo_booth_bookings
  SET pelunasan_nominal = NULL,
      pelunasan_tanggal = NULL,
      pelunasan_bank_account_id = NULL,
      pelunasan_cashflow_transaction_id = NULL,
      payment_status = CASE
        WHEN dp_cashflow_transaction_id IS NOT NULL THEN 'dp'
        ELSE 'belum_bayar'
      END
  WHERE pelunasan_cashflow_transaction_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cashflow_tx_clear_yeobo_booth_payment
  ON public.cashflow_transactions;
CREATE TRIGGER cashflow_tx_clear_yeobo_booth_payment
  BEFORE DELETE ON public.cashflow_transactions
  FOR EACH ROW EXECUTE FUNCTION public.yeobo_booth_clear_payment_on_tx_delete();

-- ─────────────────────────────────────────────────────────────────────
-- Sanity check: pelunasan_nominal + dp_nominal tidak boleh melebihi
-- harga_total. Enforce di DB sebagai safety net — UI juga validate.
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.yeobo_booth_bookings
  ADD CONSTRAINT yeobo_booth_bookings_pembayaran_total
  CHECK (
    COALESCE(dp_nominal, 0) + COALESCE(pelunasan_nominal, 0)
    <= harga_total
  );
