-- Gate verifikasi foto dengan AI (gratis) untuk titik SOP tertentu — pertama: "Token listrik".
--
-- Satu baris = satu titik (item) yang fotonya dibaca AI. Checklist sudah milik satu cabang,
-- jadi batas per-titik otomatis berarti batas per-cabang. Jenis awal: 'meter_kwh' — AI membaca
-- sisa token/kWh dari foto layar meteran; di bawah \min_value\ foto DITOLAK (karyawan harus
-- mengisi token lalu memfoto ulang). Angka tak terbaca / AI gagal TIDAK memblokir karyawan:
-- foto diterima dan masuk antrean tinjauan manusia.
--
-- Hasil bacaan disimpan di baris completion (ai_*) sebagai jejak audit; ditulis lewat service
-- role oleh server action supaya karyawan tak bisa memalsukannya lewat klien.

create table if not exists public.cleaning_item_ai_gates (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references public.cleaning_checklist_items(id) on delete cascade,
  kind text not null default 'meter_kwh',
  min_value numeric not null,
  is_active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint cleaning_item_ai_gates_kind_chk check (kind in ('meter_kwh')),
  constraint cleaning_item_ai_gates_min_chk check (min_value > 0)
);

comment on table public.cleaning_item_ai_gates is
  'Titik SOP yang fotonya diverifikasi AI. meter_kwh: sisa token di bawah min_value → foto ditolak.';

alter table public.cleaning_item_ai_gates enable row level security;

drop policy if exists cleaning_item_ai_gates_admin on public.cleaning_item_ai_gates;
create policy cleaning_item_ai_gates_admin
  on public.cleaning_item_ai_gates
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.cleaning_item_ai_gates to authenticated, service_role;

alter table public.cleaning_task_completions
  add column if not exists ai_reading numeric,
  add column if not exists ai_status text,
  add column if not exists ai_checked_at timestamptz;

alter table public.cleaning_task_completions
  drop constraint if exists cleaning_task_completions_ai_status_chk;
alter table public.cleaning_task_completions
  add constraint cleaning_task_completions_ai_status_chk
  check (ai_status is null or ai_status in ('ok', 'unreadable', 'error'));

comment on column public.cleaning_task_completions.ai_reading is 'Angka yang dibaca AI dari foto (kWh) — hanya untuk titik ber-gate AI.';
comment on column public.cleaning_task_completions.ai_status is 'ok = terbaca & lolos; unreadable = AI tak bisa membaca; error = AI gagal/timeout. Yang ditolak (di bawah batas) tidak tersimpan.';

-- Titik "Token listrik" Haengbocake Semarang: standarnya "isi jika kurang dari 100,00 kWh".
insert into public.cleaning_item_ai_gates (item_id, kind, min_value)
select i.id, 'meter_kwh', 100
from public.cleaning_checklist_items i
where i.id = '0f44e0eb-78cf-44c4-8d44-be8b6de1c79b'
on conflict (item_id) do nothing;
