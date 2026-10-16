-- Rombakan halaman SOP: loop "Perbaiki SOP" dan "Sudah dicek".
--
-- 1) cleaning_sop_fixes — satu baris = satu perbaikan SOP pada satu titik (item).
--    Diambil dari temuan yang akar masalahnya ada di SOP/titiknya, bukan di
--    orangnya. `base_pct` membekukan kepatuhan titik itu (14 hari) SAAT keputusan
--    dibuat; angka "sesudah" tidak disimpan — dihitung dari laporan hidup supaya
--    tidak basi. Evaluasinya setelah 7 hari kerja sejak `started_on`.
--
-- 2) cleaning_finding_acks — admin menandai temuan "sudah dicek" tanpa tindakan
--    lain. `ack_key` memuat sidik temuannya (jenis + tanggal kejadian terbaru), jadi
--    temuan yang SAMA tidak muncul lagi, tetapi kejadian BARU pada titik yang sama
--    menghasilkan kunci baru dan muncul kembali — tanda centang tidak boleh
--    membungkam titik itu selamanya.
--
-- Keduanya hanya dipakai admin (halaman /admin/cleaning).

create table if not exists public.cleaning_sop_fixes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.cleaning_checklist_items(id) on delete cascade,
  -- Kunci cabang persis seperti di laporan: 'loc:<uuid>' atau 'unit:<nama>'.
  branch_key text not null,
  action text not null,
  note text,
  base_pct integer not null,
  started_on date not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint cleaning_sop_fixes_action_chk check (length(btrim(action)) > 0),
  constraint cleaning_sop_fixes_base_chk check (base_pct between 0 and 100)
);

comment on table public.cleaning_sop_fixes is
  'Perbaikan SOP per titik yang dipantau 7 hari kerja. Angka sesudah dihitung dari laporan, tidak disimpan.';

create index if not exists cleaning_sop_fixes_started_idx
  on public.cleaning_sop_fixes (started_on desc);
create index if not exists cleaning_sop_fixes_item_idx
  on public.cleaning_sop_fixes (item_id);

create table if not exists public.cleaning_finding_acks (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.cleaning_checklist_items(id) on delete cascade,
  ack_key text not null,
  acked_by uuid references public.profiles(id) on delete set null,
  acked_at timestamptz not null default now(),
  constraint cleaning_finding_acks_uniq unique (item_id, ack_key)
);

comment on table public.cleaning_finding_acks is
  'Temuan yang sudah dicek admin. ack_key = jenis + tanggal kejadian terbaru; kejadian baru memunculkan temuan lagi.';

alter table public.cleaning_sop_fixes enable row level security;
alter table public.cleaning_finding_acks enable row level security;

drop policy if exists cleaning_sop_fixes_admin on public.cleaning_sop_fixes;
create policy cleaning_sop_fixes_admin
  on public.cleaning_sop_fixes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists cleaning_finding_acks_admin on public.cleaning_finding_acks;
create policy cleaning_finding_acks_admin
  on public.cleaning_finding_acks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Sejak 30 Okt 2026 Supabase tidak lagi memberi grant otomatis pada tabel
-- public baru; tanpa ini tabel tak terjangkau supabase-js.
grant select, insert, update, delete on public.cleaning_sop_fixes to authenticated, service_role;
grant select, insert, update, delete on public.cleaning_finding_acks to authenticated, service_role;
