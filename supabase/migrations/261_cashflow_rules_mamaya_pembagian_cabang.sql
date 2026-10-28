-- Aturan kategorisasi otomatis untuk keputusan manual Oktober 2026: pengeluaran bertanda "mamaya"
-- yang sebenarnya beban cabang Semarang (haengbocake), serta catatan yang menyebut pare / semarang.
--
-- Rekening: Haengbocake (Pusat) 330e6b97-…  Aturan ditempatkan di prioritas 15–24, SEBELUM aturan
-- "bahan" dan "mamaya" (debit → Mamaya) yang lama; mesin aturan memakai slot-fill (aturan pertama
-- yang cocok menang), jadi tanpa ini semuanya jatuh ke Mamaya. Aturan lama bernomor ≥15 digeser +10
-- (urutan relatifnya tetap).

do $$
declare
  acc constant uuid := '330e6b97-84b9-4c4a-8f00-615afa93d079';
begin
  if not exists (select 1 from bank_accounts where id = acc) then
    raise notice 'rekening % tidak ada, dilewati', acc;
    return;
  end if;

  update cashflow_rules
     set priority = priority + 10, updated_at = now()
   where bank_account_id = acc and not is_fallback and priority between 15 and 112;

  insert into cashflow_rules
    (bank_account_id, priority, column_scope, match_type, match_value, set_category, set_branch, side_filter, is_fallback, extra_conditions)
  values
    -- Pengecualian: Bu Wandi beli lombok = bahan Mamaya (harus sebelum aturan gaji Bu Wandi).
    (acc, 15, 'notes', 'contains', 'lombok', 'Cost of Goods Sold', 'Mamaya', 'debit', false, '[]'),
    -- Gaji Bu Wandi (= Sri Nuryati) = Semarang.
    (acc, 16, 'notes', 'contains', E'wandi\nsri nuryati', 'Salaries & Wages', 'Semarang', 'debit', false, '[]'),
    -- Catatan menyebut pare / semarang menang atas tag "mamaya" dan "bahan".
    (acc, 17, 'notes', 'contains', ' pare', null, 'Pare', 'debit', false, '[]'),
    (acc, 18, 'notes', 'starts_with', 'pare', null, 'Pare', 'debit', false, '[]'),
    (acc, 19, 'notes', 'contains', ' semarang', null, 'Semarang', 'debit', false, '[]'),
    (acc, 20, 'notes', 'starts_with', 'semarang', null, 'Semarang', 'debit', false, '[]'),
    -- Bahan khas haengbocake yang dibayar lewat tag "mamaya" = beban Semarang.
    (acc, 21, 'notes', 'contains',
       E'telur\nsari murni\nsarimurni\nputratos\npuratos\nbayar gas\nbahan gas\ngas mamaya\nbeli gas\ngula pasir\ngalon\nrosebrand\nrose brand',
       'Cost of Goods Sold', 'Semarang', 'debit', false,
       '[{"columnScope":"notes","matchType":"contains","matchValue":"mamaya","caseSensitive":false}]');
end $$;
