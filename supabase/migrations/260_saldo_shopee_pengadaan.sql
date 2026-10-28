-- Saldo Shopee: sumber uang ketiga bagi pengadaan (di luar uang pengadaan dan uang laci kasir).
--
-- Saldo = saldo awal + Σ tambah saldo (transferan dari owner) − Σ nota ber-sumber 'shopee'. Tidak ada kolom saldo
-- yang disimpan, jadi tidak bisa tidak cocok dengan riwayatnya.
-- Nota 'shopee' TIDAK menulis baris buku kas: uangnya sudah tercatat sebagai pengeluaran di rekening bank saat owner
-- mentransfer ke ShopeePay petugas, jadi mencatatnya lagi akan menghitung ganda di laporan laba-rugi.

alter table public.procurement_purchases drop constraint if exists procurement_purchases_money_source_check;
alter table public.procurement_purchases
  add constraint procurement_purchases_money_source_check check (money_source in ('pengadaan', 'laci', 'shopee'));

-- Saldo awal per cabang (brand costing, mis. "Haengbocake Pare").
create table public.procurement_shopee_wallets (
  business_unit text primary key,
  opening_balance numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

insert into public.procurement_shopee_wallets (business_unit, opening_balance) values
  ('Haengbocake Pare', 80585),
  ('Haengbocake Semarang', 0);

-- Tambah saldo: tanpa bukti transfer (keputusan Owner).
create table public.procurement_shopee_topups (
  id uuid primary key default gen_random_uuid(),
  business_unit text not null,
  amount numeric(14,2) not null check (amount > 0),
  topup_date date not null,
  topup_time text,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index pst_bu_date_idx on public.procurement_shopee_topups (business_unit, topup_date desc, created_at desc);

alter table public.procurement_shopee_wallets enable row level security;
alter table public.procurement_shopee_topups enable row level security;

create policy psw_admin_all on public.procurement_shopee_wallets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy psw_staff_select on public.procurement_shopee_wallets
  for select to authenticated using (public.is_procurement_for_bu(business_unit));

create policy pst_admin_all on public.procurement_shopee_topups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pst_staff_select on public.procurement_shopee_topups
  for select to authenticated using (public.is_procurement_for_bu(business_unit));

-- Grant eksplisit (tabel baru: Supabase berhenti memberi grant otomatis mulai 30 Okt 2026).
grant select on public.procurement_shopee_wallets to authenticated;
grant select on public.procurement_shopee_topups to authenticated;
grant select, insert, update, delete on public.procurement_shopee_wallets to service_role;
grant select, insert, update, delete on public.procurement_shopee_topups to service_role;
revoke all on public.procurement_shopee_wallets from anon;
revoke all on public.procurement_shopee_topups from anon;
