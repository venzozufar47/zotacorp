-- Shift kasir POS (Buka shift → jual → Tutup shift) menggantikan "Tutup Kas Harian" (195).
--
-- Satu baris `pos_shifts` = satu shift: siapa yang membuka (dan HARUS menutup — kasir yang sama), hitungan
-- kas & hasil stock opname saat buka dan saat tutup, dan selisihnya. Kas "seharusnya" dihitung dari ledger
-- cashflow (lihat src/lib/pos/shift-math.ts). Hanya SATU shift terbuka per rekening
-- (unique index parsial). Transaksi di luar shift ("insidentil") tidak punya shift_id; laporannya dihitung
-- dari jendela waktu (tutup shift terakhir → buka shift berikut), bukan disimpan terpisah.
--
-- Murni penambahan: kolom baru nullable/berdefault, tabel baru. Aman diterapkan SEBELUM kodenya dideploy.
-- Saklar `bank_accounts.shift_mode_enabled` default MATI → POS toko tidak berubah sampai dinyalakan.
-- Terkunci ke service-role seperti modul PRD lain: semua akses lewat `pos-shift.actions.ts`.

create table if not exists public.pos_shifts (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts (id),
  status text not null default 'open' check (status in ('open', 'closed')),

  -- Kasir yang membuka shift; dialah satu-satunya yang boleh menutupnya (selain tutup paksa admin).
  cashier_id uuid not null references public.profiles (id),
  -- Akun yang login di perangkat saat buka/tutup (audit; bisa beda dari kasir).
  opened_by_user uuid references public.profiles (id),
  opened_at timestamptz not null default now(),
  open_opname_id uuid references public.pos_stock_opnames (id),
  open_cash_counted numeric not null check (open_cash_counted >= 0),
  -- null = tidak ada pembanding (shift pertama, atau shift sebelumnya ditutup paksa tanpa hitungan).
  open_cash_expected numeric,
  open_cash_diff numeric generated always as (open_cash_counted - open_cash_expected) stored,
  open_notes text,
  -- Ringkasan transaksi di luar shift sejak shift terakhir ditutup (disnapshot saat buka).
  incidental_report jsonb,

  closed_at timestamptz,
  closed_by_user uuid references public.profiles (id),
  close_opname_id uuid references public.pos_stock_opnames (id),
  close_cash_counted numeric check (close_cash_counted is null or close_cash_counted >= 0),
  close_cash_expected numeric,
  close_cash_diff numeric generated always as (close_cash_counted - close_cash_expected) stored,
  close_notes text,

  -- Tutup paksa admin (kasir lupa menutup). Tanpa hitungan kas/opname.
  forced_by uuid references public.profiles (id),
  force_reason text,

  created_at timestamptz not null default now()
);

create unique index if not exists pos_shifts_one_open_per_account
  on public.pos_shifts (bank_account_id) where status = 'open';
create index if not exists pos_shifts_account_opened_idx
  on public.pos_shifts (bank_account_id, opened_at desc);

alter table public.pos_shifts enable row level security;
drop policy if exists pos_shifts_admin_all on public.pos_shifts;
create policy pos_shifts_admin_all on public.pos_shifts
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.pos_shifts to service_role;

-- Pengeluaran bernota yang dicatat saat buka/tutup shift. Setiap baris juga menjadi transaksi debit di
-- ledger cashflow rekening kas (cashflow_transaction_id); `entered_by` = kasir yang memasukkannya (verifikasi).
create table if not exists public.pos_shift_expenses (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.pos_shifts (id) on delete cascade,
  phase text not null check (phase in ('open', 'close')),
  amount numeric not null check (amount > 0),
  category text not null,
  note text not null,
  -- Path nota. Sebelum shift tersimpan: bucket sementara `cash-closing-photos`; setelah itu dipindah ke
  -- `cashflow-receipts` (sama dengan lampiran transaksi ledger).
  photo_path text,
  entered_by uuid not null references public.profiles (id),
  cashflow_transaction_id uuid references public.cashflow_transactions (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pos_shift_expenses_shift_idx on public.pos_shift_expenses (shift_id);

alter table public.pos_shift_expenses enable row level security;
drop policy if exists pos_shift_expenses_admin_all on public.pos_shift_expenses;
create policy pos_shift_expenses_admin_all on public.pos_shift_expenses
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.pos_shift_expenses to service_role;

-- Penjualan: shift & kasir. cashier_id terisi untuk SEMUA penjualan baru saat mode shift menyala
-- (kasir shift, atau akun login bila insidentil) — struk memakainya; baris lama (null) tetap memakai jadwal.
alter table public.pos_sales
  add column if not exists shift_id uuid references public.pos_shifts (id),
  add column if not exists cashier_id uuid references public.profiles (id);
create index if not exists pos_sales_shift_idx on public.pos_sales (shift_id) where shift_id is not null;

-- Opname: siapa yang melakukannya (kasir shift). Selisih opname yang dibayar tunai tidak perlu kolom sendiri:
-- sudah menjadi kredit "Penyesuaian" di ledger, yang dipakai hitungan kas seharusnya.
alter table public.pos_stock_opnames
  add column if not exists performed_by uuid references public.profiles (id);

alter table public.bank_accounts
  add column if not exists shift_mode_enabled boolean not null default false;
comment on column public.bank_accounts.shift_mode_enabled is
  'true = POS terkunci sampai kasir membuka shift (PIN + opname + hitung kas); false = POS terbuka seperti semula.';
