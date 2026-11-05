-- Strawberry Yogurt Millecrepes ditarik dari POS sementara (nonaktif, soft). Costing/HPP-nya TETAP ada dan tetap tertaut
-- ke produk POS ini, jadi tinggal aktifkan kembali (active = true) saat siap dijual.
update public.pos_products set active = false
  where name = 'Strawberry Yogurt Millecrepes'
    and bank_account_id = '947136f6-4458-40e6-9c4b-fd3a2a183a9f';

-- Sourdough Pare (dibuat 2026-11-04) tampil di POS tapi track_stock=false sehingga stoknya tidak bisa diinput: ditarik dulu.
update public.pos_products set active = false
  where name = 'Sourdough'
    and bank_account_id = '947136f6-4458-40e6-9c4b-fd3a2a183a9f'
    and track_stock = false;
