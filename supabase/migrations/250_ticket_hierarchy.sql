-- Tiket dua arah + hierarki yang bisa diatur (Yeobo Space dan Haengbocake).
--
-- Sebelumnya: cabang dikunci ke 3 studio Yeobo (CHECK), "Kepala Studio" satu daftar global (studio_heads), eskalasi
-- selalu langsung ke owner. Sekarang:
--   - ticket_branches : cabang tiket per unit bisnis, tertaut ke lokasi presensi (untuk tahu karyawan milik cabang mana)
--   - ticket_chain_members : rantai bertingkat per cabang (Tingkat 1, 2, ...), owner (admin) selalu puncak (level 99)
--   - tickets.direction  : 'up' (karyawan melapor, naik lewat rantai) | 'down' (owner menugaskan ke orang/cabang)
--   - tickets.handler_level : tingkat yang sedang memegang tiket (99 = owner)
-- studio_heads TIDAK dihapus (dipakai modul SIM dan evaluasi 360); anggotanya disalin ke Tingkat 1 cabang Yeobo.

-- ── 1. Cabang tiket ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.ticket_branches (
  id uuid primary key default gen_random_uuid(),
  business_unit text not null,
  branch text not null,
  label text not null,
  location_id uuid references public.attendance_locations(id) on delete set null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  unique (business_unit, branch)
);

insert into public.ticket_branches (business_unit, branch, label, location_id, sort_order)
select v.bu, v.br, v.lbl, (select id from public.attendance_locations where name = v.loc limit 1), v.ord
from (values
  ('Yeobo Space', 'Tlogosari', 'Yeobo Space · Tlogosari', 'Yeobo Space - Tlogosari', 10),
  ('Yeobo Space', 'Tembalang', 'Yeobo Space · Tembalang', 'Yeobo Space - Tembalang', 20),
  ('Yeobo Space', 'Jebres', 'Yeobo Space · Jebres', 'Yeobo Space - Jebres', 30),
  ('Haengbocake', 'Semarang', 'Haengbocake · Semarang', 'Haengbocake Semarang', 40),
  ('Haengbocake', 'Pare', 'Haengbocake · Pare', 'Haengbocorner Pare', 50)
) as v(bu, br, lbl, loc, ord)
on conflict (business_unit, branch) do nothing;

-- ── 2. Rantai hierarki per cabang ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.ticket_chain_members (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.ticket_branches(id) on delete cascade,
  level integer not null check (level between 1 and 8),
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  -- Satu orang hanya satu tingkat per cabang.
  unique (branch_id, user_id)
);
create index if not exists ticket_chain_members_user_idx on public.ticket_chain_members (user_id);
create index if not exists ticket_chain_members_branch_level_idx on public.ticket_chain_members (branch_id, level);

-- Kepala Studio yang ada → Tingkat 1 di ketiga cabang Yeobo.
insert into public.ticket_chain_members (branch_id, level, user_id, assigned_by)
select b.id, 1, h.user_id, h.assigned_by
from public.studio_heads h
cross join public.ticket_branches b
where b.business_unit = 'Yeobo Space'
on conflict (branch_id, user_id) do nothing;

-- ── 3. Kolom baru di tickets ─────────────────────────────────────────────────────────────────────────────────────
alter table public.tickets drop constraint if exists tickets_branch_check;

alter table public.tickets
  add column if not exists branch_id uuid references public.ticket_branches(id),
  add column if not exists direction text not null default 'up' check (direction in ('up', 'down')),
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists handler_level integer not null default 1,
  add column if not exists escalated_from_level integer;

update public.tickets t
set branch_id = b.id
from public.ticket_branches b
where t.branch_id is null and b.business_unit = t.business_unit and b.branch = t.branch;

-- Tiket yang sudah di tangan owner (eskalasi / ditangani owner) → tingkat owner; sisanya Tingkat 1.
update public.tickets
set handler_level = case when status in ('escalated', 'owner_handling') then 99 else 1 end,
    escalated_from_level = case when status in ('escalated', 'owner_handling') then 1 else null end
where handler_level = 1;

alter table public.tickets alter column branch_id set not null;

create index if not exists tickets_branch_id_idx on public.tickets (branch_id);
create index if not exists tickets_assignee_idx on public.tickets (assignee_id) where assignee_id is not null;
create index if not exists tickets_handler_idx on public.tickets (handler_level, status);

-- ── 4. Fungsi akses ──────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.ticket_member_level(p_branch uuid)
returns integer language sql security definer stable set search_path = public as $$
  select level from public.ticket_chain_members where branch_id = p_branch and user_id = auth.uid();
$$;

create or replace function public.is_ticket_manager_for(p_branch uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_admin()
    or exists (select 1 from public.ticket_chain_members where branch_id = p_branch and user_id = auth.uid());
$$;

-- Dipakai policy lama (can_manage_tickets): kini = admin atau anggota rantai mana pun.
create or replace function public.can_manage_tickets()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_admin()
    or exists (select 1 from public.ticket_chain_members where user_id = auth.uid());
$$;

create or replace function public.is_my_ticket_branch(p_branch uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.ticket_branches b
    join public.employee_locations el on el.location_id = b.location_id
    where b.id = p_branch and el.employee_id = auth.uid()
  );
$$;

grant execute on function public.ticket_member_level(uuid) to authenticated;
grant execute on function public.is_ticket_manager_for(uuid) to authenticated;
grant execute on function public.can_manage_tickets() to authenticated;
grant execute on function public.is_my_ticket_branch(uuid) to authenticated;

-- ── 5. RLS ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- Manajer hanya untuk cabang yang dia pegang (bukan lagi semua tiket).
drop policy if exists ticket_manage_all on public.tickets;
create policy ticket_manage_all on public.tickets for all to authenticated
  using (public.is_ticket_manager_for(branch_id)) with check (public.is_ticket_manager_for(branch_id));

-- Rekan sesama cabang melihat antrean aktif tiket "naik" (dan tiket "turun" untuk satu cabang), tanpa detail.
drop policy if exists ticket_select_same_branch on public.tickets;
create policy ticket_select_same_branch on public.tickets for select to authenticated
  using (
    status in ('open', 'in_progress', 'escalated', 'owner_handling')
    and (direction = 'up' or assignee_id is null)
    and public.is_my_ticket_branch(branch_id)
  );

-- Penerima tiket "turun" melihat tiket yang ditugaskan kepadanya.
drop policy if exists ticket_select_assignee on public.tickets;
create policy ticket_select_assignee on public.tickets for select to authenticated
  using (assignee_id = auth.uid());

drop policy if exists ticket_attach_manage_all on public.ticket_attachments;
create policy ticket_attach_manage_all on public.ticket_attachments for all to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id and public.is_ticket_manager_for(t.branch_id)))
  with check (exists (select 1 from public.tickets t where t.id = ticket_id and public.is_ticket_manager_for(t.branch_id)));

drop policy if exists ticket_attach_select_assignee on public.ticket_attachments;
create policy ticket_attach_select_assignee on public.ticket_attachments for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id and t.assignee_id = auth.uid()));

-- Tabel baru: dibaca lewat server action (service_role); `authenticated` hanya SELECT yang dibatasi policy.
alter table public.ticket_branches enable row level security;
alter table public.ticket_chain_members enable row level security;

drop policy if exists ticket_branches_read on public.ticket_branches;
create policy ticket_branches_read on public.ticket_branches for select to authenticated using (true);
drop policy if exists ticket_branches_admin_all on public.ticket_branches;
create policy ticket_branches_admin_all on public.ticket_branches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists ticket_chain_admin_all on public.ticket_chain_members;
create policy ticket_chain_admin_all on public.ticket_chain_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists ticket_chain_self_select on public.ticket_chain_members;
create policy ticket_chain_self_select on public.ticket_chain_members for select to authenticated
  using (user_id = auth.uid());

grant select on public.ticket_branches, public.ticket_chain_members to authenticated;
grant select, insert, update, delete on public.ticket_branches, public.ticket_chain_members to service_role;
revoke all on public.ticket_branches, public.ticket_chain_members from anon;
