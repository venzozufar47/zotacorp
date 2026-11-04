-- Pemisahan "dipesan" dan "barang tiba" pada barang masuk bahan baku.
-- Satu baris costing_material_receipts = satu pembelian bahan. Selama arrived_at NULL, barang masih dalam perjalanan:
-- tidak menambah stok estimasi, tetapi dihitung sebagai pasokan yang sedang datang (agar saran belanja tidak dobel).
--  - ordered_at : kapan dipesan (NULL = beli langsung, pesan dan tiba bersamaan, tidak dipakai mengukur lead time)
--  - arrived_at : kapan tiba; NULL = dalam perjalanan. Baris lama dan beli langsung: sama dengan created_at.
--  - expected_at: perkiraan tanggal tiba (hari kerja, Minggu libur)
alter table public.costing_material_receipts
  add column if not exists ordered_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists expected_at date;

update public.costing_material_receipts set arrived_at = created_at where arrived_at is null;

alter table public.costing_material_receipts alter column arrived_at set default now();

create index if not exists cmr_bu_in_transit_idx
  on public.costing_material_receipts (business_unit, material_id)
  where arrived_at is null;

comment on column public.costing_material_receipts.arrived_at is
  'NULL = masih dalam perjalanan (belum menambah stok). Stok estimasi memakai arrived_at sebagai batas waktu, bukan created_at.';

-- Biaya satu kali belanja (dasar EOQ), ditetapkan Owner 2026-11-04.
update public.procurement_settings set ordering_cost = 25000 where ordering_cost = 0;
