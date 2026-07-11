-- Konfirmasi karyawan (pembuat) atas tiket yang sudah diselesaikan Kepala
-- Studio / owner. Cross-check: filer mengkonfirmasi selesai, atau menandai
-- "belum beres" -> tiket dibuka kembali (status in_progress) + dispute_note.
alter table public.tickets
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists dispute_note text;
