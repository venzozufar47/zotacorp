-- Haengbocake Semarang: dua tambahan SOP.
--  1. Checklist baru "Sapu Kotoran Tikus Depan Toko": untuk Sri Nuryati, Senin-Sabtu (hari kerja, libur nasional dilewati),
--     wajib foto, harus selesai sebelum 09:00, dan mengunci absen pulang (block_checkout) sampai selesai.
--  2. Item foto "Meja & kursi pink outdoor" di Opening Store dan Closing Toko Semarang
--     (termasuk salinan Opening Sabtu), disisipkan setelah item meja & kursi indoor.
-- Idempoten: tidak menambah bila checklist/item/penugasan sudah ada.

do $$
declare
  v_loc constant uuid := 'd24ab614-74ed-4a2a-b5af-f158bcb5809f';  -- lokasi absen Haengbocake Semarang
  v_sri uuid;
  v_cl uuid;
  cl record;
  pos int;
begin
  -- 1. Checklist kotoran tikus.
  select id into v_sri from public.profiles where full_name = 'Sri Nuryati' and business_unit = 'Haengbocake' and is_active;
  if v_sri is null then raise exception 'Profil Sri Nuryati tidak ditemukan'; end if;

  select id into v_cl from public.cleaning_checklists where name = 'Sapu Kotoran Tikus Depan Toko Haengbocake Semarang';
  if v_cl is null then
    insert into public.cleaning_checklists (name, description, location_id)
    values ('Sapu Kotoran Tikus Depan Toko Haengbocake Semarang',
            'Setiap hari kerja pagi hari, selesai sebelum jam 09.00.', v_loc)
    returning id into v_cl;
    insert into public.cleaning_checklist_items (checklist_id, title, note, requires_photo, sort_order) values
      (v_cl, 'Kotoran tikus di depan toko',
       'Sapu semua kotoran tikus di area depan toko sampai bersih dan buang ke tempat sampah. Foto area depan toko setelah bersih (foto langsung di pagi hari).',
       true, 0);
  end if;

  if not exists (select 1 from public.cleaning_assignments where checklist_id = v_cl and user_id = v_sri) then
    insert into public.cleaning_assignments
      (checklist_id, user_id, weekdays, block_checkout, window_mode, window_end, skip_holidays, starts_on)
    values (v_cl, v_sri, 126, true, 'before', '09:00', true, date '2026-11-16');
  end if;

  -- 2. Meja & kursi pink outdoor: Opening (setelah "Meja dan kursi").
  for cl in
    select id from public.cleaning_checklists
    where name in ('Opening Store Haengbocake Semarang', 'Opening Store Haengbocake Semarang (salinan)')
  loop
    if not exists (select 1 from public.cleaning_checklist_items where checklist_id = cl.id and title = 'Meja & kursi pink outdoor') then
      select sort_order + 1 into pos from public.cleaning_checklist_items where checklist_id = cl.id and title = 'Meja dan kursi';
      if pos is null then continue; end if;
      update public.cleaning_checklist_items set sort_order = sort_order + 1 where checklist_id = cl.id and sort_order >= pos;
      insert into public.cleaning_checklist_items (checklist_id, title, note, requires_photo, sort_order) values
        (cl.id, 'Meja & kursi pink outdoor',
         'Bersihkan dan lap hingga tidak berdebu. Foto meja dan kursi pink outdoor.',
         true, pos);
      insert into public.cleaning_checklist_revisions (checklist_id, summary)
      values (cl.id, 'Tambah item foto: Meja & kursi pink outdoor');
    end if;
  end loop;

  -- Closing (setelah "Meja & kursi customer").
  for cl in
    select id from public.cleaning_checklists where name = 'Closing Toko Haengbocake Semarang'
  loop
    if not exists (select 1 from public.cleaning_checklist_items where checklist_id = cl.id and title = 'Meja & kursi pink outdoor') then
      select sort_order + 1 into pos from public.cleaning_checklist_items where checklist_id = cl.id and title = 'Meja & kursi customer';
      if pos is null then continue; end if;
      update public.cleaning_checklist_items set sort_order = sort_order + 1 where checklist_id = cl.id and sort_order >= pos;
      insert into public.cleaning_checklist_items (checklist_id, title, note, requires_photo, sort_order) values
        (cl.id, 'Meja & kursi pink outdoor',
         'Bersihkan dan lap hingga tidak berdebu. Foto meja dan kursi pink outdoor.',
         true, pos);
      insert into public.cleaning_checklist_revisions (checklist_id, summary)
      values (cl.id, 'Tambah item foto: Meja & kursi pink outdoor');
    end if;
  end loop;
end $$;
