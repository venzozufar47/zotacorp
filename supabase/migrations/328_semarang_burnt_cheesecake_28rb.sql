-- Haengbocake Semarang: harga Cheesecake (Burnt) Rp25.000 -> Rp28.000 (POS + HPP tertaut). Pare tidak berubah.
-- Sudah diterapkan langsung ke produksi 2026-11-13.
update pos_products set price = 28000
 where id = 'fc86afe9-8f45-4263-9c0b-bed8b1508f09' and name = 'Cheesecake (Burnt)';
update costing_products set manual_price = 28000
 where id = '7168cbc4-631c-483a-a640-2319f8f86381' and pos_product_id = 'fc86afe9-8f45-4263-9c0b-bed8b1508f09';
