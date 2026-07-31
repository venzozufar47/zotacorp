-- Modul Pengadaan (procurement) — monitoring stok bahan baku.
--
-- Masalah: modul costing hanya menyimpan HARGA bahan; tidak ada kuantitas
-- stok sama sekali, sehingga tak ada yang tahu kapan bahan harus dibeli.
--
-- Model akses: TABEL KEANGGOTAAN, bukan nilai `profiles.role` baru.
-- Pengadaan adalah tugas lintas-fungsi (orangnya tetap karyawan biasa —
-- tetap absen, tetap terima slip gaji), bukan kelas login seperti investor.
-- Pola yang diikuti: studio_heads (106_tickets.sql) + per-unit-bisnis
-- seperti investor_business_unit_assignments (052).
--
-- Model stok: OPNAME BERKALA saja (keputusan produk). Tidak ada ledger
-- pemakaian harian dan tidak menurunkan konsumsi dari penjualan POS.
-- Di antara dua opname, stok = opname terakhir + barang masuk − (pemakaian
-- harian × hari berjalan). Itu ESTIMASI, dan UI wajib mengatakannya.
--
-- business_unit sengaja TEXT (bukan FK) — konsisten dengan seluruh tabel
-- costing_* (alasannya di 110_costing.sql:5-8), karena yang dipantau
-- adalah costing_materials.business_unit.

-- ═════════════════════ 1. Penugasan + helper akses ═════════════════════

create table if not exists public.procurement_assignments (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  business_unit text not null,
  assigned_at   timestamptz not null default now(),
  assigned_by   uuid references public.profiles(id) on delete set null,
  notes         text,
  primary key (user_id, business_unit)
);
create index if not exists procurement_assignments_bu_idx
  on public.procurement_assignments (business_unit);

-- Punya >=1 penugasan (menentukan nav + akses halaman).
create or replace function public.is_procurement_staff()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.procurement_assignments where user_id = auth.uid()
  );
$$;

-- Ditugaskan untuk satu unit bisnis tertentu.
create or replace function public.is_procurement_for_bu(bu text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.procurement_assignments
    where user_id = auth.uid() and business_unit = bu
  );
$$;

grant execute on function public.is_procurement_staff() to authenticated;
grant execute on function public.is_procurement_for_bu(text) to authenticated;

alter table public.procurement_assignments enable row level security;

drop policy if exists procurement_assignments_admin_all on public.procurement_assignments;
create policy procurement_assignments_admin_all on public.procurement_assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Self-select supaya access.ts bisa membaca daftar BU-nya sendiri.
drop policy if exists procurement_assignments_self_select on public.procurement_assignments;
create policy procurement_assignments_self_select on public.procurement_assignments
  for select to authenticated using (user_id = auth.uid());

-- ═════════════════════ 2. Setelan global (singleton) ═══════════════════
-- Pola 005_create_attendance_settings.sql. Service level ditentukan
-- superadmin; per-bahan boleh override (kolom di tabel berikutnya).

create table if not exists public.procurement_settings (
  id                  uuid primary key default gen_random_uuid(),
  service_level       numeric(6,4)  not null default 0.9500
                      check (service_level > 0 and service_level < 1),
  ordering_cost       numeric(16,2) not null default 0 check (ordering_cost >= 0),
  holding_rate_annual numeric(6,4)  not null default 0.2000 check (holding_rate_annual >= 0),
  review_period_days  integer       not null default 7 check (review_period_days > 0),
  usage_cv            numeric(6,4)  not null default 0.2500 check (usage_cv >= 0),
  updated_by          uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists procurement_settings_touch on public.procurement_settings;
create trigger procurement_settings_touch before update on public.procurement_settings
  for each row execute function public.costing_touch_updated_at();

insert into public.procurement_settings (id)
select gen_random_uuid()
where not exists (select 1 from public.procurement_settings);

alter table public.procurement_settings enable row level security;
drop policy if exists procurement_settings_admin_all on public.procurement_settings;
create policy procurement_settings_admin_all on public.procurement_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Staf boleh MEMBACA (agar paham dari mana angkanya), tidak boleh mengubah.
drop policy if exists procurement_settings_staff_select on public.procurement_settings;
create policy procurement_settings_staff_select on public.procurement_settings
  for select to authenticated using (public.is_procurement_staff());

-- ═════════════════ 3. Parameter pengadaan per bahan ════════════════════
-- Tabel terpisah (1:1 costing_materials), bukan kolom tambahan di
-- costing_materials — supaya staf pengadaan punya tabel yang boleh mereka
-- tulis tanpa membuka kolom harga bahan (harga tetap hak admin).

create table if not exists public.costing_material_procurement (
  material_id uuid primary key
    references public.costing_materials(id) on delete cascade,
  -- Denormalisasi untuk RLS + index tanpa join. Server action selalu
  -- mengisinya dari business_unit bahannya (tak pernah dari payload klien).
  business_unit text not null,

  -- Diisi staf pengadaan.
  avg_daily_usage      numeric(16,4) not null default 0 check (avg_daily_usage >= 0),
  lead_time_days       numeric(8,2)  not null default 0 check (lead_time_days >= 0),
  -- Variasi opsional. NULL = belum ada data → kalkulator pakai proxy CV
  -- dan UI WAJIB menandai asumsinya.
  usage_sigma_daily    numeric(16,4) check (usage_sigma_daily >= 0),
  lead_time_sigma_days numeric(8,2)  check (lead_time_sigma_days >= 0),

  -- Batasan pembelian, dalam SATUAN BELI (sak/pack), bukan satuan pakai.
  moq_purchase_units   numeric(16,4) not null default 0 check (moq_purchase_units >= 0),
  order_multiple_units numeric(16,4) not null default 1 check (order_multiple_units > 0),

  supplier   text,
  is_tracked boolean not null default true,
  notes      text,

  -- Override kebijakan — HANYA admin yang boleh mengubah (dijaga di
  -- server action; staf melihatnya read-only).
  service_level_override numeric(6,4)
    check (service_level_override > 0 and service_level_override < 1),

  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cmp_bu_idx
  on public.costing_material_procurement (business_unit, is_tracked);
drop trigger if exists cmp_touch on public.costing_material_procurement;
create trigger cmp_touch before update on public.costing_material_procurement
  for each row execute function public.costing_touch_updated_at();

-- ══════════════════════ 4. Opname bahan baku ═══════════════════════════
-- Pola 039_pos_stock.sql. Kolom snapshot supaya riwayat tetap terbaca
-- setelah bahan di-rename / di-reprice.

create table if not exists public.costing_material_opnames (
  id uuid primary key default gen_random_uuid(),
  business_unit text not null,
  opname_date date not null,
  opname_time text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cmo_bu_created_idx
  on public.costing_material_opnames (business_unit, created_at desc);

create table if not exists public.costing_material_opname_items (
  id uuid primary key default gen_random_uuid(),
  opname_id uuid not null
    references public.costing_material_opnames(id) on delete cascade,
  material_id uuid not null
    references public.costing_materials(id) on delete restrict,
  material_name_snapshot text not null,
  usage_unit_snapshot    text not null,
  -- Rp per SATUAN PAKAI saat dihitung. 6 desimal: Rp/gram bisa sangat kecil.
  unit_cost_snapshot     numeric(16,6) not null default 0,
  physical_qty numeric(16,4) not null check (physical_qty >= 0),
  -- Estimasi sistem saat commit. Boleh negatif (model over-consume).
  expected_qty numeric(16,4) not null default 0,
  unique (opname_id, material_id)
);
create index if not exists cmoi_material_idx
  on public.costing_material_opname_items (material_id, id);

-- ═══════════════════════ 5. Barang masuk ═══════════════════════════════
-- Satu baris = satu pembelian yang sudah DITERIMA. Tanpa dokumen PO
-- (tanpa status draft/dipesan/diterima) — keputusan produk.

create table if not exists public.costing_material_receipts (
  id uuid primary key default gen_random_uuid(),
  business_unit text not null,
  material_id uuid not null
    references public.costing_materials(id) on delete restrict,

  qty_purchase_units numeric(16,4) not null check (qty_purchase_units > 0),
  -- Snapshot konversi saat diterima. WAJIB: kalau content_per_purchase
  -- bahan diubah nanti, stok masa lalu TIDAK boleh ikut berubah.
  content_per_purchase_snapshot numeric(16,4) not null
    check (content_per_purchase_snapshot > 0),
  qty_usage_units numeric(16,4) not null check (qty_usage_units > 0),

  unit_price_paid numeric(16,2) check (unit_price_paid >= 0),
  total_paid      numeric(16,2) check (total_paid >= 0),
  supplier text,
  -- Link yang dipakai saat beli. Catatan historis — BUKAN sumber
  -- kebenaran; sumbernya tetap costing_materials.shopee_url.
  purchase_url_snapshot text,
  receipt_date date not null,
  receipt_time text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cmr_bu_date_idx
  on public.costing_material_receipts (business_unit, receipt_date desc);
-- Index kunci model on-hand: "barang masuk setelah cut-off opname".
create index if not exists cmr_material_created_idx
  on public.costing_material_receipts (material_id, created_at desc);

-- ═══════════════════════════ 6. RLS ════════════════════════════════════
-- Admin penuh; staf pengadaan sesuai unit bisnis yang ditugaskan.
-- Penulisan praktisnya lewat service-role di balik gate `require*` —
-- RLS di sini jaring kedua (pola modul costing).

alter table public.costing_material_procurement enable row level security;
alter table public.costing_material_opnames enable row level security;
alter table public.costing_material_opname_items enable row level security;
alter table public.costing_material_receipts enable row level security;

drop policy if exists cmp_admin_all on public.costing_material_procurement;
create policy cmp_admin_all on public.costing_material_procurement
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists cmp_staff_rw on public.costing_material_procurement;
create policy cmp_staff_rw on public.costing_material_procurement
  for all to authenticated
  using (public.is_procurement_for_bu(business_unit))
  with check (public.is_procurement_for_bu(business_unit));

drop policy if exists cmo_admin_all on public.costing_material_opnames;
create policy cmo_admin_all on public.costing_material_opnames
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists cmo_staff_select on public.costing_material_opnames;
create policy cmo_staff_select on public.costing_material_opnames
  for select to authenticated using (public.is_procurement_for_bu(business_unit));
drop policy if exists cmo_staff_insert on public.costing_material_opnames;
create policy cmo_staff_insert on public.costing_material_opnames
  for insert to authenticated with check (public.is_procurement_for_bu(business_unit));

drop policy if exists cmoi_admin_all on public.costing_material_opname_items;
create policy cmoi_admin_all on public.costing_material_opname_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists cmoi_staff_select on public.costing_material_opname_items;
create policy cmoi_staff_select on public.costing_material_opname_items
  for select to authenticated using (exists (
    select 1 from public.costing_material_opnames o
    where o.id = opname_id and public.is_procurement_for_bu(o.business_unit)));
drop policy if exists cmoi_staff_insert on public.costing_material_opname_items;
create policy cmoi_staff_insert on public.costing_material_opname_items
  for insert to authenticated with check (exists (
    select 1 from public.costing_material_opnames o
    where o.id = opname_id and public.is_procurement_for_bu(o.business_unit)));

drop policy if exists cmr_admin_all on public.costing_material_receipts;
create policy cmr_admin_all on public.costing_material_receipts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists cmr_staff_select on public.costing_material_receipts;
create policy cmr_staff_select on public.costing_material_receipts
  for select to authenticated using (public.is_procurement_for_bu(business_unit));
drop policy if exists cmr_staff_insert on public.costing_material_receipts;
create policy cmr_staff_insert on public.costing_material_receipts
  for insert to authenticated with check (public.is_procurement_for_bu(business_unit));

-- Satu-satunya pelonggaran pada tabel costing yang sudah ada: staf boleh
-- MEMBACA master bahan unit bisnisnya. TIDAK ada policy untuk
-- costing_products / costing_recipe_items / costing_material_price_history
-- → resep, HPP, margin, dan harga jual tetap admin-only di lapisan DB.
drop policy if exists costing_materials_procurement_select on public.costing_materials;
create policy costing_materials_procurement_select on public.costing_materials
  for select to authenticated
  using (public.is_procurement_for_bu(business_unit));
