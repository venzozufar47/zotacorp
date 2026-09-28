-- Ticketing System — karyawan Yeobo Space saling melihat antrian tiket AKTIF
-- sesama cabang (termasuk tiket yang dibuat admin/owner utk cabang itu),
-- tanpa bisa melihat cabang lain maupun tiket yang sudah selesai/dibatalkan.
--
-- Cabang seorang karyawan diturunkan dari penugasan presensi yang sudah ada
-- (`employee_locations` → `attendance_locations`, nama "Yeobo Space - <cabang>"
-- — lihat src/lib/location/resolve-location.ts), BUKAN tabel baru: karyawan
-- tanpa penugasan lokasi Yeobo (mis. staf non-Yeobo, atau belum di-assign)
-- otomatis tidak melihat antrian siapa pun lewat policy ini — fail-closed.
--
-- Detail (foto, deskripsi, catatan resolusi/eskalasi/owner) TETAP tidak
-- terlihat: kolom-kolom itu sengaja tidak diselect oleh action baru
-- (getBranchQueue, lihat tickets.actions.ts), dan foto tetap dikunci oleh
-- policy ticket_attach_select_own (106_tickets.sql) yang tidak diubah di
-- sini — melihat baris tiket lewat policy baru ini TIDAK memberi akses ke
-- attachment-nya.

create or replace function public.is_my_yeobo_branch(p_branch text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.employee_locations el
    join public.attendance_locations al on al.id = el.location_id
    where el.employee_id = auth.uid()
      and al.name = 'Yeobo Space - ' || p_branch
  );
$$;

grant execute on function public.is_my_yeobo_branch(text) to authenticated;

-- Tambahan atas ticket_select_own/ticket_manage_all (106_tickets.sql) —
-- policy select bersifat permissive (OR), jadi ini murni menambah akses,
-- tidak pernah mengurangi apa yang sudah bisa dilihat pembuat/head/admin.
drop policy if exists ticket_select_same_branch on public.tickets;
create policy ticket_select_same_branch on public.tickets for select to authenticated
  using (
    status in ('open', 'in_progress', 'escalated', 'owner_handling')
    and public.is_my_yeobo_branch(branch)
  );
