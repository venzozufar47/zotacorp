-- Pindah uang antar kantong pengadaan: pengadaan (uang dipegang petugas), laci (isi laci kasir), dompet (Shopee/Seabank).
--
-- Tidak ada kolom saldo yang disimpan. Saldo tiap kantong tetap diturunkan dari riwayat:
--   dompet    = saldo awal + tambah saldo + pindah masuk − pindah keluar − nota ber-sumber dompet
--   laci      = hitungan shift + gerakan buku kas + pindah masuk − pindah keluar   (lihat cashMovementInWindow)
--   pengadaan = saldo buku kas − isi laci − (pindah neto ke dompet)
-- Pindah uang TIDAK menulis baris buku kas: uangnya tetap milik cabang, hanya berpindah kantong.

create table public.procurement_pocket_transfers (
  id uuid primary key default gen_random_uuid(),
  business_unit text not null,
  -- Rekening kas cabang (jendela laci diukur dari sini).
  bank_account_id uuid not null references public.bank_accounts (id),
  from_pocket text not null check (from_pocket in ('pengadaan', 'laci', 'dompet')),
  to_pocket text not null check (to_pocket in ('pengadaan', 'laci', 'dompet')),
  amount numeric(14,2) not null check (amount > 0),
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_pocket <> to_pocket)
);

create index ppt_bu_created_idx on public.procurement_pocket_transfers (business_unit, created_at desc);
create index ppt_acct_created_idx on public.procurement_pocket_transfers (bank_account_id, created_at);

alter table public.procurement_pocket_transfers enable row level security;

create policy ppt_admin_all on public.procurement_pocket_transfers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ppt_staff_select on public.procurement_pocket_transfers
  for select to authenticated using (public.is_procurement_for_bu(business_unit));

-- Grant eksplisit (tabel baru: Supabase berhenti memberi grant otomatis mulai 30 Okt 2026).
grant select on public.procurement_pocket_transfers to authenticated;
grant select, insert, update, delete on public.procurement_pocket_transfers to service_role;
revoke all on public.procurement_pocket_transfers from anon;
