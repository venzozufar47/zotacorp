-- Ticketing System (Yeobo Space Studio).
--
-- Karyawan Yeobo Space melaporkan kebutuhan barang / barang rusak / masalah
-- lain (dengan foto) ke Kepala Studio. Kepala Studio menindaklanjuti,
-- menandai selesai (durasi dicatat untuk KPI), dan bisa eskalasi ke owner
-- (admin app). Owner meng-ACC (tanggung jawab pindah) atau menolak+catatan
-- (kembali ke Kepala Studio).
--
-- Access: admin Zota (is_admin()) ATAU Kepala Studio (membership table
-- studio_heads) lewat helper can_manage_tickets() — pola yeobo_booth_admins
-- (063). Foto di bucket privat 'ticket-attachments' (pola cleaning-photos,
-- 087). Realtime publish pola 062/097.

-- 1. Allowlist Kepala Studio (mirror yeobo_booth_admins).
create table if not exists public.studio_heads (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  notes text
);

alter table public.studio_heads enable row level security;

drop policy if exists studio_heads_admin_all on public.studio_heads;
create policy studio_heads_admin_all on public.studio_heads for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists studio_heads_self_select on public.studio_heads;
create policy studio_heads_self_select on public.studio_heads for select to authenticated
  using (user_id = auth.uid());

create or replace function public.is_studio_head()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.studio_heads where user_id = auth.uid());
$$;

create or replace function public.can_manage_tickets()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_admin() or public.is_studio_head();
$$;

grant execute on function public.is_studio_head() to authenticated;
grant execute on function public.can_manage_tickets() to authenticated;

-- 2. Tickets — state machine + audit timeline (satu <event>_at/<event>_by per transisi).
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  business_unit text not null default 'Yeobo Space',
  branch text not null check (branch in ('Tlogosari', 'Tembalang', 'Jebres')),
  category text not null check (category in ('kebutuhan_barang', 'barang_rusak', 'lainnya')),
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  title text not null,
  description text not null default '',
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'escalated', 'owner_handling', 'resolved', 'cancelled')),

  in_progress_at timestamptz,
  in_progress_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text,
  escalated_at timestamptz,
  escalated_by uuid references public.profiles(id) on delete set null,
  escalation_note text,
  owner_decision text check (owner_decision in ('accepted', 'rejected')),
  owner_decided_at timestamptz,
  owner_decided_by uuid references public.profiles(id) on delete set null,
  owner_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tickets_status_idx on public.tickets(status);
create index if not exists tickets_created_by_idx on public.tickets(created_by);
create index if not exists tickets_branch_idx on public.tickets(branch);

create or replace function public.tickets_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists tickets_updated_at on public.tickets;
create trigger tickets_updated_at before update on public.tickets
  for each row execute function public.tickets_touch_updated_at();

alter table public.tickets enable row level security;

-- Admin & Kepala Studio: akses penuh (baca semua + transisi). Transisi tetap
-- divalidasi role+state di server action.
drop policy if exists ticket_manage_all on public.tickets;
create policy ticket_manage_all on public.tickets for all to authenticated
  using (public.can_manage_tickets()) with check (public.can_manage_tickets());

-- Pembuat: baca & buat tiket miliknya.
drop policy if exists ticket_select_own on public.tickets;
create policy ticket_select_own on public.tickets for select to authenticated
  using (created_by = auth.uid());

drop policy if exists ticket_insert_own on public.tickets;
create policy ticket_insert_own on public.tickets for insert to authenticated
  with check (created_by = auth.uid());

-- 3. Attachments (child table utk multi-foto — precedent cleaning_item_photos 090).
create table if not exists public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  path text not null,
  content_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ticket_attachments_ticket_idx on public.ticket_attachments(ticket_id);

alter table public.ticket_attachments enable row level security;

drop policy if exists ticket_attach_manage_all on public.ticket_attachments;
create policy ticket_attach_manage_all on public.ticket_attachments for all to authenticated
  using (public.can_manage_tickets()) with check (public.can_manage_tickets());

drop policy if exists ticket_attach_select_own on public.ticket_attachments;
create policy ticket_attach_select_own on public.ticket_attachments for select to authenticated
  using (exists (
    select 1 from public.tickets t where t.id = ticket_id and t.created_by = auth.uid()
  ));

drop policy if exists ticket_attach_insert_own on public.ticket_attachments;
create policy ticket_attach_insert_own on public.ticket_attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (select 1 from public.tickets t where t.id = ticket_id and t.created_by = auth.uid())
  );

-- 4. Bucket privat utk foto tiket. Path: ${uid}/${ticketId}/${uuid}.jpg
--    (segmen [1] = uploader). Kepala Studio (non-admin) melihat foto lewat
--    signed URL yang dibuat server action service-role setelah cek izin app.
insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', false)
on conflict (id) do nothing;

drop policy if exists "ticket_attach_upload_own" on storage.objects;
create policy "ticket_attach_upload_own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ticket-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "ticket_attach_read_own_or_admin" on storage.objects;
create policy "ticket_attach_read_own_or_admin" on storage.objects for select to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "ticket_attach_delete_own_or_admin" on storage.objects;
create policy "ticket_attach_delete_own_or_admin" on storage.objects for delete to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- 5. Realtime — live refresh dashboard tiket saat ada perubahan.
do $$ begin
  alter publication supabase_realtime add table public.tickets;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.ticket_attachments;
exception when duplicate_object then null; end $$;
