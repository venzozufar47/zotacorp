-- SOP lampu LED etalase (properti baru Haengbocake Pare dan Semarang).
--  - Opening Store: dua item foto (rak etalase atas dan bawah), disisipkan setelah "Display & etalase".
--  - Closing Toko : satu item foto (lampu sedang dicharge), disisipkan sebelum "AC & lampu".
-- Idempoten: tidak menambah bila judul item sudah ada di checklist itu.

do $$
declare
  cl record;
  pos int;
begin
  for cl in
    select id, name from public.cleaning_checklists
    where name in ('Opening Store Haengbocake Pare', 'Opening Store Haengbocake Semarang')
  loop
    if not exists (select 1 from public.cleaning_checklist_items where checklist_id = cl.id and title = 'Lampu LED rak etalase atas') then
      select sort_order + 1 into pos from public.cleaning_checklist_items where checklist_id = cl.id and title = 'Display & etalase';
      if pos is null then continue; end if;
      update public.cleaning_checklist_items set sort_order = sort_order + 2 where checklist_id = cl.id and sort_order >= pos;
      insert into public.cleaning_checklist_items (checklist_id, title, note, requires_photo, sort_order) values
        (cl.id, 'Lampu LED rak etalase atas',
         'Pastikan rak etalase atas sudah terpasang lampu LED dan menyala. Setting warna kuning dengan brightness 50%. Foto rak etalase atas dengan lampu menyala.',
         true, pos),
        (cl.id, 'Lampu LED rak etalase bawah',
         'Pastikan rak etalase bawah sudah terpasang lampu LED dan menyala. Setting warna kuning dengan brightness 50%. Foto rak etalase bawah dengan lampu menyala.',
         true, pos + 1);
    end if;
  end loop;

  for cl in
    select id, name from public.cleaning_checklists
    where name in ('Closing Toko Haengbocake Pare', 'Closing Toko Haengbocake Semarang')
  loop
    if not exists (select 1 from public.cleaning_checklist_items where checklist_id = cl.id and title = 'Lampu LED etalase dicharge') then
      select sort_order into pos from public.cleaning_checklist_items where checklist_id = cl.id and title = 'AC & lampu';
      if pos is null then continue; end if;
      update public.cleaning_checklist_items set sort_order = sort_order + 1 where checklist_id = cl.id and sort_order >= pos;
      insert into public.cleaning_checklist_items (checklist_id, title, note, requires_photo, sort_order) values
        (cl.id, 'Lampu LED etalase dicharge',
         'Pastikan lampu LED etalase sedang dicharge, dengan tombol di posisi ON selama dicharge. Foto lampu yang sedang dicharge (kabel terpasang, tombol ON).',
         true, pos);
    end if;
  end loop;
end $$;
