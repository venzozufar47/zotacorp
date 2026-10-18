-- Checklist Offboarding & Cabut Akses (PRD-13) — menjawab pertanyaan yang
-- secara eksplisit belum terjawab di tool MECE sendiri: "Siapa yang
-- mencabut akses dan PIN karyawan yang berhenti?"
--
-- TIDAK ada tabel/aksi resign baru — ini mengaitkan diri ke
-- `setUserResignStatus` yang SUDAH ADA (profile-status.actions.ts), satu-
-- satunya jalur resign di app, supaya tidak ada dua jalur resign yang
-- bisa menyimpang. Migrasi ini hanya menambah tabel pencatatan; logika
-- pencabutan otomatis ada di action.

create table public.offboarding_checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  triggered_by uuid not null references public.profiles (id),
  effective_at timestamptz not null default now(),
  -- Otomatis, dicatat saat checklist dibuat (fakta, bukan item tik manual).
  pos_pin_revoked_at timestamptz,
  team_memberships_removed_at timestamptz,
  tester_roles_revoked_at timestamptz,
  trusted_contact_removed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.offboarding_checklists enable row level security;
create policy offboarding_checklists_admin_all on public.offboarding_checklists
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.offboarding_checklists to service_role;

-- Item fisik yang TIDAK BISA otomatis (kunci, aset, serah terima kas) —
-- dicentang manual oleh yang memproses (Perjanjian Kerja Pasal 12 ayat 5).
create table public.offboarding_manual_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.offboarding_checklists (id) on delete cascade,
  label text not null,
  done boolean not null default false,
  note text,
  done_by uuid references public.profiles (id),
  done_at timestamptz
);

create index offboarding_manual_items_checklist_idx on public.offboarding_manual_items (checklist_id);

alter table public.offboarding_manual_items enable row level security;
create policy offboarding_manual_items_admin_all on public.offboarding_manual_items
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.offboarding_manual_items to service_role;
