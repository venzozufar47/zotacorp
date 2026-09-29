"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Memaksa Next.js mengambil ulang data server saat halaman dipulihkan dari
 * bfcache (back/forward cache) browser.
 *
 * Bug yang ini perbaiki: karyawan buka Beranda (lihat "1 tiket menunggu
 * konfirmasimu"), tap kartu → pindah ke /tickets, konfirmasi tiket (server
 * action sukses, `revalidatePath` jalan) → tekan tombol BACK ponsel untuk
 * kembali ke Beranda. Next TIDAK mengambil ulang data di sini — dokumentasi
 * `staleTimes` bilang eksplisit: perilaku back/forward cache SENGAJA tidak
 * dipengaruhi staleTimes/revalidatePath ("to prevent layout shift and to
 * prevent losing the browser scroll position"). Jadi kartu notifikasi yang
 * server-render itu tampil PERSIS snapshot lama — tiket yang baru saja
 * dikonfirmasi masih terlihat "menunggu konfirmasimu". Dari sudut pandang
 * karyawan: tombol konfirmasi ditekan, tapi notifnya tidak pernah hilang.
 *
 * `pageshow` dengan `event.persisted === true` adalah sinyal standar browser
 * untuk "halaman ini baru saja dipulihkan dari bfcache, bukan navigasi
 * baru" — begitu itu terjadi, `router.refresh()` memaksa Server Component
 * di halaman ini mengambil data terbaru tanpa full reload / kehilangan
 * posisi scroll.
 *
 * Dipasang sekali di root layout: bug yang sama berpotensi kena SEMUA kartu
 * ringkasan server-rendered di halaman manapun (kartu kebersihan, coaching,
 * antrean admin, dst), bukan cuma tiket — jadi diperbaiki di satu tempat,
 * bukan ditambal per kartu.
 */
export function BfcacheRefresh() {
  const router = useRouter();

  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) router.refresh();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);

  return null;
}
