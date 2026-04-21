-- Kalau admin/assignee menghapus cashflow_transactions yang dibuat
-- dari sale POS, sale tersebut harus ditandai "dibatalkan" di POS —
-- bukan ikut dihapus. Audit trail tetap utuh (row pos_sales +
-- pos_sale_items dibiarkan), UI /pos/riwayat akan render strike
-- berdasarkan voided_at.

alter table public.pos_sales
  add column if not exists voided_at timestamptz;

-- Trigger BEFORE DELETE di parent cashflow_transactions: cari
-- pos_sales yang FK-nya point ke row ini, set voided_at=now().
-- Dipakai BEFORE karena FK `on delete set null` akan menghapus
-- referensi setelahnya; kita perlu menemukan sale dulu lewat id
-- yang lama.
create or replace function public.pos_sales_mark_voided_on_tx_delete()
returns trigger language plpgsql as $$
begin
  update public.pos_sales
  set voided_at = now()
  where cashflow_transaction_id = OLD.id
    and voided_at is null;
  return OLD;
end;
$$;

drop trigger if exists cashflow_tx_void_pos_sale
  on public.cashflow_transactions;
create trigger cashflow_tx_void_pos_sale
  before delete on public.cashflow_transactions
  for each row execute function public.pos_sales_mark_voided_on_tx_delete();
