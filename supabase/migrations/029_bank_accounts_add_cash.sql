-- Extend the bank check constraint to allow "cash" as a valid bank
-- code. Admin selects this for physical-cash-handling "accounts"
-- (e.g. store register, petty cash) that aren't tied to a real bank
-- but still need transactions tracked in the cashflow table.
--
-- All other banks get their own parser eventually; for now "cash"
-- entries are input manually via the rekening detail's Input manual
-- flow.

alter table public.bank_accounts
  drop constraint bank_accounts_bank_check;

alter table public.bank_accounts
  add constraint bank_accounts_bank_check
    check (bank = any (array['mandiri','jago','bca','bri','bni','cash','other']));
