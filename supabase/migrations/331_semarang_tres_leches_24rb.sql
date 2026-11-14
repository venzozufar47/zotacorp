-- Haengbocake Semarang: harga Tres Leches Rp23.000 -> Rp24.000 (POS + HPP tertaut). Pare tidak berubah.
-- Sudah diterapkan langsung ke produksi 2026-11-14.
update pos_products set price = 24000
 where id = '0d16f338-ba2d-4a3d-a925-cb9be6958875' and name = 'Tres Leches';
update costing_products set manual_price = 24000
 where id = '530cad7a-93a4-4c84-accf-57df7dd4026c' and pos_product_id = '0d16f338-ba2d-4a3d-a925-cb9be6958875';
