/**
 * Aturan file bukti foto QRIS — dipakai bersama oleh client (validasi
 * instan saat kasir memilih file) dan server action `attachPosQrisReceipt`
 * supaya keduanya tidak pernah beda aturan.
 *
 * Catatan `accept` di <input type="file">: Chrome Android hanya
 * memunculkan opsi KAMERA kalau `accept` memakai wildcard `image/*`.
 * Kalau diisi daftar subtipe eksplisit (`image/jpeg,image/png,...`),
 * intent chooser tersaring ke app yang mendeklarasikan subtipe itu dan
 * app kamera — yang mengiklankan `image/*` — ikut hilang, sehingga kasir
 * cuma dapat galeri. Karena itu picker sengaja dilonggarkan ke `image/*`
 * dan tipe aslinya divalidasi di sini.
 */

/** Tipe yang diterima server untuk lampiran bukti. */
export const RECEIPT_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

/** Subset khusus alur checkout POS — foto saja, tanpa PDF. */
export const RECEIPT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const RECEIPT_MAX_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Validasi file pilihan kasir. Return pesan error siap-tampil, atau null
 * kalau lolos. Dipanggil SEBELUM sale disimpan supaya kasir tahu lebih
 * awal, bukan setelah transaksi terlanjur tercatat.
 */
export function validateReceiptImage(file: File): string | null {
  if (!RECEIPT_IMAGE_TYPES.includes(file.type)) {
    return "Format foto harus JPG, PNG, atau WEBP";
  }
  if (file.size > RECEIPT_MAX_SIZE) {
    return "Foto maksimal 5MB";
  }
  return null;
}
