-- Hierarki tiket per ORANG: tiap karyawan punya satu atau lebih atasan langsung (per cabang). Tiket "naik" ditujukan
-- ke SATU atasan (yang punya dua atasan memilih), dan eskalasi naik ke atasan langsung penerimanya; tanpa atasan = owner.
-- Menggantikan model "tingkat" (ticket_chain_members, kini tidak dipakai aplikasi; dibiarkan sebagai arsip).
--
-- tickets.handler_level kini: 0 = tiket 'turun' (penerima = assignee_id), 1 = dipegang satu orang (handler_id), 99 = owner.

create table public.ticket_superiors (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.ticket_branches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  superior_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_id <> superior_id),
  unique (branch_id, user_id, superior_id)
);
create index ticket_superiors_superior_idx on public.ticket_superiors (superior_id);

alter table public.tickets
  add column handler_id uuid references public.profiles (id) on delete set null,
  add column escalated_from_id uuid references public.profiles (id) on delete set null;
create index tickets_handler_id_idx on public.tickets (handler_id) where handler_id is not null;

-- ── Migrasi data dari rantai bertingkat ─────────────────────────────────────────────────────────────
-- Anggota tingkat N → atasannya = anggota tingkat terdekat di atas N.
insert into public.ticket_superiors (branch_id, user_id, superior_id)
select m.branch_id, m.user_id, s.user_id
from public.ticket_chain_members m
join public.ticket_chain_members s
  on s.branch_id = m.branch_id
 and s.level = (select min(level) from public.ticket_chain_members x where x.branch_id = m.branch_id and x.level > m.level)
on conflict do nothing;

-- Karyawan cabang yang bukan anggota rantai → atasannya = anggota tingkat terendah.
insert into public.ticket_superiors (branch_id, user_id, superior_id)
select b.id, el.employee_id, s.user_id
from public.ticket_branches b
join public.employee_locations el on el.location_id = b.location_id
join public.ticket_chain_members s
  on s.branch_id = b.id
 and s.level = (select min(level) from public.ticket_chain_members x where x.branch_id = b.id)
where not exists (select 1 from public.ticket_chain_members me where me.branch_id = b.id and me.user_id = el.employee_id)
  and el.employee_id <> s.user_id
on conflict do nothing;

-- Tiket yang sedang di tingkat 1..98 → pegangan orang (anggota tingkat itu di cabangnya).
update public.tickets t
set handler_id = (
  select m.user_id from public.ticket_chain_members m
  where m.branch_id = t.branch_id and m.level = t.handler_level
  order by m.user_id limit 1)
where t.handler_level between 1 and 98;
update public.tickets t
set escalated_from_id = (
  select m.user_id from public.ticket_chain_members m
  where m.branch_id = t.branch_id and m.level = t.escalated_from_level
  order by m.user_id limit 1)
where t.escalated_from_level between 1 and 98;

-- ── Fungsi & RLS ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.is_ticket_manager_for(p_branch uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_admin()
    or exists (select 1 from public.ticket_superiors where branch_id = p_branch and superior_id = auth.uid());
$$;
create or replace function public.can_manage_tickets()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_admin()
    or exists (select 1 from public.ticket_superiors where superior_id = auth.uid());
$$;
-- Apakah saya atasan langsung dari p_user di cabang ini (untuk melihat tiket bawahan)?
create or replace function public.is_superior_of(p_branch uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.ticket_superiors
                 where branch_id = p_branch and user_id = p_user and superior_id = auth.uid());
$$;
grant execute on function public.is_superior_of(uuid, uuid) to authenticated;

-- Tulis hanya owner (semua tulis aplikasi lewat service-role); atasan hanya MEMBACA tiket yang dia pegang / milik bawahannya.
drop policy if exists ticket_manage_all on public.tickets;
create policy ticket_manage_admin on public.tickets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy ticket_select_superior on public.tickets for select to authenticated
  using (handler_id = auth.uid() or escalated_by = auth.uid() or public.is_superior_of(branch_id, created_by));

drop policy if exists ticket_attach_manage_all on public.ticket_attachments;
create policy ticket_attach_manage_admin on public.ticket_attachments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy ticket_attach_select_superior on public.ticket_attachments for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id
                 and (t.handler_id = auth.uid() or t.escalated_by = auth.uid() or public.is_superior_of(t.branch_id, t.created_by))));

alter table public.ticket_superiors enable row level security;
create policy ticket_superiors_admin_all on public.ticket_superiors for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy ticket_superiors_self_select on public.ticket_superiors for select to authenticated
  using (user_id = auth.uid() or superior_id = auth.uid());
grant select on public.ticket_superiors to authenticated;
grant select, insert, update, delete on public.ticket_superiors to service_role;
revoke all on public.ticket_superiors from anon;
