-- Haengbocake Semarang: varian Croissant Garlic Butter & Blueberry tidak ada di pricelist -> hapus dari POS.
-- Aman: keduanya belum punya penjualan, mutasi stok, maupun opname di Semarang. Resep costing-nya dinonaktifkan
-- (bukan dihapus) supaya data bahan tetap ada; tautan pos_variant_id lepas otomatis (ON DELETE SET NULL).
update public.costing_products
set is_active = false, updated_at = now()
where pos_variant_id in ('b5f54743-8f80-4e9c-9b7e-d1357ab94bde', 'db46c18e-1068-4987-9e27-366e1a176750');

delete from public.pos_product_variants
where id in ('b5f54743-8f80-4e9c-9b7e-d1357ab94bde', 'db46c18e-1068-4987-9e27-366e1a176750')
  and not exists (select 1 from public.pos_sale_items i where i.variant_id = pos_product_variants.id)
  and not exists (select 1 from public.pos_stock_opname_items o where o.variant_id = pos_product_variants.id)
  and not exists (select 1 from public.pos_stock_movements m where m.variant_id = pos_product_variants.id);
