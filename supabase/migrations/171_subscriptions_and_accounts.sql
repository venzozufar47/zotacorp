-- Management Subscription + Management Akun (admin-only).
--
-- Subscription: satu langganan punya >=1 baris alokasi (BU + cabang + nominal).
-- Langganan 1 unit = 1 alokasi 100%; langganan yang dibagi = beberapa alokasi
-- dengan nominal bebas (tidak harus rata) yang jumlahnya WAJIB sama dengan
-- nominal langganan (dijaga fungsi save_subscription).
--
-- Akun: password TIDAK disimpan di tabel. Disimpan di Supabase Vault
-- (terenkripsi, kunci dikelola Supabase) dan tabel hanya memegang id secret-nya.
-- Fungsi vault hanya bisa dipanggil service_role — admin yang login pun tidak
-- bisa membaca password lewat klien biasa, hanya lewat server action yang
-- memeriksa role admin.

-- ── Subscription ────────────────────────────────────────────────────────
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  amount_idr bigint not null check (amount_idr >= 0),
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'quarterly', 'yearly')),
  next_renewal_date date,
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscription_allocations (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null
    references public.subscriptions (id) on delete cascade,
  business_unit text not null check (length(btrim(business_unit)) > 0),
  branch text,
  amount_idr bigint not null check (amount_idr >= 0),
  created_at timestamptz not null default now()
);

create index subscription_allocations_subscription_idx
  on public.subscription_allocations (subscription_id);
create index subscriptions_renewal_idx
  on public.subscriptions (next_renewal_date) where is_active;

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.handle_updated_at();

alter table public.subscriptions enable row level security;
alter table public.subscription_allocations enable row level security;

create policy subscriptions_admin_all on public.subscriptions
  for all using (public.is_admin()) with check (public.is_admin());
create policy subscription_allocations_admin_all on public.subscription_allocations
  for all using (public.is_admin()) with check (public.is_admin());

-- Grant eksplisit (auto-grant tabel baru berhenti 30 Okt 2026).
grant select, insert, update, delete
  on public.subscriptions, public.subscription_allocations to authenticated;
grant all on public.subscriptions, public.subscription_allocations to service_role;

-- Simpan langganan + alokasinya secara ATOMIK (satu fungsi = satu transaksi).
-- security invoker: RLS tetap berlaku; cek is_admin() hanya untuk pesan error
-- yang jelas. p_allocs: [{"business_unit":"..","branch":".."|null,"amount_idr":N}]
create or replace function public.save_subscription(
  p_id uuid,
  p_name text,
  p_amount bigint,
  p_cycle text,
  p_next date,
  p_active boolean,
  p_notes text,
  p_allocs jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_sum bigint;
  v_n int;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  v_n := coalesce(jsonb_array_length(p_allocs), 0);
  if v_n = 0 then
    raise exception 'Pilih minimal satu business unit';
  end if;

  select coalesce(sum((a->>'amount_idr')::bigint), 0) into v_sum
  from jsonb_array_elements(p_allocs) a;
  if v_sum <> p_amount then
    raise exception 'Total pembagian (%) harus sama dengan nominal (%)', v_sum, p_amount;
  end if;

  if p_id is null then
    insert into public.subscriptions
      (name, amount_idr, billing_cycle, next_renewal_date, is_active, notes, created_by)
    values
      (btrim(p_name), p_amount, p_cycle, p_next, coalesce(p_active, true),
       nullif(btrim(p_notes), ''), auth.uid())
    returning id into v_id;
  else
    update public.subscriptions set
      name = btrim(p_name),
      amount_idr = p_amount,
      billing_cycle = p_cycle,
      next_renewal_date = p_next,
      is_active = coalesce(p_active, true),
      notes = nullif(btrim(p_notes), '')
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Subscription tidak ditemukan';
    end if;
    delete from public.subscription_allocations where subscription_id = v_id;
  end if;

  insert into public.subscription_allocations
    (subscription_id, business_unit, branch, amount_idr)
  select v_id,
         btrim(a->>'business_unit'),
         nullif(btrim(a->>'branch'), ''),
         (a->>'amount_idr')::bigint
  from jsonb_array_elements(p_allocs) a;

  return v_id;
end;
$$;

revoke all on function public.save_subscription(uuid, text, bigint, text, date, boolean, text, jsonb)
  from public, anon;
grant execute on function public.save_subscription(uuid, text, bigint, text, date, boolean, text, jsonb)
  to authenticated, service_role;

-- ── Akun & password ─────────────────────────────────────────────────────
create table public.managed_accounts (
  id uuid primary key default gen_random_uuid(),
  service text,
  login text not null check (length(btrim(login)) > 0),
  password_secret_id uuid not null,
  business_unit text not null default 'Umum',
  branch text,
  linked_phone text,
  login_url text,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index managed_accounts_bu_idx on public.managed_accounts (business_unit, branch);

create trigger managed_accounts_updated_at
  before update on public.managed_accounts
  for each row execute function public.handle_updated_at();

alter table public.managed_accounts enable row level security;
create policy managed_accounts_admin_all on public.managed_accounts
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.managed_accounts to authenticated;
grant all on public.managed_accounts to service_role;

-- Fungsi vault: HANYA service_role. Dipanggil dari server action setelah cek admin.
create or replace function public.account_vault_store(p_secret_id uuid, p_password text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_password is null or p_password = '' then
    raise exception 'Password kosong';
  end if;
  if p_secret_id is null then
    v_id := vault.create_secret(p_password);
  else
    perform vault.update_secret(p_secret_id, p_password);
    v_id := p_secret_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.account_vault_reveal(p_secret_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id = p_secret_id;
$$;

create or replace function public.account_vault_delete(p_secret_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where id = p_secret_id;
$$;

revoke all on function public.account_vault_store(uuid, text) from public, anon, authenticated;
revoke all on function public.account_vault_reveal(uuid) from public, anon, authenticated;
revoke all on function public.account_vault_delete(uuid) from public, anon, authenticated;
grant execute on function public.account_vault_store(uuid, text) to service_role;
grant execute on function public.account_vault_reveal(uuid) to service_role;
grant execute on function public.account_vault_delete(uuid) to service_role;

-- Hapus akun lewat jalur APA PUN (aksi, SQL, cascade) ikut menghapus secret-nya,
-- supaya tidak ada password yatim di vault.
create or replace function public.managed_accounts_purge_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.password_secret_id;
  return old;
end;
$$;

revoke all on function public.managed_accounts_purge_secret() from public, anon, authenticated;

create trigger managed_accounts_purge_secret
  after delete on public.managed_accounts
  for each row execute function public.managed_accounts_purge_secret();
