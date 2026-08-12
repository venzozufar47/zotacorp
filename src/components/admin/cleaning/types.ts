/** Karyawan yang bisa dipasangi duty kebersihan.
 *
 *  Dulu tinggal di `CleaningAdmin.tsx` — shell 5 tab yang dihapus saat halaman
 *  dilebur jadi satu. Tipe ini dipakai empat komponen, jadi ia butuh rumah yang
 *  bukan komponen. */
export interface CleaningEmployee {
  id: string;
  name: string;
  business_unit: string | null;
}
