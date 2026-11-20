-- Pesanan tertunda / custom cake yang ditinggal ke shift berikutnya, dengan alasan kasir saat menutup shift.
-- Satu baris per pesanan per penutupan shift: riwayatnya dipakai menandai pesanan yang terus ditunda.
create table if not exists public.pos_shift_carryovers (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts (id) on delete cascade,
  shift_id uuid not null references public.pos_shifts (id) on delete cascade,
  kind text not null check (kind in ('sale', 'cake')),
  -- pos_sales.id (kind = 'sale') atau cake_orders.id (kind = 'cake'); tanpa FK karena dua tabel berbeda.
  ref_id uuid not null,
  label text not null,
  amount numeric not null default 0,
  reason_code text not null,
  reason_note text,
  cashier_name text,
  created_at timestamptz not null default now()
);

create index if not exists pos_shift_carryovers_ref_idx on public.pos_shift_carryovers (ref_id, created_at desc);
create index if not exists pos_shift_carryovers_account_idx on public.pos_shift_carryovers (bank_account_id, created_at desc);

alter table public.pos_shift_carryovers enable row level security;
drop policy if exists pos_shift_carryovers_admin_all on public.pos_shift_carryovers;
create policy pos_shift_carryovers_admin_all on public.pos_shift_carryovers
  for all using (public.is_admin()) with check (public.is_admin());

-- Tabel public baru tidak lagi otomatis terjangkau Data API (mulai 30 Okt 2026): beri grant eksplisit.
grant select on public.pos_shift_carryovers to authenticated;
grant all on public.pos_shift_carryovers to service_role;
