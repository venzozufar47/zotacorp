-- 115: Costing C1 — paket jasa (Yeobo Booth/Space)
--
-- Untuk produk type='paket_jasa': consumable per event pakai resep bahan
-- (mis. kertas qty = per-cetak × jumlah cetak), plus tiga bucket biaya
-- eksplisit. Depresiasi = alokasi NOMINAL per event (bukan register aset;
-- helper "depresiasi bulanan ÷ estimasi event" dihitung di UI).

alter table public.costing_products
  add column if not exists crew_fee numeric(16,2) not null default 0
    check (crew_fee >= 0),
  add column if not exists transport numeric(16,2) not null default 0
    check (transport >= 0),
  add column if not exists depreciation_per_event numeric(16,2) not null default 0
    check (depreciation_per_event >= 0);
