-- Admin Haengbocake (khusus Finance): akun non-admin-global yang boleh
-- membuka tab Finance di /admin/cake-orders (rekap pembayaran cake) —
-- hanya itu, bukan Order/Produksi/Arsip/Opsi/Akses. Pola sama dengan
-- yeobo_booth_admins (063): daftar keanggotaan yang dikelola admin Zota.
create table if not exists public.cake_finance_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  notes text
);

alter table public.cake_finance_admins enable row level security;

drop policy if exists cake_finance_admins_admin_all on public.cake_finance_admins;
create policy cake_finance_admins_admin_all
  on public.cake_finance_admins for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists cake_finance_admins_self_select on public.cake_finance_admins;
create policy cake_finance_admins_self_select
  on public.cake_finance_admins for select to authenticated
  using (user_id = auth.uid());
