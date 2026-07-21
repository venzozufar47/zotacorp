-- 110: HPP Calculator (modul costing) — MVP Fase 1 + slice repricing
--
-- HPP TIDAK disimpan; selalu diturunkan dari komponen (resep + TKL +
-- overhead) di src/lib/costing/calc.ts. Skema hanya menyimpan input.
--
-- Brand-aware lewat kolom string `business_unit` (dicocokkan ke
-- business_units.name) mengikuti konvensi rumah — bukan FK, supaya
-- pola rename-cascade tetap jalan.
--
-- Akses MVP: admin-only. RLS = public.is_admin() (003_rls_policies.sql).
-- Konversi satuan per-bahan (isi per satuan beli), bukan tabel global.

-- Trigger touch updated_at bersama untuk tabel-tabel costing.
create or replace function public.costing_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- 1. Master bahan --------------------------------------------------------
create table if not exists public.costing_materials (
  id uuid primary key default gen_random_uuid(),
  business_unit text not null,
  name text not null,
  category text,
  purchase_unit text not null,                       -- satuan beli (mis. "sak")
  purchase_price numeric(16,2) not null check (purchase_price >= 0),
  content_per_purchase numeric(16,4) not null check (content_per_purchase > 0),
  usage_unit text not null,                          -- satuan pakai (mis. "gram")
  price_updated_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists costing_materials_bu_idx
  on public.costing_materials(business_unit, is_active);

drop trigger if exists costing_materials_touch on public.costing_materials;
create trigger costing_materials_touch before update on public.costing_materials
  for each row execute function public.costing_touch_updated_at();

-- 2. Riwayat harga bahan (slice repricing) -------------------------------
create table if not exists public.costing_material_price_history (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.costing_materials(id) on delete cascade,
  purchase_price numeric(16,2) not null,
  content_per_purchase numeric(16,4) not null,
  effective_from timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);
create index if not exists costing_mph_material_idx
  on public.costing_material_price_history(material_id, effective_from desc);

-- 3. Master produk (+ biaya per-batch + pricing di-fold) -----------------
create table if not exists public.costing_products (
  id uuid primary key default gen_random_uuid(),
  business_unit text not null,
  name text not null,
  category text,
  type text not null default 'resep' check (type in ('resep', 'paket_jasa')),
  yield_qty numeric(12,3) not null default 1 check (yield_qty > 0),
  yield_unit text,
  labor numeric(16,2) not null default 0 check (labor >= 0),
  packaging numeric(16,2) not null default 0 check (packaging >= 0),
  overhead_method text not null default 'persen' check (overhead_method in ('persen', 'nominal')),
  overhead_percent numeric(6,4) not null default 0 check (overhead_percent >= 0),
  overhead_nominal numeric(16,2) not null default 0 check (overhead_nominal >= 0),
  price_method text not null default 'margin' check (price_method in ('margin', 'markup')),
  target_percent numeric(6,4) not null default 0 check (target_percent >= 0),
  rounding_unit integer not null default 1000 check (rounding_unit > 0),
  rounding_mode text not null default 'nearest' check (rounding_mode in ('floor', 'nearest', 'ceil')),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists costing_products_bu_idx
  on public.costing_products(business_unit, is_active);

drop trigger if exists costing_products_touch on public.costing_products;
create trigger costing_products_touch before update on public.costing_products
  for each row execute function public.costing_touch_updated_at();

-- 4. Baris resep ---------------------------------------------------------
-- material_id on delete restrict: cegah hapus bahan yang masih dipakai
-- (server pakai soft-delete is_active=false untuk kasus ini).
create table if not exists public.costing_recipe_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.costing_products(id) on delete cascade,
  material_id uuid not null references public.costing_materials(id) on delete restrict,
  qty numeric(16,4) not null default 0 check (qty >= 0),   -- dalam satuan pakai bahan
  shrink_factor numeric(6,4) not null default 0 check (shrink_factor >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists costing_recipe_items_product_idx
  on public.costing_recipe_items(product_id, sort_order);
create index if not exists costing_recipe_items_material_idx
  on public.costing_recipe_items(material_id);

drop trigger if exists costing_recipe_items_touch on public.costing_recipe_items;
create trigger costing_recipe_items_touch before update on public.costing_recipe_items
  for each row execute function public.costing_touch_updated_at();

-- RLS: admin-only untuk semua tabel costing (MVP). ----------------------
alter table public.costing_materials enable row level security;
alter table public.costing_material_price_history enable row level security;
alter table public.costing_products enable row level security;
alter table public.costing_recipe_items enable row level security;

drop policy if exists costing_materials_admin on public.costing_materials;
create policy costing_materials_admin on public.costing_materials for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists costing_mph_admin on public.costing_material_price_history;
create policy costing_mph_admin on public.costing_material_price_history for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists costing_products_admin on public.costing_products;
create policy costing_products_admin on public.costing_products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists costing_recipe_items_admin on public.costing_recipe_items;
create policy costing_recipe_items_admin on public.costing_recipe_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
