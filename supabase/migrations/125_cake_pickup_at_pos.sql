-- Pengambilan custom cake ditandai kasir POS cabang, bukan staf cake.
--
-- Latar: yang tahu kue benar-benar diserahkan adalah kasir yang
-- berhadapan dengan customer, tapi selama ini yang menandai "sudah
-- diambil" justru staf cake yang tinggal di kota lain. Sumber
-- kebenarannya dipindah ke kasir.
--
-- CATATAN BASELINE — PENTING:
-- DDL + RLS tabel public.cake_orders TIDAK ada di folder ini; tabelnya
-- dibuat langsung di Supabase (lihat komentar src/lib/cake-orders/types.ts).
-- File ini, seperti 096_cake_discard_free_claim.sql, HANYA berisi ALTER
-- idempoten dan TIDAK bisa dipakai membangun schema dari nol. Jangan
-- menambahkan CREATE TABLE di sini.
--
-- Kenapa tidak menambah status baru: 'done' load-bearing di banyak
-- tempat (setCakeOrderArchived mensyaratkannya, adminLocked di
-- setOrderProductionStatus, lockedFromEdit di CakeOrderDetail, kolom
-- kanban). Menambah 'picked_up' berarti menyisir semua konsumen itu
-- tanpa mendapat apa pun yang tidak diberikan timestamp di bawah.
-- Yang benar-benar hilang selama ini bukan "apa", melainkan
-- "siapa/kapan/lewat jalur mana" — itu yang ditambal kolom ini.

ALTER TABLE public.cake_orders
  ADD COLUMN IF NOT EXISTS picked_up_at timestamptz;
ALTER TABLE public.cake_orders
  ADD COLUMN IF NOT EXISTS picked_up_by uuid REFERENCES auth.users(id);
ALTER TABLE public.cake_orders
  ADD COLUMN IF NOT EXISTS picked_up_via text;

COMMENT ON COLUMN public.cake_orders.picked_up_at IS
  'Waktu kasir POS menandai kue diserahkan. NULL untuk order delivery dan order lama.';
COMMENT ON COLUMN public.cake_orders.picked_up_by IS
  'User yang menandai penyerahan (kasir POS cabang).';
COMMENT ON COLUMN public.cake_orders.picked_up_via IS
  'Jalur penandaan: pos = kasir cabang (normal), staff_board = board staf (order lama / koreksi).';

ALTER TABLE public.cake_orders
  DROP CONSTRAINT IF EXISTS cake_orders_picked_up_via_check;
ALTER TABLE public.cake_orders
  ADD CONSTRAINT cake_orders_picked_up_via_check
  CHECK (picked_up_via IS NULL OR picked_up_via IN ('pos', 'staff_board'));

-- Backfill: order pickup lama semuanya ditutup dari board staf. Ditandai
-- supaya kolom ini terbaca sebagai "ditutup lewat jalur mana", bukan
-- "NULL = tidak tahu" — sehingga laporan bisa membedakan penandaan
-- kasir dari penandaan staf sejak hari pertama.
--
-- picked_up_at SENGAJA dibiarkan NULL untuk baris lama: tidak ada
-- timestamp jujur yang bisa dipakai. Mengisinya dengan updated_at akan
-- mengarang data.
--
-- Pickup dikenali lewat cake_options.needs_address = false, BUKAN
-- mencocokkan string "pickup" pada label — label bisa diubah admin
-- kapan saja lewat /admin/cake-orders/options.
UPDATE public.cake_orders o
SET picked_up_via = 'staff_board'
FROM public.cake_options d
WHERE d.id = o.delivery_option_id
  AND d.needs_address = false
  AND o.status = 'done'
  AND o.picked_up_via IS NULL;

-- Antrian kasir: pickup siap diambil per cabang, urut jadwal.
CREATE INDEX IF NOT EXISTS cake_orders_pickup_queue_idx
  ON public.cake_orders (branch, status, scheduled_at)
  WHERE archived_at IS NULL;
