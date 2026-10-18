-- Tutup Kas Harian (PRD-1) — rekonsiliasi kas harian per cabang Haengbocake.
--
-- Dua tahap konfirmasi mencerminkan SOP "kas dihitung dua orang: satu
-- menghitung, satu memverifikasi" (Dokumen 4 §2.1): staf A mengisi form
-- (counted_by), staf B meninjau lalu menandai verified_by — orang yang
-- berbeda (check di bawah), kecuali admin yang boleh jadi verifier darurat
-- saat satu cabang hanya berisi satu orang.
--
-- cash_pos/qris_pos/void_count/void_total DIBEKUKAN sebagai snapshot saat
-- staf menyimpan (bukan dihitung ulang setelahnya) — diambil otomatis dari
-- `pos_sales`, bukan diinput manual, supaya tidak ada selisih yang
-- sebenarnya cuma salah ketik ulang angka yang sudah ada di sistem.
--
-- Terkunci sepenuhnya ke service-role: tidak ada RLS select/write untuk
-- non-admin. Semua akses staf lewat `cash-closing.actions.ts`, yang
-- menjalankan `requireAdminOrPosAssignee(bank_account_id)` — gate yang
-- sama dipakai untuk input sale di /pos — sebelum memakai admin client.

create table public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts (id),
  closing_date date not null,

  -- Snapshot otomatis dari pos_sales, dibekukan saat submit.
  cash_pos numeric not null default 0,
  qris_pos numeric not null default 0,
  void_count integer not null default 0,
  void_total numeric not null default 0,

  -- Input manual staf saat tutup toko.
  cash_physical numeric not null,
  cash_diff numeric generated always as (cash_physical - cash_pos) stored,
  qris_received numeric not null default 0,
  petty_cash_opening numeric not null default 0,
  petty_cash_closing numeric not null default 0,
  token_kwh_remaining numeric,
  token_photo_path text,
  notes text,

  status text not null default 'pending_verification'
    check (status in ('pending_verification', 'verified')),
  counted_by uuid not null references public.profiles (id),
  counted_at timestamptz not null default now(),
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (bank_account_id, closing_date),
  check (verified_by is null or verified_by <> counted_by)
);

create index cash_closings_bank_account_idx
  on public.cash_closings (bank_account_id, closing_date desc);

alter table public.cash_closings enable row level security;

create policy cash_closings_admin_all on public.cash_closings
  for all using (public.is_admin()) with check (public.is_admin());

grant all on public.cash_closings to service_role;

-- Rincian pengeluaran kas kecil — nota wajib per pengeluaran (Dokumen 4
-- §2.2), jadi satu baris per pengeluaran, bukan satu angka gabungan.
create table public.cash_closing_petty_expenses (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.cash_closings (id) on delete cascade,
  amount numeric not null check (amount > 0),
  note text,
  photo_path text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index cash_closing_petty_expenses_closing_idx
  on public.cash_closing_petty_expenses (closing_id);

alter table public.cash_closing_petty_expenses enable row level security;

create policy cash_closing_petty_expenses_admin_all on public.cash_closing_petty_expenses
  for all using (public.is_admin()) with check (public.is_admin());

grant all on public.cash_closing_petty_expenses to service_role;

insert into storage.buckets (id, name, public)
values ('cash-closing-photos', 'cash-closing-photos', false)
on conflict (id) do nothing;

-- Admin-only direct bucket access, sama pola dengan cashflow-receipts
-- (migrasi 038) dan cleaning-photos: non-admin tidak pernah menyentuh
-- storage langsung, hanya lewat signed URL yang diterbitkan action.
drop policy if exists cash_closing_photos_admin_select on storage.objects;
drop policy if exists cash_closing_photos_admin_insert on storage.objects;
drop policy if exists cash_closing_photos_admin_delete on storage.objects;

create policy cash_closing_photos_admin_select
  on storage.objects for select to authenticated
  using (bucket_id = 'cash-closing-photos' and public.is_admin());

create policy cash_closing_photos_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'cash-closing-photos' and public.is_admin());

create policy cash_closing_photos_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'cash-closing-photos' and public.is_admin());
