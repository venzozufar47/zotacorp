-- Log Riset Produk, Kartu Produk & Daftar Tester (PRD-11) — SOP 6.10,
-- 6.13, Dokumen 5 §4 & §9.
--
-- CATATAN CAKUPAN: penegakan "kode penarikan Testing di POS ditolak bila
-- penginput bukan tester aktif" SENGAJA TIDAK disertakan di migrasi ini —
-- itu berarti mengubah jalur inti POS yang sedang menangani transaksi
-- nyata setiap hari, dan risiko regresinya tidak sepadan untuk
-- digabung dengan fitur baru yang berdiri sendiri. Roster di bawah sudah
-- memberi jejak audit penuh (siapa tester, sejak kapan, sampai kapan);
-- penegakan di sisi POS adalah pekerjaan lanjutan yang disengaja, bukan
-- terlewat.

create table public.product_ideas (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Pare', 'Semarang')),
  title text not null,
  purpose text,
  ingredients text,
  portion_count integer,
  target_date date,
  status text not null default 'diajukan'
    check (status in ('diajukan', 'riset', 'jual_terbatas', 'masuk_menu', 'berhenti')),
  proposed_by uuid not null references public.profiles (id),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.product_ideas enable row level security;
create policy product_ideas_admin_all on public.product_ideas
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.product_ideas to service_role;

create table public.product_experiments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.product_ideas (id) on delete cascade,
  attempt_number integer not null check (attempt_number between 1 and 3),
  recipe_change text,
  result_notes text,
  photo_path text,
  estimated_hpp numeric,
  imagined_price numeric,
  decision text check (decision in ('ulangi', 'ubah', 'jual_terbatas', 'berhenti')),
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (idea_id, attempt_number)
);

alter table public.product_experiments enable row level security;
create policy product_experiments_admin_all on public.product_experiments
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.product_experiments to service_role;

create table public.product_testers (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Pare', 'Semarang')),
  user_id uuid not null references public.profiles (id),
  testing_scope text,
  valid_until date,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  proposed_by uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index product_testers_active_idx on public.product_testers (branch, status, valid_until);

alter table public.product_testers enable row level security;
create policy product_testers_admin_all on public.product_testers
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.product_testers to service_role;

create table public.product_cards (
  id uuid primary key default gen_random_uuid(),
  product_name text not null unique,
  shelf_life_days integer,
  storage_method text,
  pass_criteria text,
  method_temp_time text,
  reference_photo_path text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

alter table public.product_cards enable row level security;
create policy product_cards_admin_all on public.product_cards
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.product_cards to service_role;

insert into storage.buckets (id, name, public)
values ('product-rnd-photos', 'product-rnd-photos', false)
on conflict (id) do nothing;

drop policy if exists product_rnd_photos_admin_select on storage.objects;
drop policy if exists product_rnd_photos_admin_insert on storage.objects;
drop policy if exists product_rnd_photos_admin_delete on storage.objects;

create policy product_rnd_photos_admin_select
  on storage.objects for select to authenticated
  using (bucket_id = 'product-rnd-photos' and public.is_admin());
create policy product_rnd_photos_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-rnd-photos' and public.is_admin());
create policy product_rnd_photos_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-rnd-photos' and public.is_admin());
