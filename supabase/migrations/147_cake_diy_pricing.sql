-- DIY adalah JENIS pesanan (checkbox), independen dari base cake /
-- bentuk / diameter — semua tetap bebas dipilih seperti order biasa.
-- Bedanya cuma harga: DIY tidak ikut matriks base×diameter (karena
-- base cake tidak mempengaruhi harga DIY) — dia punya daftar harga
-- sendiri per diameter, mirror `cake_base_diameter_prices` tanpa
-- dimensi base.
--
-- Riwayat: sebelumnya DIY sempat "dipaksa" jadi baris Diameter 100cm
-- (bikin tim produksi salah baca ukuran), lalu sempat dicoba sebagai
-- pilihan Bentuk — keduanya salah model karena DIY bukan soal
-- diameter atau bentuk, melainkan jenis pesanan yang berdiri sendiri.

alter table public.cake_orders
  add column if not exists is_diy boolean not null default false;

create table if not exists public.cake_diy_diameter_prices (
  diameter_id uuid primary key references public.cake_diameter_options(id) on delete cascade,
  price_pare_idr integer,
  price_semarang_idr integer,
  updated_at timestamptz not null default now(),
  constraint cake_diy_diameter_prices_price_pare_idr_check
    check (price_pare_idr is null or price_pare_idr >= 0),
  constraint cake_diy_diameter_prices_price_semarang_idr_check
    check (price_semarang_idr is null or price_semarang_idr >= 0)
);

comment on table public.cake_diy_diameter_prices is
  'Harga pesanan DIY per diameter — base cake TIDAK mempengaruhi harga DIY (beda dari cake_base_diameter_prices). Dipakai saat cake_orders.is_diy = true; lihat resolveBasePrice di lib/cake-orders/pricing.ts.';

alter table public.cake_diy_diameter_prices enable row level security;

create policy admin_write on public.cake_diy_diameter_prices
  for all using (is_admin()) with check (is_admin());

create policy auth_read on public.cake_diy_diameter_prices
  for select using (is_zota_person());

-- Seed dari harga yang sudah dikonfirmasi: DIY 10cm = Rp 60.000.
-- Cuma diisi kalau baris diameter "Bento" (10cm) masih ada — aman
-- di-skip kalau tidak (mis. migrasi dijalankan di environment lain
-- yang presetnya beda).
insert into public.cake_diy_diameter_prices (diameter_id, price_pare_idr, price_semarang_idr)
select id, 60000, 60000
from public.cake_diameter_options
where diameter_cm = 10
on conflict (diameter_id) do nothing;
