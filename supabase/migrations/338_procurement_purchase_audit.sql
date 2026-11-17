-- Audit nota pengadaan: petugas menandai nota "Sesuai" setelah mencocokkan foto nota dengan detail inputnya.
-- Kolom nullable (NULL = belum diaudit). Mengedit nota menulis ulang baris nota tanpa kolom ini, jadi hasil editan
-- otomatis kembali ke "belum dicek" dan harus disahkan lagi.
-- Penulisan lewat service-role di balik gate pengadaan; RLS tabel tidak berubah.

alter table public.procurement_purchases
  add column if not exists audited_at timestamptz,
  add column if not exists audited_by uuid references public.profiles(id) on delete set null;

-- Antrean audit: nota belum dicek per cabang, urut tanggal.
create index if not exists pp_unaudited_idx
  on public.procurement_purchases (business_unit, purchase_date desc)
  where audited_at is null;
