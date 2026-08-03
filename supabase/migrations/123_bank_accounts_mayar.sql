-- Izinkan bank = 'mayar' pada bank_accounts.
--
-- Mayar adalah payment gateway, bukan bank. Tetap dimodelkan sebagai
-- rekening supaya pendapatannya lewat jalur cashflow_statements →
-- cashflow_transactions yang sama, sehingga otomatis ikut ke PnL tanpa
-- agregator terpisah.
--
-- CHECK constraint lama meng-hardcode daftar bank; menambah nilai baru
-- berarti drop + recreate. Tidak ada backfill data yang diperlukan.

alter table bank_accounts
  drop constraint if exists bank_accounts_bank_check;

alter table bank_accounts
  add constraint bank_accounts_bank_check
  check (bank = any (array[
    'mandiri'::text,
    'jago'::text,
    'bca'::text,
    'bri'::text,
    'bni'::text,
    'cash'::text,
    'mayar'::text,
    'other'::text
  ]));
