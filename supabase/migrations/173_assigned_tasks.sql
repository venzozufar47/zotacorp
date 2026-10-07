-- Tugas Karyawan: task/checklist SEKALI-JALAN yang di-assign superadmin ke
-- karyawan, wajib foto per item, wajib diverifikasi admin.
--
-- Terpisah dari modul Kebersihan (cleaning_*) karena modelnya berbeda:
-- kebersihan berulang per hari/jadwal, tugas ini sekali selesai.
--
-- Alur status:
--   open ──(karyawan kirim)──▶ submitted ──(admin setujui)──▶ approved
--                                  └──(admin tolak + feedback)──▶ open, current_round+1
--   open/submitted ──(admin batalkan)──▶ cancelled
-- Tolak = ulang dari awal: ronde naik, semua item kosong lagi. Riwayat foto
-- ronde lama tetap tersimpan (completions per (item, round)).
--
-- Semua TULIS dilakukan server action (service role) setelah cek kepemilikan
-- & transisi status, jadi karyawan hanya punya SELECT di tabel — tidak ada
-- jalur bagi karyawan menyetujui tugasnya sendiri lewat klien.

create table public.assigned_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  description text,
  assignee_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'submitted', 'approved', 'cancelled')),
  current_round integer not null default 1 check (current_round >= 1),
  submitted_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  -- Feedback penolakan terakhir; tampil di kartu karyawan selama ronde ulang.
  review_note text,
  -- Dipakai cron pengingat 2 jam (klaim atomik).
  last_reminded_at timestamptz,
  -- Task yang dibuat dalam satu aksi "assign ke beberapa karyawan".
  batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assigned_task_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.assigned_tasks (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  note text,
  sort_order integer not null default 0
);

create table public.assigned_task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.assigned_tasks (id) on delete cascade,
  item_id uuid not null references public.assigned_task_items (id) on delete cascade,
  round integer not null check (round >= 1),
  photo_path text,
  photo_purged_at timestamptz,
  latitude double precision,
  longitude double precision,
  completed_at timestamptz not null default now(),
  unique (item_id, round)
);

-- "Selesaikan esok hari": satu baris per task per hari (Jakarta), alasan wajib.
create table public.assigned_task_deferrals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.assigned_tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  for_date date not null,
  reason text not null check (length(btrim(reason)) > 0),
  created_at timestamptz not null default now(),
  unique (task_id, for_date)
);

-- Audit tiap keputusan admin (ronde mana, apa keputusannya, catatannya).
create table public.assigned_task_reviews (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.assigned_tasks (id) on delete cascade,
  round integer not null,
  decision text not null check (decision in ('approved', 'rejected')),
  note text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz not null default now()
);

create index assigned_tasks_assignee_idx
  on public.assigned_tasks (assignee_id, status);
create index assigned_tasks_submitted_idx
  on public.assigned_tasks (submitted_at) where status = 'submitted';
create index assigned_task_items_task_idx
  on public.assigned_task_items (task_id, sort_order);
create index assigned_task_completions_task_idx
  on public.assigned_task_completions (task_id, round);
-- Sweep retensi foto (90 hari) hanya menyentuh baris yang masih punya file.
create index assigned_task_completions_photo_idx
  on public.assigned_task_completions (completed_at) where photo_path is not null;
create index assigned_task_deferrals_user_date_idx
  on public.assigned_task_deferrals (user_id, for_date);
create index assigned_task_reviews_task_idx
  on public.assigned_task_reviews (task_id, round);

create trigger assigned_tasks_updated_at
  before update on public.assigned_tasks
  for each row execute function public.handle_updated_at();

alter table public.assigned_tasks enable row level security;
alter table public.assigned_task_items enable row level security;
alter table public.assigned_task_completions enable row level security;
alter table public.assigned_task_deferrals enable row level security;
alter table public.assigned_task_reviews enable row level security;

-- Admin: penuh.
create policy assigned_tasks_admin_all on public.assigned_tasks
  for all using (public.is_admin()) with check (public.is_admin());
create policy assigned_task_items_admin_all on public.assigned_task_items
  for all using (public.is_admin()) with check (public.is_admin());
create policy assigned_task_completions_admin_all on public.assigned_task_completions
  for all using (public.is_admin()) with check (public.is_admin());
create policy assigned_task_deferrals_admin_all on public.assigned_task_deferrals
  for all using (public.is_admin()) with check (public.is_admin());
create policy assigned_task_reviews_admin_all on public.assigned_task_reviews
  for all using (public.is_admin()) with check (public.is_admin());

-- Karyawan: BACA saja milik sendiri.
create policy assigned_tasks_self_select on public.assigned_tasks
  for select using (assignee_id = auth.uid());
create policy assigned_task_items_self_select on public.assigned_task_items
  for select using (exists (
    select 1 from public.assigned_tasks t
    where t.id = task_id and t.assignee_id = auth.uid()
  ));
create policy assigned_task_completions_self_select on public.assigned_task_completions
  for select using (exists (
    select 1 from public.assigned_tasks t
    where t.id = task_id and t.assignee_id = auth.uid()
  ));
create policy assigned_task_deferrals_self_select on public.assigned_task_deferrals
  for select using (user_id = auth.uid());
create policy assigned_task_reviews_self_select on public.assigned_task_reviews
  for select using (exists (
    select 1 from public.assigned_tasks t
    where t.id = task_id and t.assignee_id = auth.uid()
  ));

-- Grant eksplisit (auto-grant tabel baru berhenti 30 Okt 2026).
grant select, insert, update, delete
  on public.assigned_tasks, public.assigned_task_items,
     public.assigned_task_completions, public.assigned_task_deferrals,
     public.assigned_task_reviews to authenticated;
grant all
  on public.assigned_tasks, public.assigned_task_items,
     public.assigned_task_completions, public.assigned_task_deferrals,
     public.assigned_task_reviews to service_role;

-- ── Storage: bukti foto (privat) ────────────────────────────────────────
-- Path: ${user_id}/${task_id}/r${round}/${item_id}-${uuid}.webp
insert into storage.buckets (id, name, public)
values ('task-evidence', 'task-evidence', false)
on conflict (id) do nothing;

drop policy if exists "task_evidence_upload_own" on storage.objects;
create policy "task_evidence_upload_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'task-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "task_evidence_read_own_or_admin" on storage.objects;
create policy "task_evidence_read_own_or_admin"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'task-evidence'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "task_evidence_delete_admin" on storage.objects;
create policy "task_evidence_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'task-evidence'
    and public.is_admin()
  );
