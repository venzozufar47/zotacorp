-- Kategori bahan Haengbocake dirapikan jadi 12 kategori MECE (satu bahan, satu kategori menurut fungsi utamanya):
--   Tepung & Pati · Gula & Pemanis · Susu & Lemak · Telur · Coklat & Kakao · Buah & Kacang · Topping & Isian ·
--   Pengembang, Perisa & Garam · Minuman · Bahan Setengah Jadi · Kemasan & Label · Perlengkapan Saji
-- Hanya label: tidak ada harga/resep/HPP yang berubah. Nilai lama dicadangkan di tabel zz_backup_… (hapus bila sudah yakin).
-- Dijalankan 2026-10-24. "Bubuk Coklat" (bubuk minuman) diganti nama jadi "Bubuk Minuman Coklat".

create table if not exists public.zz_backup_material_categories_20261024 as
  select id, business_unit, name, category from public.costing_materials where business_unit like 'Haengbocake%';
alter table public.zz_backup_material_categories_20261024 enable row level security;

update public.costing_materials m set
  name = case when m.name = 'Bubuk Coklat' then 'Bubuk Minuman Coklat' else m.name end,
  category = case
    when m.category = 'tepung' then 'Tepung & Pati'
    when m.category = 'coklat' then 'Coklat & Kakao'
    when m.category = 'Telur & Buah' then case when m.name ilike 'Telur%' then 'Telur' else 'Buah & Kacang' end
    when m.category = 'Topping & Isian' and m.name = 'Almond' then 'Buah & Kacang'
    when m.category = 'Lain-lain' then 'Topping & Isian'
    when m.category = 'Perisa & Bahan Minuman' then
      case
        when m.name = 'Isian & Topping' then 'Topping & Isian'
        when m.name ilike 'Perisa%' or m.name ilike 'Pewarna%' or m.name ilike 'Vanilla%' then 'Pengembang, Perisa & Garam'
        else 'Minuman'
      end
    when m.category = 'Pengembang & Garam' then 'Pengembang, Perisa & Garam'
    when m.category = 'Pastry Beku' then 'Bahan Setengah Jadi'
    when m.category = 'Kemasan' then
      case when m.name in ('Greeting Card','Lilin','Pisau Cake','Sendok Kayu') then 'Perlengkapan Saji' else 'Kemasan & Label' end
    else m.category
  end
where m.business_unit like 'Haengbocake%';
