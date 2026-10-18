-- Sistem SP (PRD-6) — perluasan `employee_coaching_notes` (migrasi 131)
-- menjadi juga tempat Surat Peringatan berjenjang, bukan tabel baru:
-- SP dan catatan pembinaan adalah dokumen yang sama secara bentuk (subjek,
-- penulis, isi, periode, baca/ack) — hanya beda berat. Memecahnya jadi
-- tabel sendiri akan mengulang persis alasan migrasi 131 kenapa tabel ini
-- sengaja umum.
--
-- `sp_level` null = catatan pembinaan biasa (perilaku lama, tidak berubah).
-- 'teguran' = Formulir 1 (teguran lisan tercatat) — BUKAN sanksi, boleh
-- dibuat kepala tim. 'sp1'/'sp2'/'sp3' = sanksi formal, Owner-only,
-- ditegakkan di `coaching-review.actions.ts`/`createCoachingNote`, bukan
-- di RLS (penulisan tetap lewat service-role setelah gate aplikasi, sama
-- pola dengan `cash_closings` dan `leave_requests`).

alter table public.employee_coaching_notes
  drop constraint if exists employee_coaching_notes_context_chk;
alter table public.employee_coaching_notes
  add constraint employee_coaching_notes_context_chk
    check (context in ('cleaning', 'attendance', 'service', 'sp', 'lain'));

alter table public.employee_coaching_notes
  add column if not exists sp_level text,
  add column if not exists sop_reference text,
  add column if not exists valid_until date,
  add column if not exists employee_response text,
  add column if not exists employee_acceptance text;

alter table public.employee_coaching_notes
  drop constraint if exists employee_coaching_notes_sp_level_chk;
alter table public.employee_coaching_notes
  add constraint employee_coaching_notes_sp_level_chk
    check (sp_level is null or sp_level in ('teguran', 'sp1', 'sp2', 'sp3'));

alter table public.employee_coaching_notes
  drop constraint if exists employee_coaching_notes_acceptance_chk;
alter table public.employee_coaching_notes
  add constraint employee_coaching_notes_acceptance_chk
    check (employee_acceptance is null or employee_acceptance in ('menerima', 'menerima_keberatan'));

comment on column public.employee_coaching_notes.sp_level is
  'null = catatan pembinaan biasa. teguran = Formulir 1. sp1/sp2/sp3 = sanksi formal (Owner-only).';
comment on column public.employee_coaching_notes.valid_until is
  '6 bulan sejak terbit untuk sp1/sp2/sp3 (Dokumen 3 §3.2) — dipakai cek "SP aktif" (gate bonus kelak).';
comment on column public.employee_coaching_notes.employee_response is
  'Pembelaan/klarifikasi karyawan — hak didengar sebelum sanksi ditetapkan (Dokumen 3 §7).';
comment on column public.employee_coaching_notes.employee_acceptance is
  'Pernyataan karyawan saat menerima SP: menerima, atau menerima dengan keberatan.';

-- Dipakai cek cepat "siapa yang sedang punya SP aktif" (list admin, dan
-- gate bonus kelak) — partial index karena mayoritas baris bukan SP.
create index if not exists employee_coaching_notes_active_sp_idx
  on public.employee_coaching_notes (user_id, valid_until)
  where sp_level in ('sp1', 'sp2', 'sp3');

-- Kepala tim (leader di `team_members`, migrasi 175) boleh menulis catatan
-- untuk anggotanya SENDIRI — tapi hanya sp_level null atau 'teguran'.
-- sp1/sp2/sp3 (sanksi) tidak lolos policy ini sama sekali, jadi tetap
-- Owner-only di level database, bukan cuma di aplikasi (Dokumen 3 §3:
-- "Sanksi hanya dijatuhkan oleh Owner").
drop policy if exists employee_coaching_notes_leader_insert on public.employee_coaching_notes;
create policy employee_coaching_notes_leader_insert
  on public.employee_coaching_notes
  for insert to authenticated
  with check (
    (sp_level is null or sp_level = 'teguran')
    and author_id = auth.uid()
    and exists (
      select 1 from public.team_members tm
      where tm.leader_id = auth.uid() and tm.member_id = employee_coaching_notes.user_id
    )
  );

-- Perluas trigger guard: subjek catatan (karyawan) sekarang juga boleh
-- mengisi employee_response & employee_acceptance pada barisnya sendiri
-- (hak membela diri), selain acknowledged_at seperti sebelumnya. Kolom SP
-- (sp_level, sop_reference, valid_until) TETAP terkunci dari non-admin.
create or replace function public.coaching_note_guard_body()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.body is distinct from old.body
     or new.user_id is distinct from old.user_id
     or new.author_id is distinct from old.author_id
     or new.context is distinct from old.context
     or new.period_from is distinct from old.period_from
     or new.period_to is distinct from old.period_to
     or new.created_at is distinct from old.created_at
     or new.sp_level is distinct from old.sp_level
     or new.sop_reference is distinct from old.sop_reference
     or new.valid_until is distinct from old.valid_until then
    raise exception 'Catatan pembinaan hanya boleh diubah admin';
  end if;
  return new;
end;
$$;
