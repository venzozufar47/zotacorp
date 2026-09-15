-- Tambah kolom "apresiasi" (apresiasi umum, wajib diisi) supaya form
-- evaluasi 360° tidak melulu berisi skor/kritik. "notes" (catatan
-- tambahan) yang sebelumnya opsional juga diwajibkan — semua field pada
-- form kini wajib terisi. Tabel masih kosong (belum ada submission
-- nyata sejak fitur ini di-deploy), jadi aman langsung `not null`.

alter table public.evaluation_360_responses
  add column apresiasi text not null default '';

alter table public.evaluation_360_responses
  alter column apresiasi drop default;

alter table public.evaluation_360_responses
  add constraint evaluation_360_responses_apresiasi_check
    check (length(btrim(apresiasi)) > 0);

alter table public.evaluation_360_responses
  alter column notes set not null;

alter table public.evaluation_360_responses
  add constraint evaluation_360_responses_notes_check
    check (length(btrim(notes)) > 0);
