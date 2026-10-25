-- Agregat POS dan waste per cabang Haengbocake untuk Scorecard Unit Bisnis (B1, B4, B5). Hanya service_role.
-- Pendapatan item = subtotal × (total ÷ gross_total) supaya diskon ikut dihitung; hanya penjualan lunas dan tidak di-void.
create or replace function public.scorecard_pos_agg(p_pos_branch text, p_from date, p_to date)
returns table (product_id uuid, variant_id uuid, qty numeric, net_revenue numeric)
language sql
stable
as $$
  select i.product_id, i.variant_id, sum(i.qty)::numeric,
         sum(i.subtotal * coalesce(s.total / nullif(s.gross_total, 0), 1))::numeric
  from public.pos_sales s
  join public.pos_sale_items i on i.sale_id = s.id
  join public.bank_accounts a on a.id = s.bank_account_id
  where a.business_unit = 'Haengbocake' and a.pos_enabled and a.default_branch = p_pos_branch
    and s.sale_date between p_from and p_to
    and s.voided_at is null and s.payment_status = 'paid'
  group by i.product_id, i.variant_id
$$;

create or replace function public.scorecard_pos_total(p_pos_branch text, p_from date, p_to date)
returns numeric
language sql
stable
as $$
  select coalesce(sum(s.total), 0)::numeric
  from public.pos_sales s
  join public.bank_accounts a on a.id = s.bank_account_id
  where a.business_unit = 'Haengbocake' and a.pos_enabled and a.default_branch = p_pos_branch
    and s.sale_date between p_from and p_to
    and s.voided_at is null and s.payment_status = 'paid'
$$;

-- Waste = penarikan alasan expired + rusak; baris qty > p_cap (salah input 100 juta) dibuang seperti src/lib/pos/waste.ts.
create or replace function public.scorecard_waste_agg(p_pos_branch text, p_from date, p_to date, p_cap numeric default 10000)
returns table (product_id uuid, variant_id uuid, reason text, qty numeric, rows_n bigint)
language sql
stable
as $$
  select m.product_id, m.variant_id, m.withdrawal_reason, sum(m.qty)::numeric, count(*)
  from public.pos_stock_movements m
  join public.bank_accounts a on a.id = m.bank_account_id
  where a.business_unit = 'Haengbocake' and a.pos_enabled and a.default_branch = p_pos_branch
    and m.type = 'withdrawal' and m.withdrawal_reason in ('expired', 'rusak')
    and m.qty > 0 and m.qty <= p_cap
    and m.movement_date between p_from and p_to
  group by m.product_id, m.variant_id, m.withdrawal_reason
$$;

revoke all on function public.scorecard_pos_agg(text, date, date) from public, anon, authenticated;
revoke all on function public.scorecard_pos_total(text, date, date) from public, anon, authenticated;
revoke all on function public.scorecard_waste_agg(text, date, date, numeric) from public, anon, authenticated;
grant execute on function public.scorecard_pos_agg(text, date, date) to service_role;
grant execute on function public.scorecard_pos_total(text, date, date) to service_role;
grant execute on function public.scorecard_waste_agg(text, date, date, numeric) to service_role;
