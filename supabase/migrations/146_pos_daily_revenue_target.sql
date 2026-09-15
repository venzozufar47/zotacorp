-- Target omset harian per outlet — dipakai kartu di layar kasir (di
-- samping Service Level) supaya karyawan selalu lihat target hari ini
-- vs capaian. Null = kartu tidak ditampilkan (belum di-set admin).
--
-- Per-outlet, mengikuti pola service_level_target (migrasi 135): outlet
-- lain punya biaya tetap & margin berbeda, jadi target break-even/profit
-- juga beda per outlet.

alter table public.bank_accounts
  add column if not exists daily_revenue_target numeric(12,0);

do $$ begin
  alter table public.bank_accounts
    add constraint bank_accounts_daily_revenue_target_check
    check (daily_revenue_target is null or daily_revenue_target > 0);
exception when duplicate_object then null; end $$;

comment on column public.bank_accounts.daily_revenue_target is
  'Target omset (Sales + QRIS) per hari, Rupiah. Null = kartu target '
  'harian tidak ditampilkan di POS. Lihat lib/actions/pos.actions.ts '
  '(getPosDailyRevenueSummary) dan DailyRevenueTargetCard.';

update public.bank_accounts
  set daily_revenue_target = 1650000
  where account_name = 'Cash Haengbocake Pare';
