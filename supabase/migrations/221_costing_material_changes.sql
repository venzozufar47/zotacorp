-- Jejak perubahan daftar bahan oleh petugas pengadaan (sepengetahuan owner).
-- Petugas menambah/mengubah detail bahan sendiri; owner cukup melihat ("Sudah dilihat") atau mengurungkan.
-- `sensitive` = memengaruhi HPP/stok (isi per kemasan, satuan, nonaktif) → owner diberi notifikasi.
create table if not exists public.costing_material_changes (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references public.costing_materials(id) on delete set null,
  business_unit text not null,
  material_name text not null,
  action text not null check (action in ('create','update','deactivate','reactivate')),
  changes jsonb not null default '{}'::jsonb,
  sensitive boolean not null default false,
  changed_by uuid references public.profiles(id) on delete set null,
  acked_by uuid references public.profiles(id) on delete set null,
  acked_at timestamptz,
  reverted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists cmc_unacked_idx on public.costing_material_changes (created_at desc) where acked_at is null;
create index if not exists cmc_material_idx on public.costing_material_changes (material_id, created_at desc);

alter table public.costing_material_changes enable row level security;
drop policy if exists cmc_admin_all on public.costing_material_changes;
create policy cmc_admin_all on public.costing_material_changes for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists cmc_staff_select on public.costing_material_changes;
create policy cmc_staff_select on public.costing_material_changes for select to authenticated using (public.is_procurement_for_bu(business_unit));

grant select, insert, update, delete on public.costing_material_changes to authenticated, service_role;
