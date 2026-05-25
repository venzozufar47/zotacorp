-- Mapping nama karyawan → cabang untuk auto-fill branch transaksi
-- gaji (Salaries & Wages) saat rule engine tidak menemukan keyword
-- cabang eksplisit (Yeotem/Yeosol/Yeosari) di deskripsi.
--
-- Per business_unit supaya nama yang sama bisa coexist antar BU
-- (mis. "Hasna" hanya muncul untuk Yeobo Space). Whole-word
-- case-insensitive matching dilakukan di pipeline categorize.ts.

CREATE TABLE IF NOT EXISTS public.employee_branch_map (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_unit text NOT NULL,
  name_keyword text NOT NULL,
  branch text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT employee_branch_map_unique_keyword
    UNIQUE (business_unit, name_keyword)
);

CREATE INDEX IF NOT EXISTS idx_employee_branch_map_bu
  ON public.employee_branch_map (business_unit);

COMMENT ON TABLE public.employee_branch_map IS
  'Lookup karyawan → cabang, dipakai pipeline categorize.ts untuk auto-fill branch pada transaksi Salaries & Wages.';

COMMENT ON COLUMN public.employee_branch_map.name_keyword IS
  'Substring nama yang akan dicari di description tx (whole-word, case-insensitive). Contoh: "Hasna", "Ika".';

COMMENT ON COLUMN public.employee_branch_map.branch IS
  'Cabang tujuan untuk auto-fill (mis. "Tlogosari", "Tembalang", "Jebres", "All").';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_employee_branch_map_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_branch_map_updated_at
  ON public.employee_branch_map;

CREATE TRIGGER employee_branch_map_updated_at
  BEFORE UPDATE ON public.employee_branch_map
  FOR EACH ROW
  EXECUTE FUNCTION public.set_employee_branch_map_updated_at();

-- RLS: authenticated boleh SELECT (dibutuhkan oleh API auto-categorize
-- yang dipanggil admin & investor-readonly nantinya); modify hanya admin.
ALTER TABLE public.employee_branch_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_branch_map_select_authenticated"
  ON public.employee_branch_map FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "employee_branch_map_admin_modify"
  ON public.employee_branch_map FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
