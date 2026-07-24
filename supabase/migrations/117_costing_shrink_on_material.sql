-- Susut (penyusutan/waste) dipindah dari baris resep ke bahan: susut
-- adalah sifat bahan (mis. ayam susut saat dimasak), set sekali & berlaku
-- di semua resep. Kolom per-baris resep dihapus.
alter table public.costing_materials
  add column if not exists shrink_factor numeric(6,4) not null default 0;

alter table public.costing_recipe_items
  drop column if exists shrink_factor;
