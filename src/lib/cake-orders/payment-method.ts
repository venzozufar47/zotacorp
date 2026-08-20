/**
 * Klasifikasi metode bayar cake → kanal setelmen (cash/qris/lainnya).
 *
 * Dipisah jadi modul dep-free (bisa dipakai client DAN server) supaya
 * satu logika yang sama menentukan baik gerbang server di
 * `pos-cake-pickup.actions.ts` maupun keputusan UI (kapan menampilkan
 * verifikasi uang tunai vs bukti foto QRIS) di `CakePickupList.tsx`.
 * Sebelumnya fungsi ini hidup di file "use server" sehingga tidak bisa
 * diimpor client — client menebak sendiri, dan tebakannya bisa diam-diam
 * berbeda dari keputusan server.
 *
 * Dicocokkan lewat label karena `cake_options` belum punya kolom
 * struktural untuk kanal setelmen. Kalau daftar metode bertambah, kolom
 * struktural jadi pilihan yang lebih benar daripada mencocokkan teks.
 */
export function classifyPaymentMethod(label: string): "cash" | "qris" | null {
  const s = label.trim().toLowerCase();
  if (s.includes("qris")) return "qris";
  if (s.includes("cash") || s.includes("tunai")) return "cash";
  return null;
}
