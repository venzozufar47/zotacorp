-- Target Service Level per outlet — dulu hardcode "100%" di seluruh UI
-- (lihat 122). Pare butuh 80%: kue custom/pre-order, bukan stok jadi yang
-- realistis dijaga 100% tersedia sepanjang jam buka.
--
-- Per-outlet (bukan konstanta aplikasi) karena skema jam-operasi (122)
-- sudah per-outlet dengan alasan yang sama — outlet lain punya
-- karakteristik produk berbeda dan mungkin butuh target berbeda juga.

alter table public.bank_accounts
  add column if not exists service_level_target numeric(5,4) not null default 1.0000;

do $$ begin
  alter table public.bank_accounts
    add constraint bank_accounts_service_level_target_check
    check (service_level_target > 0 and service_level_target <= 1);
exception when duplicate_object then null; end $$;

comment on column public.bank_accounts.service_level_target is
  'Target Service Level, pecahan 0-1 (mis. 0.8000 = 80%). Dipakai UI '
  'untuk label "Target N%" dan ambang warna (lihat serviceLevelTone di '
  'lib/pos/service-level.ts), gantikan asumsi 100% yang dulu hardcode.';

update public.bank_accounts
  set service_level_target = 0.8000
  where account_name = 'Cash Haengbocake Pare';
