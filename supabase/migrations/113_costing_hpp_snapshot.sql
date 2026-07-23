-- 113: Costing B2 — snapshot HPP (tren dari waktu ke waktu)
--
-- HPP tetap tidak disimpan sbg sumber kebenaran; snapshot ini murni
-- histori (satu baris per produk per tanggal) untuk melihat tren &
-- mendeteksi kenaikan HPP. Diisi lewat tombol manual + cron bulanan.

create table if not exists public.costing_hpp_snapshot (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.costing_products(id) on delete cascade,
  business_unit text not null,
  snapshot_date date not null,
  hpp_unit numeric(16,2) not null,
  final_price numeric(16,2),
  margin_percent numeric(6,4),
  breakdown_json jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (product_id, snapshot_date)
);
create index if not exists costing_hpp_snapshot_product_idx
  on public.costing_hpp_snapshot(product_id, snapshot_date desc);

alter table public.costing_hpp_snapshot enable row level security;
drop policy if exists costing_hpp_snapshot_admin on public.costing_hpp_snapshot;
create policy costing_hpp_snapshot_admin on public.costing_hpp_snapshot for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
