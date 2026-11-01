-- Dua kolom baru di cashflow_transactions:
--  * reference: kode referensi/ID pembayaran dari keterangan bank (mis. "Transfer Fee 17911700368574", ID gateway, kode DANA),
--    dipisah dari source_destination supaya nama pihak bersih. Tidak dipakai kunci dedupe maupun kategorisasi.
--  * original_description: keterangan ASLI dari bank saat diimpor, tidak pernah berubah walau admin menyunting `description`
--    (memo, koreksi). Dipakai untuk audit dan agar unggah ulang tidak menggandakan baris yang keterangannya sudah disunting.
alter table public.cashflow_transactions add column if not exists reference text;
alter table public.cashflow_transactions add column if not exists original_description text;

-- Baris yang sudah ada: aslinya tidak diketahui lagi, jadi pakai keterangan saat ini sebagai titik awal.
update public.cashflow_transactions set original_description = description where original_description is null;

-- Baris baru dari jalur impor mana pun: bila tidak diisi eksplisit, aslinya = keterangan saat dimasukkan.
create or replace function public.cashflow_set_original_description() returns trigger
language plpgsql as $$
begin
  if new.original_description is null then
    new.original_description := new.description;
  end if;
  return new;
end;
$$;

drop trigger if exists cashflow_transactions_original_description on public.cashflow_transactions;
create trigger cashflow_transactions_original_description
  before insert on public.cashflow_transactions
  for each row execute function public.cashflow_set_original_description();
