-- Sourdough Pare dijual: aktifkan lagi di POS dan nyalakan track_stock supaya stoknya bisa diinput (sebelumnya track_stock=false
-- sehingga tampil di POS tapi tidak bisa dibuat stoknya). Mulai dipantau service level setelah aktif.
update public.pos_products set active = true, track_stock = true
  where name = 'Sourdough'
    and bank_account_id = '947136f6-4458-40e6-9c4b-fd3a2a183a9f';
