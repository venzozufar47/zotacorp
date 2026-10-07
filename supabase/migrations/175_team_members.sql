-- Team leader: satu karyawan (leader) memantau daftar anggotanya.
--
-- Leader HANYA membaca: melihat Tugas milik anggota beserta progresnya. Tidak
-- ada kebijakan tulis untuk non-admin di sini, dan data tugas anggota dibaca
-- lewat server action (service-role) yang memeriksa baris tim ini — leader
-- tidak diberi akses langsung ke tabel tugas.
--
-- Seorang karyawan boleh punya lebih dari satu leader dan boleh menjadi leader
-- sekaligus anggota tim lain.

create table public.team_members (
  leader_id uuid not null references public.profiles (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (leader_id, member_id),
  check (leader_id <> member_id)
);

create index team_members_member_idx on public.team_members (member_id);

alter table public.team_members enable row level security;

create policy team_members_admin_all on public.team_members
  for all using (public.is_admin()) with check (public.is_admin());
-- Leader/anggota boleh MELIHAT baris yang menyangkut dirinya (mis. untuk
-- menampilkan menu Tim) — tidak boleh mengubah.
create policy team_members_self_select on public.team_members
  for select using (leader_id = auth.uid() or member_id = auth.uid());

grant select, insert, update, delete on public.team_members to authenticated;
grant all on public.team_members to service_role;
