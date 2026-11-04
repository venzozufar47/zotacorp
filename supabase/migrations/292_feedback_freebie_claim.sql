-- Freebies feedback diklaim di kasir, bukan dikurangi otomatis saat formulir diisi.
-- Status klaim per feedback: pending (menunggu kasir), given (sudah diberikan, stok berkurang), skipped (dilewati).
-- NULL = feedback tidak menawarkan freebies (stok habis saat diisi, cabang tanpa produk freebies, atau feedback lama).
alter table public.customer_feedback
  add column if not exists freebie_claim text check (freebie_claim in ('pending', 'given', 'skipped')),
  add column if not exists freebie_claimed_at timestamptz,
  add column if not exists freebie_claimed_by uuid references auth.users(id) on delete set null;

-- Feedback lama yang sudah memotong stok otomatis dianggap sudah diberikan.
update public.customer_feedback f
set freebie_claim = 'given'
where freebie_claim is null
  and exists (select 1 from public.pos_stock_movements m where m.feedback_id = f.id);

create index if not exists customer_feedback_freebie_pending_idx
  on public.customer_feedback (branch, created_at desc)
  where freebie_claim = 'pending';

comment on column public.customer_feedback.freebie_claim is
  'pending = menunggu kasir; given = diberikan (ada penarikan stok ber-feedback_id); skipped = dilewati/dibatalkan.';
