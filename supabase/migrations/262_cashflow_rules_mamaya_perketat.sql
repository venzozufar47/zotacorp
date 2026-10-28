-- Susulan 261: aturan "pare"/"semarang" hanya boleh MENGALAHKAN tag Mamaya (catatan ber-"bahan" atau
-- "mamaya"), bukan aturan Pusat yang lebih spesifik ("ads slice semarang", "renov subs semarang").
-- Plus: gaji karyawan Semarang yang catatannya memuat "Mamaya" tetap Semarang (nama penerima = aturan lama).

do $$
declare
  acc constant uuid := '330e6b97-84b9-4c4a-8f00-615afa93d079';
begin
  if not exists (select 1 from bank_accounts where id = acc) then
    return;
  end if;

  update cashflow_rules
     set extra_conditions = '[{"columnScope":"notes","matchType":"contains","matchValue":"bahan\nmamaya","caseSensitive":false}]'::jsonb,
         updated_at = now()
   where bank_account_id = acc and not is_fallback and priority between 17 and 20
     and set_branch in ('Pare', 'Semarang') and set_category is null;

  insert into cashflow_rules
    (bank_account_id, priority, column_scope, match_type, match_value, set_category, set_branch, side_filter, is_fallback, extra_conditions)
  values
    (acc, 22, 'sourceDestination', 'contains', E'EPAFRODITUS YUAN PICO\nMUHAMMAD ABDUL ARIFIN', 'Salaries & Wages', 'Semarang', 'any', false, '[]');
end $$;
