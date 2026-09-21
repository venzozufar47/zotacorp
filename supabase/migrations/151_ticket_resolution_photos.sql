-- Foto bukti penyelesaian tiket. Dipisahkan dari foto pelapor lewat kolom
-- `kind`:
--   'report'     lampiran pelapor saat buat tiket (perilaku lama; baris lama
--                otomatis begini)
--   'resolution' bukti dari Kepala Studio/owner saat menandai selesai
--   'superseded' bukti dari putaran sebelumnya yang DITOLAK pelapor
--                ("belum beres") — disimpan untuk jejak, tidak ditampilkan
-- Bucket & policy storage tidak berubah — uploader tetap menulis ke folder
-- ${uid}/ miliknya.
alter table public.ticket_attachments
  add column if not exists kind text not null default 'report';

do $$ begin
  alter table public.ticket_attachments
    add constraint ticket_attachments_kind_chk
    check (kind in ('report', 'resolution', 'superseded'));
exception when duplicate_object then null; end $$;
