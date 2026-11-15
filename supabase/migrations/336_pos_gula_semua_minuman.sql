-- 336: Semua minuman wajib pilih tingkat gula, kecuali air putih/air mineral
--
-- Keputusan Owner 2026-11-15. Sebelumnya hanya 5 minuman racikan di
-- produk "Drinks" yang menyala `requires_sugar_level` (migrasi 109). Kini
-- SEMUA varian Drinks menyala (Berry/Peach Americano, Milkyberry Yakult,
-- Mont Blanc, Salted Butterscotch/Vanilla Latte ikut), kecuali Le Mineral
-- (air mineral kemasan, gulanya tak bisa diatur).
--
-- Hanya data: alur tingkat gula di kasir sudah ada, tidak ada perubahan kode.

update public.pos_product_variants v
set requires_sugar_level = true
from public.pos_products p
where v.product_id = p.id
  and p.name = 'Drinks'
  and v.name <> 'Le Mineral'
  and v.requires_sugar_level = false;

-- Le Mineral tidak pernah menanyakan gula (pastikan mati bila ada yang
-- menyalakannya).
update public.pos_product_variants v
set requires_sugar_level = false
from public.pos_products p
where v.product_id = p.id
  and p.name = 'Drinks'
  and v.name = 'Le Mineral'
  and v.requires_sugar_level = true;
