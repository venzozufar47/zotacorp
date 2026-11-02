-- Tombol "Ready Cake" lama (harga bebas, varian Bento 10cm / Whole 14cm) dimatikan: kasir kini memilih kue ready yang
-- sungguhan lewat pemilih di tombol Ready Cake baru (SKU stok "Ready Cake"). Dijalankan SETELAH kode baru live.
update public.pos_products
set active = false
where name = 'Ready Cake' and stock_only = false and is_open_price = true and active = true;
