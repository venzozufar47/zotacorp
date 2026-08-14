-- Verdict admin atas foto bukti kebersihan.
--
-- Sampai sekarang admin hanya bisa MELIHAT foto; tidak ada cara menyatakan
-- "ini tidak layak, ulangi". Akibatnya status "Perlu ulang" di rancangan
-- halaman tidak punya sumber data sama sekali, dan satu-satunya tindak lanjut
-- adalah menegur di luar sistem — tidak terekam, tidak terhitung.
--
-- ── Kenapa defaultnya 'unreviewed', bukan 'pending' ───────────────────────
--
-- Ada 2.000+ completion lama di tabel ini. Kalau defaultnya bernama 'pending',
-- seluruhnya langsung terbaca sebagai antrean review yang menunggu — admin
-- membuka halaman dan disambut tunggakan 2.000 item yang tidak pernah ia
-- janjikan untuk kerjakan. 'unreviewed' menyatakan apa adanya: belum disentuh,
-- dan memang tidak harus disentuh. Yang masuk antrean HANYA yang secara
-- eksplisit ditandai 'redo'.
alter table public.cleaning_task_completions
  add column if not exists review_status text not null default 'unreviewed',
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table public.cleaning_task_completions
  drop constraint if exists cleaning_completion_review_status_chk;
alter table public.cleaning_task_completions
  add constraint cleaning_completion_review_status_chk
    check (review_status in ('unreviewed', 'ok', 'redo'));

comment on column public.cleaning_task_completions.review_status is
  'unreviewed = belum ditinjau admin (default, bukan antrean). ok = disetujui. redo = diminta ulang; inilah yang memunculkan status "Perlu ulang".';
comment on column public.cleaning_task_completions.review_note is
  'Alasan diminta ulang. Dibaca karyawan, jadi isinya harus cukup jelas untuk ditindak tanpa bertanya balik.';

-- Antrean "perlu ulang" dibaca tiap kali halaman admin dibuka, dan hampir
-- selalu hanya segelintir baris di antara puluhan ribu. Index parsial menjaga
-- biayanya tetap kecil tanpa membebani INSERT harian.
create index if not exists cleaning_completions_redo_idx
  on public.cleaning_task_completions (date desc)
  where review_status = 'redo';

-- ── Verdict tidak boleh ditulis oleh yang dinilai ────────────────────────
--
-- Karyawan HARUS bisa MEMBACA verdict atas pekerjaannya sendiri — diminta
-- mengulang tanpa boleh tahu alasannya adalah instruksi tanpa isi. Policy
-- `cleaning_completions_select_own` yang sudah ada mencakup kolom baru ini
-- karena RLS bekerja per-baris.
--
-- Justru karena per-baris itulah ada lubangnya: policy
-- `cleaning_completions_update_own` membolehkan karyawan meng-UPDATE barisnya
-- sendiri (untuk membatalkan centang), dan RLS tidak bisa membatasi KOLOM mana
-- yang boleh disentuh. Tanpa penjaga di bawah ini, siapa pun bisa menyetujui
-- fotonya sendiri — atau menghapus 'redo' yang baru saja diberikan admin —
-- lewat satu panggilan API biasa. Mengandalkan server action saja tidak cukup:
-- yang dijaga action adalah pintu yang kita buat, bukan pintu yang sudah ada.
create or replace function public.cleaning_guard_review_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() null = service role (server kita sendiri); admin = penilai sah.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.review_status is distinct from old.review_status
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.review_note is distinct from old.review_note then
    raise exception 'Verdict foto kebersihan hanya boleh diubah admin';
  end if;
  return new;
end;
$$;

drop trigger if exists cleaning_guard_review on public.cleaning_task_completions;
create trigger cleaning_guard_review
  before update on public.cleaning_task_completions
  for each row execute function public.cleaning_guard_review_columns();
