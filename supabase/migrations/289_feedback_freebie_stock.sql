-- Freebies untuk pengisi feedback pelanggan: tiap feedback yang tersimpan mengurangi stok produk "Freebies Tiramisu"
-- cabangnya (penarikan alasan hadiah/kompensasi). Penarikan ditautkan ke feedback-nya supaya:
--  - satu feedback paling banyak satu kali mengurangi stok (indeks unik, jadi aman diulang);
--  - feedback yang dihapus admin (mis. spam) otomatis mengembalikan stok (cascade).
alter table public.pos_stock_movements
  add column if not exists feedback_id uuid references public.customer_feedback(id) on delete cascade;

comment on column public.pos_stock_movements.feedback_id is
  'Terisi untuk penarikan otomatis freebies dari pengisian feedback pelanggan. Feedback dihapus = penarikan ikut terhapus.';

create unique index if not exists pos_stock_movements_feedback_uidx
  on public.pos_stock_movements (feedback_id) where feedback_id is not null;
