-- Role baru: karyawan yang HANYA boleh lihat Insights Penjualan POS (read-
-- only dashboard: revenue, produk laku, dst) -- tidak bisa input sale,
-- pegang stok, atau lihat cashflow. Ditambahkan sebagai scope ke-3 di
-- bank_account_assignees (sudah ada 'full' dan 'pos_only' sejak 035).
--
-- SENGAJA tidak menyentuh helper RLS `is_admin_or_pos_assignee` atau
-- policy mana pun yang memakainya (pos_products/pos_sales/pos_sale_items/
-- pos_stock_*/bank_accounts, dst) -- scope baru ini TIDAK ikut lolos di
-- situ, jadi otomatis tetap diblokir dari semua operasi POS lain tanpa
-- perlu ubah satu pun policy yang sudah ada. Insights membaca datanya
-- lewat service-role client (gate di level action), bukan lewat RLS.
alter table public.bank_account_assignees
  drop constraint if exists bank_account_assignees_scope_check;
alter table public.bank_account_assignees
  add constraint bank_account_assignees_scope_check
  check (scope in ('full', 'pos_only', 'insights_only'));
