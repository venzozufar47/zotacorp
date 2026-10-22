-- Pengadaan & Pengeluaran: satu "nota belanja" berisi baris-baris (bahan baku atau pengeluaran lain).
-- Tiap baris menulis satu baris buku kas (kategori laporan keuangan + foto nota); baris bahan baku juga
-- menulis barang masuk (costing_material_receipts) sehingga stok & harga bahan tetap satu sumber kebenaran.
-- Penulisan lewat service-role di balik gate require* (pola modul pengadaan); RLS = jaring kedua.

create table if not exists public.procurement_purchases (
  id uuid primary key default gen_random_uuid(),
  -- Brand costing, mis. "Haengbocake Pare" (sama dengan costing_materials.business_unit).
  business_unit text not null,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  purchase_date date not null,
  purchase_time text,
  vendor text,
  total numeric(14,2) not null default 0 check (total >= 0),
  -- Foto nota utama (bucket cashflow-receipts). Wajib: setiap pengeluaran harus berbukti.
  receipt_path text not null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pp_bu_date_idx on public.procurement_purchases (business_unit, purchase_date desc, created_at desc);

create table if not exists public.procurement_purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.procurement_purchases(id) on delete cascade,
  sort_order integer not null default 0,
  kind text not null check (kind in ('bahan', 'lain')),
  material_id uuid references public.costing_materials(id) on delete set null,
  -- Yang diketik petugas (satuan beli ATAU satuan pakai) dan hasil konversinya.
  qty_input numeric(16,4),
  unit_input text,
  qty_purchase_units numeric(16,4),
  qty_usage_units numeric(16,4),
  -- Harga per satuan pakai yang sebenarnya dibayar (total / qty_usage_units).
  unit_price_usage numeric(16,6),
  total numeric(14,2) not null check (total > 0),
  category text not null,
  description text not null,
  cashflow_transaction_id uuid references public.cashflow_transactions(id) on delete set null,
  receipt_id uuid references public.costing_material_receipts(id) on delete set null,
  -- Harga acuan bahan sebelum/sesudah pembelian ini (rata-rata tertimbang) — untuk membatalkan saat nota dihapus.
  ref_price_before numeric(16,4),
  ref_price_after numeric(16,4),
  -- 'ok' | 'tinjau' (harga menyimpang jauh dari acuan: tidak mengubah harga acuan, menunggu admin)
  price_flag text not null default 'ok' check (price_flag in ('ok', 'tinjau')),
  created_at timestamptz not null default now()
);

create index if not exists ppl_purchase_idx on public.procurement_purchase_lines (purchase_id, sort_order);
create index if not exists ppl_material_idx on public.procurement_purchase_lines (material_id, created_at desc);

-- Bahan baru diajukan petugas pengadaan; admin meninjau sebelum dipakai di resep.
alter table public.costing_materials
  add column if not exists review_status text not null default 'approved'
    check (review_status in ('approved', 'pending')),
  add column if not exists proposed_by uuid references public.profiles(id) on delete set null;

alter table public.costing_material_receipts
  add column if not exists purchase_line_id uuid references public.procurement_purchase_lines(id) on delete cascade;

-- ═══ RLS ═══
alter table public.procurement_purchases enable row level security;
alter table public.procurement_purchase_lines enable row level security;

drop policy if exists pp_admin_all on public.procurement_purchases;
create policy pp_admin_all on public.procurement_purchases
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists pp_staff_select on public.procurement_purchases;
create policy pp_staff_select on public.procurement_purchases
  for select to authenticated using (public.is_procurement_for_bu(business_unit));

drop policy if exists ppl_admin_all on public.procurement_purchase_lines;
create policy ppl_admin_all on public.procurement_purchase_lines
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists ppl_staff_select on public.procurement_purchase_lines;
create policy ppl_staff_select on public.procurement_purchase_lines
  for select to authenticated using (
    exists (
      select 1 from public.procurement_purchases p
      where p.id = purchase_id and public.is_procurement_for_bu(p.business_unit)
    )
  );

-- Grant eksplisit (tabel baru: Supabase berhenti memberi grant otomatis mulai 30 Okt 2026).
grant select, insert, update, delete on public.procurement_purchases to authenticated, service_role;
grant select, insert, update, delete on public.procurement_purchase_lines to authenticated, service_role;
