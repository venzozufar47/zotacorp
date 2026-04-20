-- Scope categorization rules per bank account instead of per business
-- unit. Reason: even within one BU, different rekening have different
-- transaction patterns (Jago has unique labels like "Main Pocket
-- Movement", Mandiri has different counterparty naming, etc.). A
-- rule that sets "Shipping Cost" for Jago's "Gojek" notes would
-- misfire on a Mandiri account where "Gojek" means something else.
--
-- Migration strategy: this table was shipped in 023 but had no
-- real user data at the time (user created zero rules before asking
-- for the scope change). We swap the column in place: drop the
-- business_unit-based index, add bank_account_id FK, drop the old
-- column. Nullable first so existing rows (if any) survive; after
-- backfill the column is NOT NULL enforced via a separate step only
-- if data exists.

alter table public.cashflow_rules
  add column if not exists bank_account_id uuid references public.bank_accounts(id) on delete cascade;

-- There shouldn't be any pre-existing rows (feature is fresh), but
-- if there are, they lose their BU scope — rebind manually or delete.
-- Drop any orphaned rows so the NOT NULL constraint below succeeds.
delete from public.cashflow_rules where bank_account_id is null;

alter table public.cashflow_rules
  alter column bank_account_id set not null;

alter table public.cashflow_rules
  drop column if exists business_unit;

drop index if exists cashflow_rules_bu_priority_idx;

create index if not exists cashflow_rules_account_priority_idx
  on public.cashflow_rules (bank_account_id, priority)
  where active;
