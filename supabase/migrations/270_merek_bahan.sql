-- Merek bahan di Pengadaan (PRD docs/pengadaan/prd-merek-bahan.md): merek terdaftar per bahan, riwayat merek yang dipakai,
-- penautan merek ke baris nota & barang masuk, dan profil kop Daftar Bahan Halal (Lampiran 5). Merek OPSIONAL: semua
-- kolom penaut nullable, jadi data lama tetap valid tanpa backfill. Tulis lewat service-role di balik gate pengadaan.

create table if not exists public.costing_material_brands (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.costing_materials(id) on delete restrict,
  -- Sama dengan bahan; dipakai gerbang akses/RLS.
  business_unit text not null,
  name text not null check (char_length(name) between 1 and 80),
  producer text,
  country text,
  halal_status text not null default 'belum_dicek' check (halal_status in ('bersertifikat', 'tidak_wajib', 'belum_dicek')),
  halal_issuer text,
  halal_cert_no text,
  halal_valid_until date,
  -- Foto/PDF sertifikat (bucket cashflow-receipts, awalan halal-certs/).
  halal_doc_path text,
  halal_note text,
  -- Merek berhenti dipakai: nonaktif, tidak dihapus (riwayat nota & ekspor periode lalu).
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists cmb_material_name_uq on public.costing_material_brands (material_id, lower(name));
create index if not exists cmb_bu_idx on public.costing_material_brands (business_unit, is_active);

-- Riwayat merek yang dipakai per bahan ("bulan X memakai merek apa"). ended_on null = sedang dipakai; satu per bahan.
create table if not exists public.costing_material_brand_usage (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.costing_materials(id) on delete cascade,
  brand_id uuid not null references public.costing_material_brands(id) on delete cascade,
  business_unit text not null,
  started_on date not null,
  ended_on date,
  -- 'auto' = dari barang masuk; 'manual' = ketukan petugas "Ganti merek dipakai".
  source text not null default 'auto' check (source in ('auto', 'manual')),
  created_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on)
);
create unique index if not exists cmbu_open_uq on public.costing_material_brand_usage (material_id) where ended_on is null;
create index if not exists cmbu_material_idx on public.costing_material_brand_usage (material_id, started_on desc);

alter table public.procurement_purchase_lines
  add column if not exists brand_id uuid references public.costing_material_brands(id) on delete set null;
alter table public.costing_material_receipts
  add column if not exists brand_id uuid references public.costing_material_brands(id) on delete set null;

-- "Jenis Bahan" Lampiran 5 (null = belum diisi) dan apakah bahan masuk Daftar Halal (bawaan semua, termasuk kemasan).
alter table public.costing_materials
  add column if not exists halal_kind text check (halal_kind in ('baku', 'tambahan', 'penolong')),
  add column if not exists in_halal_list boolean not null default true;

-- Kop dokumen Lampiran 5, satu baris per cabang.
create table if not exists public.procurement_halal_profiles (
  business_unit text primary key,
  business_name text,
  place text,
  owner_name text,
  halal_supervisor_name text,
  updated_at timestamptz not null default now()
);
insert into public.procurement_halal_profiles (business_unit, business_name, place, owner_name, halal_supervisor_name)
values
  ('Haengbocake Pare', 'Haengbocake Pare', 'Pare', 'Avenzoar', 'Inggrita Putri Kusuma Wardani'),
  ('Haengbocake Semarang', 'Haengbocake Semarang', 'Semarang', 'Avenzoar', 'Inggrita Putri Kusuma Wardani')
on conflict (business_unit) do nothing;

-- ═══ RLS ═══ (jaring kedua; penulisan lewat service-role)
alter table public.costing_material_brands enable row level security;
alter table public.costing_material_brand_usage enable row level security;
alter table public.procurement_halal_profiles enable row level security;

drop policy if exists cmb_admin_all on public.costing_material_brands;
create policy cmb_admin_all on public.costing_material_brands for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists cmb_staff_select on public.costing_material_brands;
create policy cmb_staff_select on public.costing_material_brands for select to authenticated using (public.is_procurement_for_bu(business_unit));

drop policy if exists cmbu_admin_all on public.costing_material_brand_usage;
create policy cmbu_admin_all on public.costing_material_brand_usage for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists cmbu_staff_select on public.costing_material_brand_usage;
create policy cmbu_staff_select on public.costing_material_brand_usage for select to authenticated using (public.is_procurement_for_bu(business_unit));

drop policy if exists phf_admin_all on public.procurement_halal_profiles;
create policy phf_admin_all on public.procurement_halal_profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists phf_staff_select on public.procurement_halal_profiles;
create policy phf_staff_select on public.procurement_halal_profiles for select to authenticated using (public.is_procurement_for_bu(business_unit));

-- Grant eksplisit (tabel baru: Supabase berhenti memberi grant otomatis mulai 30 Okt 2026).
grant select, insert, update, delete on public.costing_material_brands to authenticated, service_role;
grant select, insert, update, delete on public.costing_material_brand_usage to authenticated, service_role;
grant select, insert, update, delete on public.procurement_halal_profiles to authenticated, service_role;
