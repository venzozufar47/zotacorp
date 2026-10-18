-- Kanal Pengaduan HR Berjenjang (PRD-7) — SOP bagian 9 / Rencana Tim
-- Mandiri "Tangga penyelesaian masalah". Tingkat 1 (bicara langsung) tidak
-- butuh sistem. Tingkat 2 (kepala tim), 3 (Owner), 4 (pihak tepercaya
-- alternatif) direkam di sini, dengan tier DIHITUNG SAAT SUBMIT (auto-skip
-- bila menyangkut pemimpin/Owner, atau pelecehan/kekerasan).
--
-- Kerahasiaan: `is_anonymous` di-scrub di layer action (bukan hanya
-- UI) — pihak selain pelapor sendiri TIDAK PERNAH diberi identitas
-- pelapor saat anonim, dan pihak yang dilaporkan tidak pernah jadi
-- penerima laporan tentang dirinya sendiri (dihitung di action, bukan
-- disimpan sebagai daftar statis — recipient berubah mengikuti struktur
-- `team_members` saat ini).

create table public.hr_grievances (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id),
  is_anonymous boolean not null default false,
  reported_about_user_id uuid references public.profiles (id),
  is_harassment_or_violence boolean not null default false,
  description text not null,
  witnesses text,
  desired_outcome text,
  tier integer not null check (tier in (2, 3, 4)),
  status text not null default 'submitted'
    check (status in ('submitted', 'confirmed', 'investigating', 'decided')),
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  decision text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index hr_grievances_status_idx on public.hr_grievances (status, created_at desc);
create index hr_grievances_about_idx on public.hr_grievances (reported_about_user_id);

alter table public.hr_grievances enable row level security;

create policy hr_grievances_admin_all on public.hr_grievances
  for all using (public.is_admin()) with check (public.is_admin());

grant all on public.hr_grievances to service_role;

-- Pihak tepercaya alternatif ("Mba Ana" di dokumen — nama orang nyata,
-- jadi tidak di-hardcode; admin menunjuk siapa pun lewat tabel ini).
-- Tingkat 4 jatuh ke admin otomatis bila tabel ini kosong (SOP: "bila
-- Mba Ana tidak ada, laporan langsung ke Owner").
create table public.hr_trusted_contacts (
  user_id uuid primary key references public.profiles (id),
  added_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.hr_trusted_contacts enable row level security;

create policy hr_trusted_contacts_admin_all on public.hr_trusted_contacts
  for all using (public.is_admin()) with check (public.is_admin());

grant all on public.hr_trusted_contacts to service_role;
