-- Siklus review foto kebersihan: alasan redo granular, jejak "sudah
-- diperbaiki", foto referensi bisa diganti dari hasil review (dengan undo
-- 1 langkah), dan blokir sign-in terpisah dari block_checkout yang sudah ada.
--
-- Kelanjutan migrasi 130 (verdict admin dasar: ok/redo + catatan). Sekarang
-- 'redo' generic dipecah jadi dua alasan konkret (angle vs belum bersih),
-- dan ada jalur eksplisit untuk menutup redo itu: karyawan foto ulang,
-- completion BARU tertaut ke completion LAMA lewat fixed_by_completion_id.
-- Selama kolom itu NULL, redo dianggap masih aktif — inilah yang dipakai
-- gate blokir sign-in/checkout yang baru.

alter table public.cleaning_task_completions
  add column if not exists redo_reason text,
  add column if not exists fixed_by_completion_id uuid
    references public.cleaning_task_completions(id);

alter table public.cleaning_task_completions
  drop constraint if exists cleaning_completion_redo_reason_chk;
alter table public.cleaning_task_completions
  add constraint cleaning_completion_redo_reason_chk
    check (redo_reason is null or redo_reason in ('angle', 'not_clean'));

comment on column public.cleaning_task_completions.redo_reason is
  'Hanya terisi saat review_status=redo. angle = sudut foto kurang tepat, not_clean = titiknya belum bersih.';
comment on column public.cleaning_task_completions.fixed_by_completion_id is
  'Diisi saat karyawan submit ulang foto BARU (baris berbeda, biasanya tanggal lain) untuk menutup redo ini. NULL = masih memblokir sign in/out.';

-- Baris redo yang BELUM ditutup, per user — inilah yang dicek gate blokir
-- setiap kali seseorang mencoba check-in/check-out.
create index if not exists cleaning_completions_pending_redo_idx
  on public.cleaning_task_completions (user_id)
  where review_status = 'redo' and fixed_by_completion_id is null;

-- ── Perluas penjaga migrasi 130 ──────────────────────────────────────────
--
-- redo_reason bernasib sama dengan review_status/review_note: karyawan tidak
-- boleh mengubahnya sendiri. fixed_by_completion_id JUGA harus dikunci —
-- tanpa ini, karyawan bisa menulis nilai apa saja ke kolom itu lewat
-- panggilan API biasa dan membatalkan blokirnya sendiri tanpa benar-benar
-- memperbaiki apa pun. Satu-satunya jalur sah menuliskannya adalah
-- resubmitCleaningPhoto() di server, yang menulis lewat service-role
-- (auth.uid() is null di trigger ini) setelah memverifikasi completion
-- barunya benar-benar baru dan benar-benar miliknya.
create or replace function public.cleaning_guard_review_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.review_status is distinct from old.review_status
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.review_note is distinct from old.review_note
     or new.redo_reason is distinct from old.redo_reason
     or new.fixed_by_completion_id is distinct from old.fixed_by_completion_id then
    raise exception 'Verdict foto kebersihan hanya boleh diubah admin';
  end if;
  return new;
end;
$$;

-- ── Foto referensi: bisa diganti dari hasil review, undo 1 langkah ──────
alter table public.cleaning_item_photos
  add column if not exists source_completion_id uuid
    references public.cleaning_task_completions(id),
  add column if not exists previous_reference_photo_path text,
  add column if not exists previous_source_completion_id uuid
    references public.cleaning_task_completions(id);

comment on column public.cleaning_item_photos.source_completion_id is
  'Completion mana yang jadi sumber reference_photo_path saat ini (audit: foto referensi ini asalnya dari submission siapa/kapan).';
comment on column public.cleaning_item_photos.previous_reference_photo_path is
  'Snapshot reference_photo_path SEBELUM diganti — dipakai undoReferencePhoto() untuk kembali 1 langkah kalau kepencet. Bukan riwayat penuh.';
comment on column public.cleaning_item_photos.previous_source_completion_id is
  'Snapshot source_completion_id SEBELUM diganti, pasangan previous_reference_photo_path.';

-- ── Blokir sign-in, terpisah dari block_checkout yang sudah ada ─────────
--
-- block_checkout (migrasi lama) cuma soal checkout. Redo yang belum
-- diperbaiki harus menahan check-in juga — tapi sebagai flag TERPISAH,
-- bukan menimpa block_checkout, supaya kombinasi lama (checklist harian
-- wajib sebelum checkout) tidak berubah perilaku untuk assignment yang
-- sudah ada.
alter table public.cleaning_assignments
  add column if not exists block_signin boolean not null default false;
comment on column public.cleaning_assignments.block_signin is
  'Kalau true DAN ada completion assignment ini berstatus redo yang belum fixed_by_completion_id, karyawan tidak bisa check-in.';
