-- Log Keluhan & Insiden Pelanggan (PRD-3) — Formulir Lampiran C Dokumen 6.
-- Sumber data metrik "keluhan per 1.000 transaksi" di scorecard cabang
-- (PRD-2, belum ada). Kasus alergi/sakit = kode merah: langsung diteruskan
-- Owner saat itu juga (SOP 5.5, 8.4), bukan menunggu rekap harian.
--
-- Terkunci ke service-role seperti modul PRD lain sesi ini — akses staf
-- lewat `customer-complaints.actions.ts`.

create table public.customer_complaints (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Pare', 'Semarang')),
  occurred_at timestamptz not null default now(),
  kind text not null check (
    kind in ('produk', 'layanan', 'alergi_sakit', 'pelanggan_mengganggu', 'barang_tertinggal', 'lainnya')
  ),
  source text not null default 'toko' check (source in ('toko', 'sosmed', 'google_maps', 'pesan')),
  description text not null,
  product_or_tx_ref text,
  action_taken text,
  compensation text,
  status text not null default 'open' check (status in ('open', 'closed')),
  reported_by uuid not null references public.profiles (id),
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index customer_complaints_branch_idx
  on public.customer_complaints (branch, occurred_at desc);
create index customer_complaints_status_idx
  on public.customer_complaints (status, occurred_at desc);

alter table public.customer_complaints enable row level security;

create policy customer_complaints_admin_all on public.customer_complaints
  for all using (public.is_admin()) with check (public.is_admin());

grant all on public.customer_complaints to service_role;
