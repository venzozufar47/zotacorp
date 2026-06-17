-- Employment contracts (Perjanjian Kerja) — kontrak kerja yang wajib
-- ditandatangani karyawan sebelum bisa menerima/melihat slip gaji.
--
-- Konsep:
--   * 1 business unit = 1 TEMPLATE bersama (badan/pasal-pasal identik,
--     berisi placeholder {token}). Template juga menyimpan data + tanda
--     tangan PIHAK PERTAMA (Pemberi Kerja) yang dipakai ulang otomatis.
--   * Tiap karyawan = 1 PENERBITAN (employment_contracts) dengan isian
--     placeholder (fields jsonb) + Lampiran 1 / jobdesc (lampiran jsonb)
--     yang berbeda-beda. Row penerbitan SNAPSHOT body + data employer
--     supaya dokumen yang sudah terbit/ditandatangani immutable meski
--     template kelak diedit.
--   * Karyawan menandatangani (e-signature kanvas → PNG) → status 'signed'
--     → PDF rapi dibekukan ke storage (signed_pdf_path). Owner membubuhkan
--     e-meterai Rp10.000 sendiri via web Peruri setelah itu.
--
-- Reuses: is_admin() RLS helper (003), private-bucket + service-role akses
-- pola cake-order-attachments, realtime publish pola (062).

-- profiles.nik — dipakai prefill kontrak (placeholder NIK).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nik text;

-- 1. Template per business unit (badan hukum bersama + data Pemberi Kerja).
CREATE TABLE IF NOT EXISTS public.employment_contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT 'Perjanjian Kerja',
  body_markdown text NOT NULL DEFAULT '',
  kota text,
  employer_name text,
  employer_jabatan text,
  employer_alamat text,
  employer_signature_path text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Penerbitan kontrak per karyawan (snapshot body + employer saat terbit).
CREATE TABLE IF NOT EXISTS public.employment_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.employment_contract_templates(id) ON DELETE SET NULL,
  business_unit text NOT NULL,
  contract_number text,
  status text NOT NULL DEFAULT 'pending_signature'
    CHECK (status IN ('draft', 'pending_signature', 'signed', 'terminated')),

  -- Snapshot badan + data Pemberi Kerja (immutable per penerbitan).
  body_markdown text NOT NULL DEFAULT '',
  kota text,
  employer_name text,
  employer_jabatan text,
  employer_alamat text,
  employer_signature_path text,

  -- Isian per-karyawan.
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,        -- placeholder terisi
  lampiran jsonb NOT NULL DEFAULT '{}'::jsonb,      -- Lampiran 1 (jobdesc)

  -- Tanda tangan PIHAK KEDUA + audit (UU ITE).
  employee_signature_path text,
  employee_signed_at timestamptz,
  employee_signer_name text,
  employee_signer_nik text,
  consent_ip text,
  consent_user_agent text,

  signed_pdf_path text,                              -- PDF immutable hasil TTD

  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employment_contracts_user_status_idx
  ON public.employment_contracts(user_id, status);

-- updated_at trigger (reuse handle_updated_at jika ada; selain itu inline).
CREATE OR REPLACE FUNCTION public.employment_contracts_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS employment_contracts_updated_at ON public.employment_contracts;
CREATE TRIGGER employment_contracts_updated_at
  BEFORE UPDATE ON public.employment_contracts
  FOR EACH ROW EXECUTE FUNCTION public.employment_contracts_touch_updated_at();
DROP TRIGGER IF EXISTS employment_contract_templates_updated_at ON public.employment_contract_templates;
CREATE TRIGGER employment_contract_templates_updated_at
  BEFORE UPDATE ON public.employment_contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.employment_contracts_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. Templates admin-only. Contracts: admin ALL, karyawan baca sendiri.
-- Tulisan (terbit/tanda tangan) lewat server action service-role.
-- ---------------------------------------------------------------------------
ALTER TABLE public.employment_contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employment_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ect_admin_all ON public.employment_contract_templates;
CREATE POLICY ect_admin_all ON public.employment_contract_templates FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS ec_admin_all ON public.employment_contracts;
CREATE POLICY ec_admin_all ON public.employment_contracts FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS ec_self_read ON public.employment_contracts;
CREATE POLICY ec_self_read ON public.employment_contracts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage bucket (privat). Akses lewat service-role server action + signed
-- URL (mirror cake-order-attachments). Path: {contractId}/... atau
-- templates/{templateId}/...
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('employment-contracts', 'employment-contracts', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Realtime: admin dashboard refresh saat karyawan menandatangani.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.employment_contracts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
