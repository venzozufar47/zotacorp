-- POS Mamaya House (/posmamaya).
--
-- Mamaya punya katalog, stok, opname, diskon, struk, dan insight SENDIRI, tapi uangnya, shift, dan laci
-- kasnya SATU dengan Semarang. Stok/opname di POS terkunci per rekening (opname = reset total per rekening),
-- jadi Mamaya mendapat baris `bank_accounts` sendiri sebagai "rekening POS" — wadah katalog dkk, BUKAN rekening
-- uang. Kolom `ledger_account_id` menunjuk rekening yang menampung uang & shift-nya (Cash Haengbocake Semarang):
-- penjualan, void, pelunasan pesanan, dan belanja shift dibukukan ke rekening itu dengan tag cabang 'Mamaya'.
--
-- Rekening ber-`ledger_account_id` TIDAK boleh muncul di daftar Finance (tidak punya saldo sendiri).

alter table public.bank_accounts
  add column if not exists ledger_account_id uuid references public.bank_accounts(id) on delete restrict;

alter table public.bank_accounts
  drop constraint if exists bank_accounts_ledger_not_self;
alter table public.bank_accounts
  add constraint bank_accounts_ledger_not_self
  check (ledger_account_id is null or ledger_account_id <> id);

comment on column public.bank_accounts.ledger_account_id is
  'Rekening POS ini hanya wadah katalog/stok/diskon/struk; uang & shift-nya dibukukan ke rekening ini. '
  'NULL = rekening biasa (punya buku kas & shift sendiri).';

create index if not exists bank_accounts_ledger_account_idx
  on public.bank_accounts (ledger_account_id)
  where ledger_account_id is not null;

-- Kasir yang ditugaskan di rekening induk otomatis boleh memakai rekening POS yang menautkannya.
create or replace function public.is_admin_or_pos_assignee(account_id uuid)
  returns boolean
  language sql
  stable
  security definer
as $function$
  select public.is_admin() or exists (
    select 1 from public.bank_account_assignees a
    where a.user_id = auth.uid()
      and a.scope in ('full', 'pos_only')
      and (
        a.bank_account_id = account_id
        or a.bank_account_id = (
          select b.ledger_account_id from public.bank_accounts b where b.id = account_id
        )
      )
  );
$function$;

-- Rekening POS Mamaya House (idempoten). Struk disalin dari Semarang dengan header & alamat sendiri.
insert into public.bank_accounts
  (business_unit, bank, account_name, default_branch, pos_enabled, is_active, ledger_account_id, pos_receipt_config)
select s.business_unit, 'cash', 'Mamaya House', 'Mamaya', true, true, s.id,
       case when s.pos_receipt_config is null then null
            else jsonb_set(jsonb_set(s.pos_receipt_config, '{header}', '"Mamaya House"'), '{address}', '""')
       end
  from public.bank_accounts s
 where s.business_unit = 'Haengbocake'
   and s.default_branch = 'Semarang'
   and s.bank = 'cash'
   and s.pos_enabled
   and not exists (
     select 1 from public.bank_accounts m
      where m.business_unit = 'Haengbocake' and m.default_branch = 'Mamaya' and m.ledger_account_id is not null
   );

-- Penanggung jawab PIN (produksi/penarikan/opname/void) disalin dari Semarang.
insert into public.pos_operation_authorizers (bank_account_id, operation, user_id)
select m.id, a.operation, a.user_id
  from public.bank_accounts m
  join public.pos_operation_authorizers a on a.bank_account_id = m.ledger_account_id
 where m.default_branch = 'Mamaya' and m.ledger_account_id is not null
on conflict do nothing;
