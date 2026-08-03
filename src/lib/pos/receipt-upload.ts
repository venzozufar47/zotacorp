"use client";

import { compressImageFile } from "@/lib/images/compress-image";

/**
 * Kompresi foto bukti QRIS sebelum masuk ke state komponen.
 *
 * WAJIB dilewati SEMUA jalur upload bukti POS. Jalur POS dulunya
 * mengunggah file kamera mentah apa adanya sementara setiap fitur lain
 * (kas, lampiran kue, bukti telat, foto kebersihan) sudah memanggil
 * `compressImageFile`. Akibatnya rata-rata ukuran file di bucket
 * `cashflow-receipts` melonjak dari ~85 KB (Mei) ke ~1,3 MB (Juli) dan
 * bucket itu sendirian memakan 2,5 GB — 87% dari seluruh storage.
 *
 * Dipanggil saat kasir MEMILIH file, bukan saat submit: pekerjaan berat
 * selesai selagi kasir masih meninjau (bukan menambah jeda tepat saat
 * customer menunggu), dan ukuran yang tampil di UI = ukuran yang
 * benar-benar diunggah.
 *
 * PDF lewat tanpa disentuh — `compressImageFile` hanya memproses
 * `image/*` dan mengembalikan file asli kalau hasilnya tidak lebih kecil
 * atau kalau kompresi gagal, jadi upload tidak pernah rusak karenanya.
 */
export async function compressReceiptFile(file: File): Promise<File> {
  return compressImageFile(file);
}
