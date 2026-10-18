-- Membuang tabel tutup kas yang sudah tidak terpakai, untuk efisiensi (permintaan owner):
--   * cash_closings, cash_closing_petty_expenses (migrasi 195) — digantikan sistem shift POS (207); tidak
--     pernah berisi data (0 baris saat dibuang).
--   * pos_cash_closings (migrasi 170) — versi paling awal, tidak pernah dipakai kode mana pun (0 baris).
-- Bucket `cash-closing-photos` TIDAK dibuang: dipakai sebagai penampung sementara foto nota shift.
--
-- URUTAN RILIS: terapkan SETELAH kode shift ter-deploy (kode lama, mis. Scorecard, masih membaca cash_closings).
-- Guard di bawah menolak bila ternyata sudah ada isinya, supaya tidak ada data yang hilang diam-diam.
do $$
declare n bigint;
begin
  if to_regclass('public.cash_closings') is not null then
    execute 'select count(*) from public.cash_closings' into n;
    if n > 0 then raise exception 'cash_closings berisi % baris — tidak dibuang', n; end if;
  end if;
  if to_regclass('public.cash_closing_petty_expenses') is not null then
    execute 'select count(*) from public.cash_closing_petty_expenses' into n;
    if n > 0 then raise exception 'cash_closing_petty_expenses berisi % baris — tidak dibuang', n; end if;
  end if;
  if to_regclass('public.pos_cash_closings') is not null then
    execute 'select count(*) from public.pos_cash_closings' into n;
    if n > 0 then raise exception 'pos_cash_closings berisi % baris — tidak dibuang', n; end if;
  end if;
end $$;

drop table if exists public.cash_closing_petty_expenses;
drop table if exists public.cash_closings;
drop table if exists public.pos_cash_closings;
