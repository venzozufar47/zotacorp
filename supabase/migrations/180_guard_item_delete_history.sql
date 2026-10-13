-- Cegah titik SOP yang sudah punya riwayat dihapus langsung.
--
-- FK cleaning_task_completions.item_id ON DELETE CASCADE membuat penghapusan satu
-- titik ikut menghapus seluruh riwayat foto/centangnya — tanpa jejak. Trigger ini
-- menolak DELETE langsung pada titik yang punya riwayat. Penghapusan SELURUH SOP
-- (cascade dari cleaning_checklists) tetap diizinkan: saat itu baris SOP-nya sudah
-- tidak ada, dan itu keputusan eksplisit yang punya konfirmasi sendiri di UI.
--
-- Untuk membuang titik usang: duplikat SOP-nya, hapus titik itu di salinan (belum
-- punya riwayat), lalu ganti assignment ke salinan.

create or replace function public.cleaning_guard_item_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  -- Cascade dari penghapusan SOP: induknya sudah hilang → lanjutkan.
  if not exists (select 1 from public.cleaning_checklists where id = old.checklist_id) then
    return old;
  end if;
  select count(*) into n from public.cleaning_task_completions where item_id = old.id;
  if n > 0 then
    raise exception 'ITEM_HAS_HISTORY: titik ini punya % catatan riwayat — menghapusnya ikut menghapus riwayat itu', n
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

revoke all on function public.cleaning_guard_item_delete() from public, anon, authenticated;

drop trigger if exists cleaning_guard_item_delete on public.cleaning_checklist_items;
create trigger cleaning_guard_item_delete
  before delete on public.cleaning_checklist_items
  for each row execute function public.cleaning_guard_item_delete();
