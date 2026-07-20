-- Manajemen nomor kartu SIM lintas unit bisnis.
--
-- Masalah: nomor SIM tersebar di semua unit bisnis dan sering terlewat masa
-- aktif / masa tenggang sampai nomor hangus. Tabel ini menyatukan daftar
-- nomor + penanggung jawab (PIC) + tanggal tenggat, lalu dipakai reminder
-- harian (in-app + WA) sampai PIC mengisi pulsa dan memperbarui tanggalnya
-- dengan MELAMPIRKAN bukti screenshot (wajib).
--
-- Unit bisnis TIDAK dibuat tabel baru — memakai public.business_units yang
-- sudah ada & bebas dikelola admin di /admin/settings (FK by id supaya aman
-- terhadap rename).
--
-- PIC hibrida: pic_user_id (karyawan terdaftar → WA dari profil, bisa login
-- & upload bukti sendiri) ATAU pic_name + pic_phone (manual → hanya admin
-- yang bisa update). Salah satu wajib ada.
--
-- Access: admin Zota (is_admin()) penuh; PIC hanya baca kartunya sendiri &
-- insert top-up miliknya (helper is_sim_pic, pola can_manage_tickets 106).
-- Bukti di bucket privat 'sim-topup-proofs' (pola ticket-attachments 106).

-- 1. Nomor SIM.
create table if not exists public.sim_cards (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  phone_number text not null,
  provider text,
  label text,

  -- Penanggung jawab: karyawan terdaftar ATAU manual (nama + WA).
  pic_user_id uuid references public.profiles(id) on delete set null,
  pic_name text,
  pic_phone text,

  active_until date,   -- masa aktif
  grace_until date,    -- masa tenggang
  notes text,
  is_active boolean not null default true,  -- arsip, bukan hard delete

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),

  constraint sim_cards_pic_present check (
    pic_user_id is not null or (pic_name is not null and pic_phone is not null)
  )
);

create index if not exists sim_cards_business_unit_idx on public.sim_cards(business_unit_id);
create index if not exists sim_cards_pic_user_idx on public.sim_cards(pic_user_id);
create index if not exists sim_cards_grace_until_idx on public.sim_cards(grace_until);
create index if not exists sim_cards_active_until_idx on public.sim_cards(active_until);

-- Cegah nomor dobel di antara kartu yang masih aktif (arsip boleh duplikat).
create unique index if not exists sim_cards_phone_active_uidx
  on public.sim_cards(phone_number) where is_active;

create or replace function public.sim_cards_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists sim_cards_updated_at on public.sim_cards;
create trigger sim_cards_updated_at before update on public.sim_cards
  for each row execute function public.sim_cards_touch_updated_at();

alter table public.sim_cards enable row level security;

drop policy if exists sim_cards_admin_all on public.sim_cards;
create policy sim_cards_admin_all on public.sim_cards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- PIC terdaftar: baca kartunya sendiri (mutasi tetap lewat server action).
drop policy if exists sim_cards_pic_select on public.sim_cards;
create policy sim_cards_pic_select on public.sim_cards for select to authenticated
  using (pic_user_id = auth.uid());

-- 2. Helper: apakah caller PIC dari kartu tsb (dipakai RLS top-up).
create or replace function public.is_sim_pic(card uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.sim_cards s
    where s.id = card and s.pic_user_id = auth.uid()
  );
$$;

grant execute on function public.is_sim_pic(uuid) to authenticated;

-- 3. Riwayat isi pulsa + bukti (proof_path WAJIB — tidak boleh update
--    tenggat tanpa screenshot).
create table if not exists public.sim_card_topups (
  id uuid primary key default gen_random_uuid(),
  sim_card_id uuid not null references public.sim_cards(id) on delete cascade,
  topped_up_by uuid references public.profiles(id) on delete set null,
  proof_path text not null,
  new_active_until date,
  new_grace_until date,
  amount_idr integer,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists sim_card_topups_card_idx on public.sim_card_topups(sim_card_id);

alter table public.sim_card_topups enable row level security;

drop policy if exists sim_topups_admin_all on public.sim_card_topups;
create policy sim_topups_admin_all on public.sim_card_topups for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists sim_topups_pic_select on public.sim_card_topups;
create policy sim_topups_pic_select on public.sim_card_topups for select to authenticated
  using (public.is_sim_pic(sim_card_id));

drop policy if exists sim_topups_pic_insert on public.sim_card_topups;
create policy sim_topups_pic_insert on public.sim_card_topups for insert to authenticated
  with check (topped_up_by = auth.uid() and public.is_sim_pic(sim_card_id));

-- 4. Bucket privat bukti isi pulsa. Path: ${uid}/${uuid}.jpg (segmen [1] =
--    uploader). Admin melihat bukti lewat signed URL dari server action
--    service-role setelah cek izin di app code.
insert into storage.buckets (id, name, public)
values ('sim-topup-proofs', 'sim-topup-proofs', false)
on conflict (id) do nothing;

drop policy if exists "sim_proof_upload_own" on storage.objects;
create policy "sim_proof_upload_own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sim-topup-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "sim_proof_read_own_or_admin" on storage.objects;
create policy "sim_proof_read_own_or_admin" on storage.objects for select to authenticated
  using (
    bucket_id = 'sim-topup-proofs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "sim_proof_delete_own_or_admin" on storage.objects;
create policy "sim_proof_delete_own_or_admin" on storage.objects for delete to authenticated
  using (
    bucket_id = 'sim-topup-proofs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- 5. Realtime — admin page refresh saat status/tenggat berubah.
do $$ begin
  alter publication supabase_realtime add table public.sim_cards;
exception when duplicate_object then null; end $$;
